/**
 * GRTN finalize → ledger posting service.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.8.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { buildGRTNJournalLines } = require('../utils/grtnJournalBuilder');

async function resolveGRTNAccounts(transaction) {
    const byCode = async (code) => {
        const r = await new sql.Request(transaction)
            .input('c', sql.NVarChar(50), code)
            .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c AND Status=1');
        if (!r.recordset.length) throw new Error(`COA account ${code} not found.`);
        return { GLCAID: r.recordset[0].GLCAID };
    };
    return {
        INVENTORY_PARTS:          await byCode('101004'),
        INPUT_GST:                { GLCAID: await resolveRole('INPUT_GST') },
        TRADE_CREDITORS:          await byCode('201001'),
        PURCHASE_RETURN_VARIANCE: { GLCAID: await resolveRole('PURCHASE_RETURN_VARIANCE') },
    };
}

async function loadGRTNData(purchaseReturnId, transaction) {
    const hdr = await new sql.Request(transaction)
        .input('id', sql.Int, purchaseReturnId)
        .query(`SELECT PurchaseReturnID, PurchaseReturnNo, PartyID, PurchaseID
                FROM data_PurchaseReturnInfo WHERE PurchaseReturnID=@id`);
    if (!hdr.recordset.length) throw new Error(`GRTN ${purchaseReturnId} not found.`);

    const lines = await new sql.Request(transaction)
        .input('id', sql.Int, purchaseReturnId)
        .query(`SELECT PurchaseReturnDetailID, ItemId, Quantity, ItemRate,
                       TaxRate, TaxAmount, UnitLandedCost
                FROM data_PurchaseReturnDetail WHERE PurchaseReturnID=@id`);

    return { grtn: hdr.recordset[0], lines: lines.recordset };
}

async function postGRTNVoucher(purchaseReturnId, userInfo, transaction) {
    const { grtn, lines } = await loadGRTNData(purchaseReturnId, transaction);
    const accounts = await resolveGRTNAccounts(transaction);
    const built = buildGRTNJournalLines({ grtn, lines, accounts });

    if (built.lines.length === 0) return null;

    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='PRV'");
    if (!vt.recordset.length) throw new Error('PRV voucher type missing — run migration 001.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        "SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo"
    );
    const voucherNo = `PRV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

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

    // Flip to Posted — fires balanced-entry trigger
    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return voucherId;
}

module.exports = { postGRTNVoucher };
