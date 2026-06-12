/**
 * SSR finalize → ledger posting service.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.9 (SSR section).
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { buildSSRJournalLines } = require('../utils/ssrJournalBuilder');

async function resolveSSRAccounts(transaction) {
    const roles = ['CASH_BOOK', 'GENERAL_CUSTOMER', 'GST_PAYABLE', 'POS_CLEARING',
                   'DEFAULT_DISCOUNT_GIVEN', 'CHEQUES_ON_HAND'];
    const out = {};
    for (const r of roles) out[r] = { GLCAID: await resolveRole(r) };
    const byCode = async (code) => {
        const r = await new sql.Request(transaction)
            .input('c', sql.NVarChar(50), code)
            .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c AND Status=1');
        if (!r.recordset.length) throw new Error(`COA account ${code} not found.`);
        return { GLCAID: r.recordset[0].GLCAID };
    };
    out.TRADE_DEBTORS    = await byCode('101005');
    out.PARTS_REVENUE    = await byCode('401002');
    out.COGS_PARTS       = await byCode('501001');
    out.INVENTORY_PARTS  = await byCode('101004');
    return out;
}

async function loadSSRData(returnId, transaction) {
    const hdr = await new sql.Request(transaction)
        .input('id', sql.Int, returnId)
        .query(`SELECT ReturnID, ReturnNo, OriginalSaleID, PartyID, RefundMode, RefundBankID
                FROM data_StoreSaleReturnInfo WHERE ReturnID=@id`);
    if (!hdr.recordset.length) throw new Error(`SSR ${returnId} not found.`);

    const lines = await new sql.Request(transaction)
        .input('id', sql.Int, returnId)
        .query(`SELECT Quantity, SaleRate, TaxPercent, TaxAmount, DiscountAmount, UnitLandedCost
                FROM data_StoreSaleReturnDetail WHERE ReturnID=@id`);

    return { ssr: hdr.recordset[0], lines: lines.recordset };
}

async function resolvePaymentBank(ssr, transaction) {
    if (ssr.RefundMode !== 'Bank Transfer' || !ssr.RefundBankID) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, ssr.RefundBankID)
        .query('SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1');
    if (!r.recordset.length) throw new Error('Bank account for Bank Transfer refund is not active.');
    return { GLCAID: r.recordset[0].GLCAID };
}

async function postSSRVoucher(returnId, userInfo, transaction) {
    const { ssr, lines } = await loadSSRData(returnId, transaction);
    const accounts = await resolveSSRAccounts(transaction);
    const paymentBank = await resolvePaymentBank(ssr, transaction);
    const built = buildSSRJournalLines({ ssr, lines, accounts, paymentBank });

    if (built.lines.length === 0) return null;

    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='SSR'");
    if (!vt.recordset.length) throw new Error('SSR voucher type missing — run migration 001.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        "SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo"
    );
    const voucherNo = `SSR-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

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

    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return voucherId;
}

module.exports = { postSSRVoucher };
