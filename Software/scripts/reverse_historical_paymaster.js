/**
 * Reverses Pay Master vouchers that were posted against historical bookings.
 *
 *   node scripts/reverse_historical_paymaster.js              # look only
 *   node scripts/reverse_historical_paymaster.js --commit
 *
 * Owner report 2026-09-25: before Pay Master was blocked on historical
 * bookings, it posted a fresh Bank Payment Voucher each time. On an old deal
 * that money left the bank months ago and was already posted, so the bank now
 * shows it leaving twice.
 *
 * Each one is reversed through postReversalVoucher — the same path the
 * unfinalize flow uses — so the correction is a proper mirror voucher with the
 * original left in place and marked Reversed. Nothing is deleted and no
 * history disappears.
 *
 * The reversal carries the BookingID through (fixed the same day), so the
 * booking stops showing the money as paid to Master and the real voucher can
 * then be matched to it on the booking page.
 *
 * It will not touch a voucher on a booking that is not historical, one that is
 * not Posted, or one that has already been reversed.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');
const { postReversalVoucher } = require('../services/voucherReversalService');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const BY = argVal('--by') || 'correction script';
const ONLY = argVal('--voucher');   // optional: do just one

const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 });
const day = (d) => new Date(d).toISOString().slice(0, 10);

(async () => {
    const pool = await getPool();
    console.log('Pay Master vouchers posted against historical bookings');
    console.log('mode : ' + (COMMIT ? 'COMMIT — these will be reversed' : 'LOOK ONLY — nothing is reversed'));
    console.log('');

    const rq = pool.request();
    let only = '';
    if (ONLY) { rq.input('vno', sql.NVarChar(50), ONLY); only = ' AND vi.VoucherNo = @vno'; }

    const rows = (await rq.query(`
        SELECT DISTINCT vi.VoucherID, vi.VoucherNo, vi.VoucherDate, vi.TotalAmount, vi.Status,
               b.BookingID, b.BookingNo, b.IsHistorical, p.PartyName, d.Debit
        FROM   data_FinanceVoucherDetail d
        JOIN   data_FinanceVoucherInfo vi ON vi.VoucherID = d.VoucherID
        JOIN   dms_SalesBookings b  ON b.BookingID = d.BookingID
        LEFT   JOIN gen_PartiesInfo p ON p.PartyID = b.PartyID
        JOIN   dms_SystemAccounts sa ON sa.GLCAID = d.GLCAID AND sa.RoleKey = 'BOOKING_VARIANT_RECEIVABLE'
        WHERE  b.IsHistorical = 1
          AND  vi.SourceDocType = 'PAY_MASTER'
          AND  vi.Status = 'Posted'
          AND  vi.ReversesVoucherID IS NULL
          AND  NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo rv
                            WHERE rv.ReversesVoucherID = vi.VoucherID AND rv.Status = 'Posted')
          ${only}
        ORDER  BY b.BookingNo`)).recordset;

    if (!rows.length) {
        console.log('Nothing to reverse — no Pay Master voucher is posted against a historical booking.');
        process.exit(0);
    }

    console.log('TO REVERSE');
    let total = 0;
    for (const v of rows) {
        console.log(`  ${v.BookingNo.padEnd(14)} ${v.VoucherNo.padEnd(10)} ${day(v.VoucherDate)}  `
                    + `PKR ${money(v.Debit).padStart(15)}   ${v.PartyName || ''}`);
        total += Number(v.Debit);
    }
    console.log(`\n  ${rows.length} voucher(s), PKR ${money(total)} wrongly shown as leaving the bank.`);

    if (!COMMIT) {
        console.log('\nNothing was reversed. Re-run with --commit to reverse them.');
        console.log('Each becomes a mirror voucher; the original stays, marked Reversed.');
        console.log('Afterwards, match each booking to the voucher that really carries the money,');
        console.log('on the booking page — the button reads "Match Master Payment".');
        process.exit(0);
    }

    console.log('\nREVERSING…');
    let ok = 0, failed = 0;
    for (const v of rows) {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const out = await postReversalVoucher(v.VoucherID,
                { userId: null, userName: `${BY} (historical Pay Master correction)` }, tx);
            await tx.commit();
            ok++;
            console.log(`  ${v.VoucherNo} -> ${out?.reversalNo || out?.VoucherNo || 'reversed'}  (${v.BookingNo})`);
        } catch (err) {
            try { await tx.rollback(); } catch {}
            failed++;
            console.error(`  FAILED ${v.VoucherNo} (${v.BookingNo}): ${err.message}`);
        }
    }

    console.log(`\nreversed ${ok}, failed ${failed}`);

    // Show where each booking now stands, so the next step is obvious.
    const after = (await pool.request().query(`
        SELECT b.BookingNo, b.NegotiatedPrice,
               ISNULL(SUM(d.Debit - d.Credit), 0) AS PaidToMaster
        FROM   dms_SalesBookings b
        LEFT   JOIN data_FinanceVoucherDetail d ON d.BookingID = b.BookingID
        LEFT   JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = d.VoucherID AND vi.Status = 'Posted'
        LEFT   JOIN dms_SystemAccounts sa ON sa.GLCAID = d.GLCAID AND sa.RoleKey = 'BOOKING_VARIANT_RECEIVABLE'
        WHERE  b.BookingID IN (${rows.map(r => r.BookingID).join(',')})
          AND  (sa.GLCAID IS NOT NULL OR d.BookingID IS NULL)
        GROUP  BY b.BookingNo, b.NegotiatedPrice
        ORDER  BY b.BookingNo`)).recordset;
    console.log('\nWHERE EACH BOOKING STANDS NOW');
    after.forEach(b => console.log(`  ${b.BookingNo.padEnd(14)} paid to Master PKR ${money(b.PaidToMaster).padStart(15)}`
                                 + `   of PKR ${money(b.NegotiatedPrice)}`));
    console.log('\nNow match each one to the voucher that really carries the money, on the booking page.');
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error('CRASHED:', err.message); process.exit(1); });
