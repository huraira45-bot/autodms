/**
 * Sets a posted voucher's date, past the 5-day window the screen enforces.
 *
 *   node scripts/set_voucher_date.js BRV-1833 --date 2026-08-22 --reason "..."
 *   node scripts/set_voucher_date.js BRV-1833 --date 2026-08-22 --reason "..." --commit
 *
 * Look only unless --commit is given.
 *
 * Owner ask 2026-09-24: a bank receipt keyed today for money that arrived on
 * 22 August. Change Date on the voucher screen only moves a CPV/CRV/BPV/BRV
 * inside the last five days (accountController.updateVoucherDate) — the guard
 * that stops somebody quietly shifting a receipt into a closed month. Catching
 * up on a month-old receipt is a real need, but it should be a deliberate act
 * with a reason recorded, not a loosening of that rule for everyone.
 *
 * So: same checks the endpoint makes — a reversing voucher is refused, and so
 * is anything not Draft or Posted — minus the window, plus a reason written
 * into the voucher's remarks. The subsidiary ledger rows move with it, since
 * they date themselves when they are written, not when the money moved.
 *
 * It says plainly when the change crosses a month, because that is the part
 * that shows up in a bank reconciliation.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const args = process.argv.slice(2);
const VOUCHER_NO = args.find(a => !a.startsWith('--'));
const COMMIT = args.includes('--commit');
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const NEW_DATE = argVal('--date');
const REASON = argVal('--reason');
const BY = argVal('--by') || 'correction script';

const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 });
const day = (d) => new Date(d).toISOString().slice(0, 10);

if (!VOUCHER_NO || !NEW_DATE || !REASON) {
    console.error('usage: node scripts/set_voucher_date.js <VoucherNo> --date YYYY-MM-DD --reason "why" [--commit] [--by "name"]');
    console.error('');
    console.error('  --date    the day the money actually moved');
    console.error('  --reason  written into the voucher remarks — this bypasses a control, so it is required');
    process.exit(1);
}

(async () => {
    const pool = await getPool();
    console.log('Set a voucher date');
    console.log('mode : ' + (COMMIT ? 'COMMIT — the voucher will be re-dated' : 'LOOK ONLY — nothing is changed'));
    console.log('');

    // Plain "YYYY-MM-DD" parses as midnight UTC, which is what the driver then
    // stores — the same thing accountController.updateVoucherDate does. Adding
    // "T00:00:00" makes it midnight LOCAL, and on a UTC+5 clock that reaches
    // SQL Server as 19:00 the PREVIOUS day: ask for 22 August and the voucher
    // dates itself 21 August.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(NEW_DATE)) {
        console.error(`"${NEW_DATE}" is not a date. Use YYYY-MM-DD.`);
        process.exit(1);
    }
    const target = new Date(NEW_DATE);
    if (Number.isNaN(target.getTime())) { console.error(`"${NEW_DATE}" is not a date. Use YYYY-MM-DD.`); process.exit(1); }
    if (target.getTime() > Date.now() + 86400000) { console.error('\nA voucher cannot be dated in the future.'); process.exit(1); }
    if (target.getUTCFullYear() < new Date().getUTCFullYear() - 2) {
        console.error(`\n${day(target)} is more than two years back — that looks like a typo rather than a catch-up.`);
        process.exit(1);
    }

    const v = (await pool.request().input('no', sql.NVarChar(50), VOUCHER_NO)
        .query(`SELECT vi.VoucherID, vi.VoucherNo, vi.VoucherDate, vi.Status, vi.ReversesVoucherID,
                       vi.TotalAmount, vi.Remarks, t.Title AS VoucherType
                FROM   data_FinanceVoucherInfo vi
                JOIN   GLVoucherType t ON t.Voucherid = vi.VoucherTypeID
                WHERE  vi.VoucherNo = @no`)).recordset[0];
    if (!v) { console.error(`No voucher ${VOUCHER_NO}.`); process.exit(1); }

    console.log(`voucher : ${v.VoucherNo}  (${v.VoucherType}, ${v.Status})  PKR ${money(v.TotalAmount)}`);
    console.log(`dated   : ${day(v.VoucherDate)}  ->  ${day(target)}`);
    console.log(`reason  : ${REASON}`);

    // The same refusals the screen makes.
    if (v.ReversesVoucherID) { console.error('\nThis voucher reverses another one; its date belongs to the reversal.'); process.exit(1); }
    if (v.Status !== 'Posted' && v.Status !== 'Draft') {
        console.error(`\nThis voucher is "${v.Status}" and cannot be edited.`);
        process.exit(1);
    }
    if (day(v.VoucherDate) === day(target)) { console.log('\nIt is already on that date.'); process.exit(0); }

    const lines = (await pool.request().input('v', sql.Int, v.VoucherID)
        .query(`SELECT c.GLCode, c.GLTitle, vd.Debit, vd.Credit, vd.Narration
                FROM   data_FinanceVoucherDetail vd
                LEFT   JOIN GLChartOFAccount c ON c.GLCAID = vd.GLCAID
                WHERE  vd.VoucherID = @v ORDER BY vd.VoucherDetailID`)).recordset;
    console.log('\nLINES');
    lines.forEach(l => console.log(`  ${(l.GLCode || '').padEnd(11)} ${(l.GLTitle || '').slice(0, 34).padEnd(35)}`
        + `Dr ${money(l.Debit).padStart(13)}   Cr ${money(l.Credit).padStart(13)}`));

    // Compared and printed in UTC throughout, to match how the dates are
    // stored and how day() reads them back.
    const from = new Date(v.VoucherDate);
    const crossesMonth = from.getUTCFullYear() !== target.getUTCFullYear()
                      || from.getUTCMonth() !== target.getUTCMonth();
    if (crossesMonth) {
        const monthOf = (d) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        console.log(`\nNOTE: this moves the voucher from ${monthOf(from)} into ${monthOf(target)}.`);
        lines.filter(l => Number(l.Debit) > 0).forEach(l =>
            console.log(`      ${l.GLTitle} will show PKR ${money(l.Debit)} received on ${day(target)} —`
                        + ` the bank statement has to agree.`));
    }

    if (!COMMIT) {
        console.log('\nNothing was changed. Re-run with --commit to re-date it.');
        process.exit(0);
    }

    const note = `[date changed from ${day(v.VoucherDate)} to ${day(target)} on `
               + `${day(new Date())} by ${BY}: ${REASON}]`;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        await new sql.Request(tx)
            .input('id', sql.Int, v.VoucherID)
            .input('dt', sql.DateTime, target)
            .input('rm', sql.NVarChar(sql.MAX), `${v.Remarks || ''} ${note}`.trim())
            .query(`UPDATE data_FinanceVoucherInfo SET VoucherDate = @dt, Remarks = @rm WHERE VoucherID = @id`);

        // Subsidiary rows stamp themselves when written, so they carry the day
        // the entry was keyed rather than the day the money moved.
        const led = await new sql.Request(tx)
            .input('id', sql.Int, v.VoucherID)
            .input('dt', sql.DateTime, target)
            .query(`UPDATE dms_PartyLedger SET EntryDate = @dt WHERE VoucherID = @id`);
        await tx.commit();
        console.log(`\n  re-dated to ${day(target)}`);
        console.log(`  ${led.rowsAffected[0]} subsidiary ledger row(s) followed`);
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('\nNothing was changed — ' + err.message);
        process.exit(1);
    }

    const after = (await pool.request().input('id', sql.Int, v.VoucherID)
        .query(`SELECT VoucherNo, VoucherDate, Status, TotalAmount FROM data_FinanceVoucherInfo WHERE VoucherID = @id`)).recordset[0];
    console.log(`\n${after.VoucherNo}  ${day(after.VoucherDate)}  ${after.Status}  PKR ${money(after.TotalAmount)}`);
    console.log('The reason is on the voucher remarks, since there is no reversal to explain the change.');
    process.exit(0);
})().catch(err => { console.error('CRASHED:', err.message); process.exit(1); });
