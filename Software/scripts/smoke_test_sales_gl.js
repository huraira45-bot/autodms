/**
 * Sales-GL smoke test. NOT part of production code; standalone script.
 *
 * Steps:
 *   1. Pick the most-recent BookingConfirmed booking (BK-2026-0013, BookingID 15)
 *   2. Find the latest unposted dms_SalesPayments row for it (or create a tiny one)
 *   3. Call postSalesPaymentVoucher inside a real transaction
 *   4. Roll back so the DB is not mutated
 *   5. Print the voucher header + lines that would have been written
 */
const { sql, getPool } = require('../config/db');
const { postSalesPaymentVoucher } = require('../services/salesPaymentPostingService');
const { postDeliveryVoucher } = require('../services/salesDeliveryPostingService');

(async () => {
    const pool = await getPool();
    const target = await pool.request().query(`
        SELECT TOP 1 b.BookingID, b.BookingNo, b.PartyID, b.NegotiatedPrice, b.AmountPaidToDate,
               (SELECT TOP 1 PaymentID FROM dms_SalesPayments p
                WHERE p.BookingID = b.BookingID AND p.VoucherID IS NULL
                ORDER BY p.ReceivedAt DESC) AS PendingPaymentID
        FROM dms_SalesBookings b
        WHERE b.Status='BookingConfirmed'
        ORDER BY b.BookingID DESC
    `);
    if (!target.recordset.length) { console.log('No BookingConfirmed booking'); process.exit(1); }
    const t = target.recordset[0];
    console.log(`Target booking: ${t.BookingNo} (ID ${t.BookingID})  Paid=${t.AmountPaidToDate}  PendingPaymentID=${t.PendingPaymentID || '(none — will create test payment)'}`);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        let paymentId = t.PendingPaymentID;
        if (!paymentId) {
            const ins = await new sql.Request(tx)
                .input('bid', sql.Int, t.BookingID)
                .query(`DECLARE @ins TABLE (PaymentID INT);
                        INSERT INTO dms_SalesPayments
                          (BookingID, PaymentPath, PaymentMode, Amount, PremiumPortion)
                        OUTPUT INSERTED.PaymentID INTO @ins
                        VALUES (@bid, 'Direct', 'Cash', 100000, 0);
                        SELECT PaymentID FROM @ins;`);
            paymentId = ins.recordset[0].PaymentID;
            console.log(`Created test payment ${paymentId} (PKR 100,000 cash)`);
        }

        const voucherId = await postSalesPaymentVoucher(paymentId, { userId: 999, userName: 'smoke-test' }, tx);
        console.log(`postSalesPaymentVoucher returned VoucherID = ${voucherId}`);

        const hdr = await new sql.Request(tx).input('v', sql.Int, voucherId)
            .query(`SELECT VoucherNo, VoucherDate, TotalAmount, Status, Remarks, SourceDocType, SourceDocID
                    FROM data_FinanceVoucherInfo WHERE VoucherID=@v`);
        console.log('Voucher header:'); console.table(hdr.recordset);

        const lines = await new sql.Request(tx).input('v', sql.Int, voucherId)
            .query(`SELECT GLCAID, Debit, Credit, Narration, BookingID, PartyID FROM data_FinanceVoucherDetail WHERE VoucherID=@v`);
        console.log('Voucher lines:'); console.table(lines.recordset);

        const sub = await new sql.Request(tx).input('v', sql.Int, voucherId)
            .query(`SELECT PartyID, BookingID, GLCAID, Debit, Credit, Narration FROM dms_PartyLedger WHERE VoucherID=@v`);
        console.log('Party ledger writes:'); console.table(sub.recordset);

        // Now try the delivery voucher dry run too
        console.log('\n--- Delivery voucher dry-run for same booking ---');
        try {
            const dvId = await postDeliveryVoucher(t.BookingID, { userId: 999, userName: 'smoke-test' }, tx);
            const dvLines = await new sql.Request(tx).input('v', sql.Int, dvId)
                .query(`SELECT GLCAID, Debit, Credit, Narration FROM data_FinanceVoucherDetail WHERE VoucherID=@v`);
            console.log(`Delivery voucher #${dvId} would write these lines:`);
            console.table(dvLines.recordset);
        } catch (e) { console.log('Delivery dry-run error:', e.message); }

        await tx.rollback();
        console.log('\nROLLED BACK — DB unchanged.');
    } catch (err) {
        await tx.rollback().catch(() => {});
        console.error('Smoke test failed:', err.message);
        process.exit(2);
    }
    process.exit(0);
})();
