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
 *
 * Both voucher types are created as Draft, not auto-posted (owner ask
 * 2026-08-07) — someone reviews + Finalizes via the normal Voucher screen.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { nextVoucherNo } = require('../utils/voucherNumbering');
const N = require('./salesNarration');

async function loadAccrual(accrualId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, accrualId)
        .query(`SELECT a.AccrualID, a.BookingID, a.EarnerEmployeeID, a.AmountAccrued,
                       a.Status, a.AccrualVoucherID,
                       b.BookingNo, b.PartyID,
                       e.EmployeeName AS EarnerName
                FROM dms_SalesIncentiveAccruals a
                INNER JOIN dms_SalesBookings b ON a.BookingID = b.BookingID
                LEFT  JOIN gen_EmployeeInfo  e ON e.EmployeeId = a.EarnerEmployeeID
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

    const voucherNo = await nextVoucherNo(transaction, 'JV');

    // Cross narration (owner ask 2026-09-18).
    const ctx = await N.loadNarrationContext(transaction, a.BookingID);
    const customer = N.customerText(ctx);
    const forVeh = N.forVehicleAndBooking(ctx);
    const earner = a.EarnerName || `employee #${a.EarnerEmployeeID}`;
    const expenseTitle = await N.accountTitle(transaction, expenseGL);
    const payableTitle = await N.accountTitle(transaction, payableGL);

    const narration = N.line([
        `Staff incentive earned by ${earner} on the sale`,
        forVeh,
        ctx?.PartyName ? `to ${customer}.` : '.',
    ]);

    const hdrRes = await new sql.Request(transaction)
        .input('vd',   sql.DateTime,     new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2), amount)
        .input('src',  sql.NVarChar(50), 'SALES_INCENTIVE_ACCRUAL')
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

    await insertLine(expenseGL, amount, 0, N.line([
        `Staff incentive earned by ${earner} on the sale`,
        forVeh,
        ctx?.PartyName ? `to ${customer}.` : '.',
    ], payableTitle));
    await insertLine(payableGL, 0, amount, N.line([
        `Owed to ${earner} for the sale`,
        forVeh,
        ctx?.PartyName ? `to ${customer}.` : '.',
    ], expenseTitle));

    // Deliberately left as Draft (owner ask 2026-08-07). Unlike Master
    // Invoice/Payment/Delivery, nothing downstream needs to wait for this —
    // the accrual row's own Status='Accrued' is already set unconditionally
    // by the caller regardless of voucher/GL state (same pre-existing
    // pattern as AmountPaidToDate for payments), so there's no booking-side
    // status to defer. No entry needed in salesVoucherPostHookService.js.

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

    const voucherNo = await nextVoucherNo(transaction, vtCode);

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

    const payableTitle = await N.accountTitle(transaction, payableGL);
    const creditTitle = await N.accountTitle(transaction, creditGL);
    const paidBy = dis.mode === 'Cash' ? 'in cash' : `by bank transfer from ${creditTitle || 'the bank account'}`;

    await insertLine(payableGL, amount, 0,
        N.line([`Staff incentive owed to employees settled, paid ${paidBy}.`], creditTitle));
    await insertLine(creditGL, 0, amount,
        N.line([`Staff incentive disbursement paid ${paidBy}.`], payableTitle));

    // Deliberately left as Draft (owner ask 2026-08-07). The accrual rows'
    // DisbursedAmount/Status are already updated unconditionally by the
    // caller before this runs (same pattern as AmountPaidToDate for
    // payments), so there's no booking-side status to defer here either.

    return voucherId;
}

module.exports = { postAccrualVoucher, postDisbursementVoucher };
