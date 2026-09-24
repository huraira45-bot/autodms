/**
 * Moves a job card invoice off a party it should never have been billed to,
 * WITHOUT re-dating it.
 *
 *   node scripts/retag_jobcard_invoice_party.js GR-3432            # look only
 *   node scripts/retag_jobcard_invoice_party.js GR-3432 --commit
 *
 * Owner report 2026-09-24: GR-3432 is a Bank Transfer job card, but its invoice
 * was posted against "CMM GOOD WILL LABOUR EXPENSE GR" because a party had been
 * selected while the card was briefly in Credit mode and was left behind when
 * the mode changed. New job cards cannot do this any more; this repairs one
 * already posted.
 *
 * The obvious repair — unfinalize and finalize again — would stamp the new
 * voucher with today's date, pulling an August invoice into September and
 * distorting both the month and the ageing. So instead this re-tags the
 * receivable leg in place: same voucher, same date, same amounts, moved from
 * the party's account to General Customer and untagged from the party, exactly
 * where a walk-in job card posts it.
 *
 * What it will not do:
 *   - touch a job card that is still on Credit, or still names a party;
 *   - touch an invoice that has had any receipt allocated against it, because
 *     the settlement was made against that party and moving the debit would
 *     leave the allocation pointing at nothing;
 *   - change any amount, or the voucher's date, number or status.
 *
 * Every line it moves gets a note appended to its narration saying what was
 * done, when and by whom, since there is no reversal to show the correction.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const args = process.argv.slice(2);
const JOB_CARD_NO = args.find(a => !a.startsWith('--'));
const COMMIT = args.includes('--commit');
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const BY = argVal('--by') || 'correction script';

const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 });

if (!JOB_CARD_NO) {
    console.error('usage: node scripts/retag_jobcard_invoice_party.js <JobCardNo> [--commit] [--by "your name"]');
    console.error('   eg: node scripts/retag_jobcard_invoice_party.js GR-3432');
    process.exit(1);
}

(async () => {
    const pool = await getPool();
    console.log('Move a job card invoice off the wrong party (the voucher keeps its date)');
    console.log('mode : ' + (COMMIT ? 'COMMIT — the ledger will be changed' : 'LOOK ONLY — nothing is changed'));
    console.log('');

    // ---- the job card ----
    const jc = (await pool.request().input('no', sql.NVarChar(50), JOB_CARD_NO)
        .query(`SELECT j.JobCardId, j.JobCardNo, j.Status AS PaymentType, j.PartyID, j.IsFinalized,
                       t.CardCode, t.ReceivableAccount
                FROM   Addata_JobCardInfo j
                LEFT   JOIN gen_JobCardType t ON t.JobCardTypeId = j.JobTypeId
                WHERE  j.JobCardNo = @no`)).recordset[0];
    if (!jc) { console.error(`No job card ${JOB_CARD_NO}.`); process.exit(1); }
    console.log(`job card : ${jc.JobCardNo} (id ${jc.JobCardId})  payment mode: ${jc.PaymentType}`);

    if (String(jc.PaymentType || '').toLowerCase() === 'credit') {
        console.error('\nThis is a CREDIT job card. Its invoice belongs to the party it names — nothing to move.');
        process.exit(1);
    }
    if (jc.PartyID) {
        console.error(`\nThis job card still names party ${jc.PartyID}. Clear it first, or the next posting`);
        console.error('will put the invoice straight back where it was.');
        process.exit(1);
    }
    if (jc.ReceivableAccount) {
        console.error(`\nThis job card's type (${jc.CardCode}) has a Receivable Account set, so its invoices are`);
        console.error('meant to be billed to a claim party. This script is for walk-in style cards only.');
        process.exit(1);
    }

    // ---- where a walk-in job card's invoice belongs ----
    const gen = (await pool.request()
        .query(`SELECT s.GLCAID, c.GLCode, c.GLTitle
                FROM   dms_SystemAccounts s
                JOIN   GLChartOFAccount c ON c.GLCAID = s.GLCAID
                WHERE  s.RoleKey = 'GENERAL_CUSTOMER'`)).recordset[0];
    if (!gen) { console.error('\nNo GENERAL_CUSTOMER account is configured — set it in System Accounts first.'); process.exit(1); }
    console.log(`moving to: ${gen.GLCode} ${gen.GLTitle}`);

    // ---- the mis-tagged debit lines ----
    const lines = (await pool.request().input('jc', sql.Int, jc.JobCardId)
        .query(`SELECT vd.VoucherDetailID, vd.VoucherID, vd.GLCAID, vd.PartyID, vd.Debit, vd.Narration,
                       vi.VoucherNo, vi.VoucherDate, vi.Status,
                       c.GLCode, c.GLTitle, p.PartyName
                FROM   data_FinanceVoucherDetail vd
                JOIN   data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                LEFT   JOIN GLChartOFAccount c ON c.GLCAID = vd.GLCAID
                LEFT   JOIN gen_PartiesInfo  p ON p.PartyID = vd.PartyID
                WHERE  vi.SourceDocType = 'JOBCARD' AND vi.SourceDocID = @jc
                  AND  vi.Status = 'Posted' AND vi.ReversesVoucherID IS NULL
                  AND  vd.Debit > 0 AND vd.PartyID IS NOT NULL
                ORDER  BY vd.VoucherDetailID`)).recordset;

    if (!lines.length) {
        console.log('\nNothing to move — no posted invoice line on this job card is tagged to a party.');
        process.exit(0);
    }

    console.log('\nLINES THAT WOULD MOVE');
    for (const l of lines) {
        console.log(`  ${l.VoucherNo}  ${new Date(l.VoucherDate).toISOString().slice(0, 10)}  `
                    + `PKR ${money(l.Debit).padStart(14)}`);
        console.log(`      from  ${l.GLCode} ${l.GLTitle}   (party ${l.PartyID} ${l.PartyName})`);
        console.log(`      to    ${gen.GLCode} ${gen.GLTitle}   (no party, job card ${jc.JobCardId})`);
    }

    // ---- refuse if anything has been settled against these invoices ----
    const voucherIds = [...new Set(lines.map(l => l.VoucherID))];
    const allocated = (await pool.request().query(`
        SELECT vi.VoucherNo, SUM(vd.Credit) AS Allocated
        FROM   data_FinanceVoucherDetail vd
        JOIN   data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
        WHERE  vd.AllocatedToVoucherID IN (${voucherIds.join(',')})
          AND  vi.Status = 'Posted' AND vi.ReversesVoucherID IS NULL
        GROUP  BY vi.VoucherNo
        HAVING SUM(vd.Credit) > 0`)).recordset;
    if (allocated.length) {
        console.error(`\nNOT SAFE. Money has already been received against this invoice `
                      + `(${allocated.map(a => `${a.VoucherNo} ${money(a.Allocated)}`).join(', ')}).`);
        console.error('That receipt was allocated to the party this script would move the debit away from.');
        console.error('Void or re-allocate the receipt first.');
        process.exit(1);
    }

    if (!COMMIT) {
        console.log('\nNothing was changed. Re-run with --commit to move it.');
        console.log('The voucher keeps its number, date, status and amounts — only the account and the');
        console.log('party tag on that one debit line change.');
        process.exit(0);
    }

    // ---- move them ----
    const stamp = `[corrected ${new Date().toISOString().slice(0, 10)} by ${BY}: re-tagged from `
                + `${lines[0].GLCode} (party ${lines[0].PartyID}) to ${gen.GLCode}, no party — `
                + `${jc.PaymentType} job card, not a credit sale]`;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        for (const l of lines) {
            await new sql.Request(tx)
                .input('id', sql.Int, l.VoucherDetailID)
                .input('gl', sql.Int, gen.GLCAID)
                .input('note', sql.NVarChar(sql.MAX), `${l.Narration || ''} ${stamp}`.trim())
                .query(`UPDATE data_FinanceVoucherDetail
                        SET GLCAID = @gl, PartyID = NULL, Narration = @note
                        WHERE VoucherDetailID = @id`);

            // The subsidiary ledger carries the same tag and has to follow, or
            // the party's statement still shows the invoice.
            const led = await new sql.Request(tx)
                .input('v',  sql.Int, l.VoucherID)
                .input('det', sql.Int, l.VoucherDetailID)
                .input('p',  sql.Int, l.PartyID)
                .input('gl', sql.Int, gen.GLCAID)
                .input('jc', sql.Int, jc.JobCardId)
                .input('old', sql.Int, l.GLCAID)
                .query(`UPDATE dms_PartyLedger
                        SET PartyID = NULL, JobCardID = @jc, GLCAID = @gl
                        WHERE VoucherID = @v
                          AND (VoucherDetailID = @det
                               OR (VoucherDetailID IS NULL AND PartyID = @p AND GLCAID = @old))`);
            console.log(`  ${l.VoucherNo}: moved PKR ${money(l.Debit)}`
                        + `, ${led.rowsAffected[0]} party-ledger row(s) followed`);
        }
        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('\nNothing was changed — ' + err.message);
        process.exit(1);
    }

    // ---- prove the voucher still balances ----
    const check = (await pool.request().query(`
        SELECT vi.VoucherNo, vi.VoucherDate, SUM(vd.Debit) AS Dr, SUM(vd.Credit) AS Cr
        FROM   data_FinanceVoucherInfo vi
        JOIN   data_FinanceVoucherDetail vd ON vd.VoucherID = vi.VoucherID
        WHERE  vi.VoucherID IN (${voucherIds.join(',')})
        GROUP  BY vi.VoucherNo, vi.VoucherDate`)).recordset;
    console.log('');
    for (const v of check) {
        const balanced = Math.abs(Number(v.Dr) - Number(v.Cr)) < 0.01;
        console.log(`${v.VoucherNo}  ${new Date(v.VoucherDate).toISOString().slice(0, 10)}  `
                    + `Dr ${money(v.Dr)}  Cr ${money(v.Cr)}  ${balanced ? 'balanced' : '*** OUT OF BALANCE ***'}`);
        if (!balanced) process.exitCode = 1;
    }
    console.log('\nDone. The invoice is now a walk-in balance against the job card, still dated as it was.');
    console.log('Collect it in Receive Payment by searching the RO number rather than by party.');
    process.exit(process.exitCode || 0);
})().catch(err => { console.error('CRASHED:', err.message); process.exit(1); });
