/**
 * Sales Incentive → ledger posting service.
 *
 * Two events post here:
 *
 * A. Accrual (when staff incentive is earned per Decision #8 — at booking save
 *    or per-policy trigger). One voucher per accrual row:
 *      Dr STAFF_INCENTIVE_EXPENSE
 *      Cr STAFF_INCENTIVE_PAYABLE
 *
 * B. Disbursement (when admin pays accrued incentive — cash or bank):
 *      Dr STAFF_INCENTIVE_PAYABLE
 *      Cr CASH_BOOK / <bank>
 *
 * Accrual reversal (when a booking is cancelled): reuses the accrual voucher
 * with flipped Dr/Cr — handled by voucherReversalService (existing pattern),
 * not by this service directly.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');

async function loadAccrual(accrualId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, accrualId)
        .query(`SELECT a.AccrualID, a.BookingID, a.EarnerEmployeeID, a.AmountAccrued,
                       a.Status, a.AccrualVoucherID,
                       b.BookingNo, b.PartyID
                FROM dms_SalesIncentiveAccruals a
                INNER JOIN dms_SalesBookings b ON a.BookingID = b.BookingID
                WHERE a.AccrualID = @id`);
    if (!r.recordset.length) throw new Error(`Accrual ${accrualId} not found.`);
    return r.recordset[0];
}

/**
 * Posts the accrual voucher for a single staff-incentive accrual row.
 * @returns {number} VoucherID
 */
async function postAccrualVoucher(accrualId, userInfo, transaction) {
    const a = await loadAccrual(accrualId, transaction);
    const amount = Number(a.AmountAccrued || 0);
    if (amount <= 0) return null;
    if (a.AccrualVoucherID) return a.AccrualVoucherID;   // idempotent — already posted

    const expenseGL = await resolveRole('STAFF_INCENTIVE_EXPENSE');
    const payableGL = await resolveRole('STAFF_INCENTIVE_PAYABLE');

    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
    if (!vt.recordset.length) throw new Error('JV voucher type missing');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo`);
    const voucherNo = `JV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const narration = `Staff incentive accrued — booking ${a.BookingNo}, employee #${a.EarnerEmployeeID}`;

    const hdrRes = await new sql.Request(transaction)
        .input('vd',   sql.DateTime,     new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2), amount)
        .input('src',  sql.NVarChar(20), 'SALES_INCENTIVE_ACCRUAL')
        .input('srcId',sql.Int,          a.AccrualID)
        .input('cby',  sql.Int,          userInfo?.userId || null)
        .input('cbyN', sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    const insertLine = async (glcaid, dr, cr, lineNar) => {
        await new sql.Request(transaction)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, glcaid)
            .input('nar', sql.NVarChar(sql.MAX), lineNar)
            .input('dr',  sql.Decimal(18,2), dr || 0)
            .input('cr',  sql.Decimal(18,2), cr || 0)
            .input('bid', sql.Int, a.BookingID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, BookingID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @bid)`);
    };

    await insertLine(expenseGL, amount, 0, `Incentive expense — ${a.BookingNo}`);
    await insertLine(payableGL, 0, amount, `Owed to employee #${a.EarnerEmployeeID}`);

    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Stamp back
    await new sql.Request(transaction)
        .input('aid', sql.Int, accrualId)
        .input('vid', sql.Int, voucherId)
        .input('vno', sql.NVarChar(50), voucherNo)
        .query(`UPDATE dms_SalesIncentiveAccruals
                SET AccrualVoucherID=@vid, AccrualVoucherNo=@vno
                WHERE AccrualID=@aid`);

    return voucherId;
}

/**
 * Posts the disbursement voucher.
 *
 * @param {object} dis - { totalAmount, bankAccountId|null, mode: 'Cash'|'Bank',
 *                         narration, sourceDocId (DisbursementID) }
 * @returns {number} VoucherID
 */
async function postDisbursementVoucher(dis, userInfo, transaction) {
    const amount = Number(dis.totalAmount || 0);
    if (amount <= 0) return null;

    const payableGL = await resolveRole('STAFF_INCENTIVE_PAYABLE');
    let creditGL;
    if (dis.mode === 'Cash') {
        creditGL = await resolveRole('CASH_BOOK');
    } else {
        if (!dis.bankAccountId) throw new Error('bankAccountId is required for non-cash disbursement.');
        const bk = await new sql.Request(transaction)
            .input('id', sql.Int, dis.bankAccountId)
            .query(`SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1`);
        if (!bk.recordset.length) throw new Error('Bank account not active.');
        creditGL = bk.recordset[0].GLCAID;
    }

    const vtCode = dis.mode === 'Cash' ? 'CPV' : 'BPV';
    const vt = await new sql.Request(transaction).query(`SELECT Voucherid FROM GLVoucherType WHERE Title='${vtCode}'`);
    if (!vt.recordset.length) throw new Error(`${vtCode} voucher type missing`);
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo`);
    const voucherNo = `${vtCode}-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const narration = dis.narration || `Staff incentive disbursement #${dis.sourceDocId || ''}`;

    const hdrRes = await new sql.Request(transaction)
        .input('vd',   sql.DateTime,     new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2), amount)
        .input('src',  sql.NVarChar(20), 'SALES_INCENTIVE_DISB')
        .input('srcId',sql.Int,          dis.sourceDocId || null)
        .input('cby',  sql.Int,          userInfo?.userId || null)
        .input('cbyN', sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    const insertLine = async (glcaid, dr, cr, lineNar) => {
        await new sql.Request(transaction)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, glcaid)
            .input('nar', sql.NVarChar(sql.MAX), lineNar)
            .input('dr',  sql.Decimal(18,2), dr || 0)
            .input('cr',  sql.Decimal(18,2), cr || 0)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit)
                    VALUES (@vid, @gl, @nar, @dr, @cr)`);
    };

    await insertLine(payableGL, amount, 0, 'Incentive payable settled');
    await insertLine(creditGL,  0, amount, dis.mode === 'Cash' ? 'Cash paid out' : 'Bank disbursement');

    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return voucherId;
}

module.exports = { postAccrualVoucher, postDisbursementVoucher };
