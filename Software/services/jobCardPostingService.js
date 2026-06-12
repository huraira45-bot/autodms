/**
 * Job Card finalize → ledger posting service.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.6.
 *
 * Orchestration only — the math lives in utils/jobCardJournalBuilder.js (pure).
 * This service:
 *   - loads job card + labour + sublet + parts within the caller's transaction,
 *   - resolves system accounts via systemAccountsController.resolveRole,
 *   - resolves the Bank account for Bank Transfer mode (from dms_BankAccounts),
 *   - calls the pure builder,
 *   - inserts the voucher header (Status='Posted' — triggers balanced-entry check),
 *   - inserts every detail line and every subsidiary-ledger row,
 *   - returns the new VoucherID.
 *
 * Throws on any error so the caller's transaction rolls back.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { buildJournalLines } = require('../utils/jobCardJournalBuilder');

// Resolve all 12 system roles + the leaf accounts we need (the system-role helper
// already enforces that the role is configured; we read GLCode + Title for narration).
async function resolveAllAccounts(transaction) {
    const roles = [
        'CASH_BOOK', 'GENERAL_CUSTOMER', 'GST_PAYABLE', 'INPUT_GST', 'PST_PAYABLE',
        'POS_CLEARING', 'DEFAULT_DISCOUNT_GIVEN', 'ROUNDING_ADJUSTMENT',
        'PURCHASE_RETURN_VARIANCE', 'CUSTOMER_ADVANCE_RECEIVED', 'SUPPLIER_ADVANCE_PAID',
        'CHEQUES_ON_HAND',
    ];
    const out = {};
    for (const r of roles) {
        out[r] = { GLCAID: await resolveRole(r) };
    }
    // The supporting (non-role) accounts we resolve by their fixed GLCode from migration 002.
    // These are part of the §14.2 hierarchy and known by code; resolving by GLCode is safe.
    const byCode = async (code) => {
        const res = await new sql.Request(transaction)
            .input('c', sql.NVarChar(50), code)
            .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c AND Status=1');
        if (!res.recordset.length) throw new Error(`COA account ${code} not found.`);
        return { GLCAID: res.recordset[0].GLCAID };
    };
    out.TRADE_DEBTORS    = await byCode('101005');
    out.TRADE_CREDITORS  = await byCode('201001');
    out.INVENTORY_PARTS  = await byCode('101004');
    out.PARTS_REVENUE    = await byCode('401002');
    out.SERVICE_REVENUE  = await byCode('401001');
    out.SUBLET_REVENUE   = await byCode('401003');
    out.COGS_PARTS       = await byCode('501001');
    out.SUBLET_COST      = await byCode('502001');
    return out;
}

async function loadJobCardData(jobCardId, transaction) {
    const hdr = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT JobCardId, JobCardNo, JobCardDate, Status AS PaymentType, PartyID, PaymentBankID
                FROM Addata_JobCardInfo WHERE JobCardId=@id`);
    if (!hdr.recordset.length) throw new Error(`Job Card ${jobCardId} not found.`);
    const jobCard = hdr.recordset[0];

    const labour = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT Price, Discount, DiscAmt, DiscType, TaxRate, TaxAmount, Remarks AS WorkDescription
                FROM Addata_JobCardInfoDetail WHERE JobCardId=@id`);

    const sublet = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT VendorID, Remarks, InvoiceAmount, PayableAmount, TaxRate, TaxAmount
                FROM Addata_JobCardInfoSubletJobDetail WHERE JobCardId=@id`);

    // Parts come from data_StockIssuetoJobCardDetail (line table) joined to the issue header.
    // One Job Card may have multiple issue events; we aggregate all their line items.
    const parts = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT d.ItemId, d.IssueQuantity AS Quantity, d.ItemRate AS Rate,
                       d.UnitLandedCost, d.Discount, d.DiscAmt, d.TaxRate, d.TaxAmount
                FROM data_StockIssuetoJobCardDetail d
                INNER JOIN data_StockIssuetoJobCard h ON d.StockIssueID = h.StockIssueID
                WHERE h.JobCardId=@id`);

    return {
        jobCard,
        labourLines: labour.recordset,
        subletLines: sublet.recordset,
        partsLines: parts.recordset,
    };
}

async function resolvePaymentBank(jobCard, transaction) {
    if (jobCard.PaymentType !== 'Bank Transfer' || !jobCard.PaymentBankID) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, jobCard.PaymentBankID)
        .query(`SELECT b.GLCAID FROM dms_BankAccounts b WHERE b.GLCAID=@id AND b.IsActive=1`);
    if (!r.recordset.length) throw new Error('Bank account for Bank Transfer is not active or not configured.');
    return { GLCAID: r.recordset[0].GLCAID };
}

/**
 * Posts the voucher for a finalized Job Card.
 * Must be called inside a transaction that already updated IsFinalized=1.
 * Returns the new VoucherID.
 *
 * @param {number} jobCardId
 * @param {object} userInfo  — { userId, userName }
 * @param {sql.Transaction} transaction
 */
