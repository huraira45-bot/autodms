/**
 * Moves a finalized job card, and everything it posted, to another date.
 *
 *   node scripts/set_jobcard_finalize_date.js B&P-1156 2026-09-30
 *   node scripts/set_jobcard_finalize_date.js B&P-1156 2026-09-30 --commit
 *
 * Owner ask 2026-10-01: B&P-1156 was finalized on the wrong day and belongs in
 * September.
 *
 * Finalizing a job card does not stamp one date, it stamps three kinds, and
 * moving only the obvious one leaves the books disagreeing with themselves:
 *
 *   Addata_JobCardInfo.FinalizedAt   when the job card says it closed
 *   data_FinanceVoucherInfo.VoucherDate  the GL vouchers it posted -- a job
 *       card can post more than one (JOBCARD, and JC_ADV_APPLY when a customer
 *       advance was applied), and ALL of them are moved together
 *   dms_PartyLedger.EntryDate        the subsidiary rows behind those vouchers,
 *       which carry their own date and would otherwise still read October
 *
 * The clock time of day is kept. A job card finalized at 09:41 reads as 09:41
 * on the new day, rather than jumping to midnight.
 *
 * Nothing changes without --commit, and everything changes in one transaction:
 * a job card whose vouchers moved but whose ledger did not would be worse than
 * leaving it alone.
 *
 * NOT touched: JobCardDate, ReceiptDate, PromisedDate and the rest, which are
 * what somebody typed in about the car, not when the office closed the job.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const positional = args.filter(a => !a.startsWith('--'));
const JOB_CARD_NO = positional[0];
const NEW_DATE = positional[1];

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const stamp = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '—');
const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 });

if (!JOB_CARD_NO || !/^\d{4}-\d{2}-\d{2}$/.test(NEW_DATE || '')) {
    console.error('Usage: node scripts/set_jobcard_finalize_date.js <JobCardNo> <YYYY-MM-DD> [--commit]');
    console.error('e.g.   node scripts/set_jobcard_finalize_date.js B&P-1156 2026-09-30');
    process.exit(1);
}

(async () => {
    const pool = await getPool();

    const jc = (await pool.request().input('no', sql.NVarChar(100), JOB_CARD_NO).query(`
        SELECT JobCardId, JobCardNo, jobCode, VehicleRegNo, JobCardDate,
               ISNULL(IsFinalized, 0) AS IsFinalized, FinalizedAt, FinalizedByName
        FROM   Addata_JobCardInfo WHERE JobCardNo = @no`)).recordset[0];

    if (!jc) {
        console.error(`No job card numbered ${JOB_CARD_NO}.`);
        process.exit(1);
    }
    if (!jc.IsFinalized) {
        console.error(`${jc.JobCardNo} is not finalized, so it has no finalize date to move.`);
        process.exit(1);
    }

    // Keep the time of day; only the calendar day moves.
    const was = jc.FinalizedAt ? new Date(jc.FinalizedAt) : null;
    const target = new Date(`${NEW_DATE}T${was ? stamp(was).slice(11) : '00:00:00'}Z`);
    if (Number.isNaN(target.getTime())) {
        console.error(`${NEW_DATE} is not a date I can read.`);
        process.exit(1);
    }
    if (target.getTime() > Date.now()) {
        console.error(`${NEW_DATE} is in the future. A job card cannot close before it closes.`);
        process.exit(1);
    }

    // Everything this job card posted. Matched on SourceDocID so a voucher
    // type added later is still caught rather than silently left behind.
    const vouchers = (await pool.request().input('id', sql.Int, jc.JobCardId).query(`
        SELECT VoucherID, VoucherNo, VoucherDate, Status, SourceDocType, TotalAmount,
               ReversesVoucherID
        FROM   data_FinanceVoucherInfo
        WHERE  SourceDocID = @id AND SourceDocType IN ('JOBCARD', 'JC_ADV_APPLY')
        ORDER  BY VoucherID`)).recordset;

    const ledger = vouchers.length
        ? (await pool.request().query(`
            SELECT LedgerID, VoucherID, EntryDate, Debit, Credit
            FROM   dms_PartyLedger
            WHERE  VoucherID IN (${vouchers.map(v => v.VoucherID).join(',')})
            ORDER  BY LedgerID`)).recordset
        : [];

    console.log(`${jc.JobCardNo}${jc.jobCode ? `  (job ${jc.jobCode})` : ''}  ${jc.VehicleRegNo || ''}`);
    console.log(`mode : ${COMMIT ? 'COMMIT — these will be changed' : 'LOOK ONLY — nothing is changed'}`);
    console.log('');
    console.log('WHAT MOVES');
    console.log(`  finalized   ${stamp(jc.FinalizedAt)}  ->  ${stamp(target)}`
                + `${jc.FinalizedByName ? `   by ${jc.FinalizedByName}` : ''}`);
    for (const v of vouchers) {
        console.log(`  ${v.VoucherNo.padEnd(12)} ${day(v.VoucherDate)}  ->  ${day(target)}`
                    + `   ${v.SourceDocType.padEnd(13)} ${v.Status.padEnd(9)} PKR ${money(v.TotalAmount)}`);
    }
    if (!vouchers.length) console.log('  (no GL vouchers found for this job card)');
    console.log(`  ${ledger.length} party-ledger row(s) carrying their own date`);

    console.log('');
    console.log('WHAT IS LEFT ALONE');
    console.log(`  job card date ${day(jc.JobCardDate)} — what was typed in about the car, not when the office closed it`);

    const reversed = vouchers.filter(v => v.Status === 'Reversed' || v.ReversesVoucherID);
    if (reversed.length) {
        console.log('');
        console.log('NOTE: some of these are reversals or have been reversed:');
        reversed.forEach(v => console.log(`  ${v.VoucherNo}  ${v.Status}`));
        console.log('Both sides of a reversal move together, which keeps them cancelling out.');
    }

    if (day(jc.FinalizedAt) === day(target) && vouchers.every(v => day(v.VoucherDate) === day(target))) {
        console.log('\nEverything is already on that date. Nothing to do.');
        process.exit(0);
    }

    if (!COMMIT) {
        console.log('\nNothing was changed. Re-run with --commit to move them.');
        process.exit(0);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        await new sql.Request(tx)
            .input('id', sql.Int, jc.JobCardId)
            .input('d', sql.DateTime, target)
            .query('UPDATE Addata_JobCardInfo SET FinalizedAt = @d WHERE JobCardId = @id');

        for (const v of vouchers) {
            await new sql.Request(tx)
                .input('v', sql.Int, v.VoucherID)
                .input('d', sql.DateTime, target)
                .query('UPDATE data_FinanceVoucherInfo SET VoucherDate = @d WHERE VoucherID = @v');
        }

        if (vouchers.length) {
            await new sql.Request(tx)
                .input('d', sql.DateTime, target)
                .query(`UPDATE dms_PartyLedger SET EntryDate = @d
                        WHERE VoucherID IN (${vouchers.map(v => v.VoucherID).join(',')})`);
        }

        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch { /* already gone */ }
        console.error('\nFAILED — nothing was changed:', err.message);
        process.exit(1);
    }

    // Read it back rather than claim it worked.
    const after = (await pool.request().input('id', sql.Int, jc.JobCardId).query(`
        SELECT FinalizedAt FROM Addata_JobCardInfo WHERE JobCardId = @id`)).recordset[0];
    const vAfter = vouchers.length
        ? (await pool.request().query(`
            SELECT VoucherNo, VoucherDate FROM data_FinanceVoucherInfo
            WHERE VoucherID IN (${vouchers.map(v => v.VoucherID).join(',')}) ORDER BY VoucherID`)).recordset
        : [];

    console.log('\nDONE — read back from the database:');
    console.log(`  finalized   ${stamp(after.FinalizedAt)}`);
    vAfter.forEach(v => console.log(`  ${v.VoucherNo.padEnd(12)} ${day(v.VoucherDate)}`));
    console.log('\nCheck the day book and the party ledger for that date before closing the month.');
    process.exit(0);
})().catch(err => { console.error('CRASHED:', err.message); process.exit(1); });