async function postJobCardVoucher(jobCardId, userInfo, transaction) {
    // 1. Load all job-card data
    const { jobCard, labourLines, subletLines, partsLines } = await loadJobCardData(jobCardId, transaction);

    // 2. Resolve all accounts
    const accounts = await resolveAllAccounts(transaction);
    const paymentBank = await resolvePaymentBank(jobCard, transaction);

    // 3. Build journal lines via the pure builder
    const built = buildJournalLines({
        jobCard,
        labourLines, subletLines, partsLines,
        accounts, paymentBank,
    });

    // Refuse to finalize an empty Job Card. Previously this silently returned null,
    // which left IsFinalized=1 with no SI voucher / no party ledger entry — making
    // the JC invisible to Receive Payment and Trial Balance. Force the caller to
    // either add lines or delete the JC.
    if (built.lines.length === 0) {
        throw new Error(`Job Card ${jobCard.JobCardNo} has no labour, sublet, or parts lines — nothing to invoice. Add lines or delete the Job Card.`);
    }

    // 4. Get the SI voucher type ID
    const vt = await new sql.Request(transaction).query(
        "SELECT Voucherid FROM GLVoucherType WHERE Title='SI'"
    );
    if (!vt.recordset.length) throw new Error('SI voucher type missing — run migration 001.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    // 5. Generate voucher number (SI-<sequential>)
    const seqResult = await new sql.Request(transaction).query(
        "SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo"
    );
    const voucherNo = `SI-${String(seqResult.recordset[0].nextNo).padStart(4, '0')}`;

    // 6. Insert header — Status starts as 'Draft', flipped to 'Posted' after detail inserts
    // so the balanced-entry trigger fires once all lines are in place.
    const hdrRes = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,     new Date())
        .input('vno',     sql.NVarChar(50), voucherNo)
        .input('vtId',    sql.Int,          voucherTypeId)
        .input('remarks', sql.NVarChar(sql.MAX), built.header.Narration)
        .input('total',   sql.Decimal(18,2), built.header.TotalAmount)
        .input('src',     sql.NVarChar(20), built.header.SourceDocType)
        .input('srcId',   sql.Int,          built.header.SourceDocID)
        .input('cby',     sql.Int,          userInfo?.userId || null)
        .input('cbyN',    sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @remarks, @total,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    // 7. Insert all detail lines
    for (const line of built.lines) {
        await new sql.Request(transaction)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           line.GLCAID)
            .input('nar',  sql.NVarChar(sql.MAX), line.Narration)
            .input('dr',   sql.Decimal(18,2), line.Debit  || 0)
            .input('cr',   sql.Decimal(18,2), line.Credit || 0)
            .input('pid',  sql.Int,           line.PartyID  || null)
            .input('jcid', sql.Int,           line.JobCardID || null)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid)`);
    }

    // 8. Insert subsidiary ledger rows
    for (const sub of built.subsidiaryWrites) {
        await new sql.Request(transaction)
            .input('pid',  sql.Int,           sub.PartyID || null)
            .input('jcid', sql.Int,           sub.JobCardID || null)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           sub.GLCAID)
            .input('dr',   sql.Decimal(18,2), sub.Debit  || 0)
            .input('cr',   sql.Decimal(18,2), sub.Credit || 0)
            .input('nar',  sql.NVarChar(500), sub.Narration || null)
            .query(`INSERT INTO dms_PartyLedger
                        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @jcid, @vid, @gl, @dr, @cr, @nar)`);
    }

    // 9. Flip Status to 'Posted' — triggers the balanced-entry guard
    await new sql.Request(transaction)
        .input('vid',   sql.Int,            voucherId)
        .input('pby',   sql.Int,            userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return voucherId;
}

module.exports = { postJobCardVoucher, resolveAllAccounts };
