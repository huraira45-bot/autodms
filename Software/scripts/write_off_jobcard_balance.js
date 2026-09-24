/**
 * Writes part of a job card invoice off to an expense account, leaving the
 * customer owing less — without re-dating the invoice.
 *
 *   node scripts/write_off_jobcard_balance.js GR-3432 --customer-pays 65869 \
 *        --to 502001005 --reason "dual tax count on parts, agreed with parts manager"
 *
 * Look only unless --commit is given.
 *
 * Owner ask 2026-09-24: GR-3432 was invoiced 72,603.15 but tax was counted
 * twice on the parts, so the customer is to pay 65,869 and the 6,734.15
 * difference is written off as bad debt against a parts expense account.
 *
 * Re-invoicing would mean unfinalize and finalize again, which re-dates the
 * voucher — an August invoice would land in September and the ageing would
 * reset. So the split is made inside the invoice that already exists:
 *
 *     Dr  customer receivable      65,869.00   (was 72,603.15)
 *     Dr  <the expense account>     6,734.15   (new line, reason recorded)
 *         everything else untouched
 *
 * Total debits, total credits, the voucher's number, date, status and total
 * are all exactly as they were, so the trial balance does not move and the
 * sales tax already declared is untouched. What changes is who bears the
 * 6,734.15: the customer no longer does.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const args = process.argv.slice(2);
const JOB_CARD_NO = args.find(a => !a.startsWith('--'));
const COMMIT = args.includes('--commit');
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const CUSTOMER_PAYS = argVal('--customer-pays') != null ? Number(argVal('--customer-pays')) : null;
const WRITE_OFF_TO = argVal('--to');
const REASON = argVal('--reason');
const BY = argVal('--by') || 'correction script';

const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 });
const round2 = (n) => Math.round(Number(n) * 100) / 100;

if (!JOB_CARD_NO || CUSTOMER_PAYS == null || !WRITE_OFF_TO || !REASON) {
    console.error('usage: node scripts/write_off_jobcard_balance.js <JobCardNo> --customer-pays <amount> --to <GLCode> --reason "why" [--commit] [--by "name"]');
    console.error('');
    console.error('  --customer-pays  what the customer should owe after the write-off');
    console.error('  --to             the GL code, or part of the account name, to charge it to');
    console.error('  --reason         goes on the ledger line; there is no reversal to explain it otherwise');
    process.exit(1);
}
if (!(CUSTOMER_PAYS >= 0)) { console.error('--customer-pays must be a number, 0 or more.'); process.exit(1); }

(async () => {
    const pool = await getPool();
    console.log('Write part of a job card invoice off to an expense account');
    console.log('mode : ' + (COMMIT ? 'COMMIT — the ledger will be changed' : 'LOOK ONLY — nothing is changed'));
    console.log('');

    const jc = (await pool.request().input('no', sql.NVarChar(50), JOB_CARD_NO)
        .query(`SELECT JobCardId, JobCardNo, Status AS PaymentType, PartyID, IsFinalized
                FROM Addata_JobCardInfo WHERE JobCardNo = @no`)).recordset[0];
    if (!jc) { console.error(`No job card ${JOB_CARD_NO}.`); process.exit(1); }
    console.log(`job card : ${jc.JobCardNo} (id ${jc.JobCardId})  payment mode: ${jc.PaymentType}`);

    // Where the write-off is charged. Takes a code, or part of the account's
    // name — typing the name beats looking a code up first, and a placeholder
    // pasted out of instructions then fails loudly with a list to choose from.
    let dest = (await pool.request().input('c', sql.NVarChar(50), WRITE_OFF_TO)
        .query(`SELECT GLCAID, GLCode, GLTitle, isParent, Status FROM GLChartOFAccount WHERE GLCode = @c`)).recordset[0];
    if (!dest) {
        const byName = (await pool.request().input('q', sql.NVarChar(200), `%${WRITE_OFF_TO}%`)
            .query(`SELECT GLCAID, GLCode, GLTitle, isParent, Status FROM GLChartOFAccount
                    WHERE GLTitle LIKE @q AND isParent = 0 AND Status = 1 ORDER BY GLCode`)).recordset;
        if (byName.length === 1) dest = byName[0];
        else if (byName.length > 1) {
            console.error(`\n"${WRITE_OFF_TO}" matches ${byName.length} accounts — be more exact, or give the code:\n`);
            byName.slice(0, 25).forEach(a => console.error(`  ${a.GLCode}  ${a.GLTitle}`));
            process.exit(1);
        }
    }
    if (!dest) {
        console.error(`\nNo account matches "${WRITE_OFF_TO}". Ones you could charge this to:\n`);
        const some = (await pool.request()
            .query(`SELECT TOP 40 GLCode, GLTitle FROM GLChartOFAccount
                    WHERE isParent = 0 AND Status = 1
                      AND (GLTitle LIKE '%MISC%' OR GLTitle LIKE '%BAD DEBT%'
                           OR GLTitle LIKE '%WRITE%' OR GLTitle LIKE '%EXPENSE%')
                    ORDER BY GLCode`)).recordset;
        some.forEach(a => console.error(`  ${a.GLCode}  ${a.GLTitle}`));
        process.exit(1);
    }
    if (dest.isParent) { console.error(`\n${dest.GLCode} is a group account — pick the detail account under it.`); process.exit(1); }
    if (!dest.Status) { console.error(`\n${dest.GLCode} is inactive.`); process.exit(1); }
    console.log(`write-off: ${dest.GLCode} ${dest.GLTitle}`);

    // The customer's leg of the invoice: the debit that is either tagged to a
    // party or sits on the General Customer account. Cost-of-sales and tax
    // legs are deliberately not candidates.
    const gen = (await pool.request()
        .query(`SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey = 'GENERAL_CUSTOMER'`)).recordset[0];
    const legs = (await pool.request()
        .input('jc', sql.Int, jc.JobCardId)
        .input('gen', sql.Int, gen ? gen.GLCAID : -1)
        .query(`SELECT vd.VoucherDetailID, vd.VoucherID, vd.GLCAID, vd.PartyID, vd.Debit, vd.Narration,
                       vi.VoucherNo, vi.VoucherDate, vi.TotalAmount, c.GLCode, c.GLTitle
                FROM   data_FinanceVoucherDetail vd
                JOIN   data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                LEFT   JOIN GLChartOFAccount c ON c.GLCAID = vd.GLCAID
                WHERE  vi.SourceDocType = 'JOBCARD' AND vi.SourceDocID = @jc
                  AND  vi.Status = 'Posted' AND vi.ReversesVoucherID IS NULL
                  AND  vd.Debit > 0
                  AND  (vd.PartyID IS NOT NULL OR vd.GLCAID = @gen)
                ORDER  BY vd.VoucherDetailID`)).recordset;

    if (!legs.length) { console.error('\nNo posted customer receivable line found on this job card.'); process.exit(1); }
    if (legs.length > 1) {
        console.error(`\nThis invoice has ${legs.length} customer legs (an insurance or depreciation split).`);
        legs.forEach(l => console.error(`   ${l.VoucherNo}  ${l.GLCode} ${l.GLTitle}  PKR ${money(l.Debit)}`));
        console.error('Splitting one of several automatically would be guesswork. Tell me which and I will handle it.');
        process.exit(1);
    }

    const leg = legs[0];
    const currently = round2(leg.Debit);
    const writeOff = round2(currently - CUSTOMER_PAYS);

    console.log(`\nINVOICE ${leg.VoucherNo}  dated ${new Date(leg.VoucherDate).toISOString().slice(0, 10)}`);
    console.log(`  customer owes now       PKR ${money(currently).padStart(14)}   on ${leg.GLCode} ${leg.GLTitle}`);
    console.log(`  customer will owe       PKR ${money(CUSTOMER_PAYS).padStart(14)}`);
    console.log(`  written off             PKR ${money(writeOff).padStart(14)}   to ${dest.GLCode} ${dest.GLTitle}`);
    console.log(`  reason                  ${REASON}`);

    if (writeOff <= 0) {
        console.error(`\nThat is not a write-off: the customer already owes ${money(currently)}.`);
        console.error('--customer-pays has to be less than what is on the invoice.');
        process.exit(1);
    }
    if (CUSTOMER_PAYS < 0) { console.error('\n--customer-pays cannot be negative.'); process.exit(1); }

    // Anything already received was received against the full amount.
    const paid = (await pool.request().input('v', sql.Int, leg.VoucherID)
        .query(`SELECT ISNULL(SUM(vd.Credit), 0) AS Allocated
                FROM   data_FinanceVoucherDetail vd
                JOIN   data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                WHERE  vd.AllocatedToVoucherID = @v
                  AND  vi.Status = 'Posted' AND vi.ReversesVoucherID IS NULL`)).recordset[0];
    if (Number(paid.Allocated) > 0) {
        console.error(`\nNOT SAFE. PKR ${money(paid.Allocated)} has already been received against this invoice.`);
        console.error('Reducing it now would leave the receipt and the invoice disagreeing. Sort the receipt out first.');
        process.exit(1);
    }

    if (!COMMIT) {
        console.log('\nNothing was changed. Re-run with --commit to apply.');
        console.log('The voucher keeps its number, date, status and total; total debits and credits do not move.');
        process.exit(0);
    }

    const stamp = `[${new Date().toISOString().slice(0, 10)} ${BY}: ${REASON}]`;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        await new sql.Request(tx)
            .input('id', sql.Int, leg.VoucherDetailID)
            .input('amt', sql.Decimal(18, 2), CUSTOMER_PAYS)
            .input('note', sql.NVarChar(sql.MAX),
                   `${leg.Narration || ''} [reduced from ${money(currently)} to ${money(CUSTOMER_PAYS)} — ${REASON}]`.trim())
            .query(`UPDATE data_FinanceVoucherDetail
                    SET Debit = @amt, Narration = @note
                    WHERE VoucherDetailID = @id`);

        await new sql.Request(tx)
            .input('v',   sql.Int, leg.VoucherID)
            .input('gl',  sql.Int, dest.GLCAID)
            .input('amt', sql.Decimal(18, 2), writeOff)
            .input('jc',  sql.Int, jc.JobCardId)
            .input('nar', sql.NVarChar(sql.MAX),
                   `Written off from ${jc.JobCardNo} invoice ${leg.VoucherNo} ${stamp}`)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                    VALUES (@v, @gl, @nar, @amt, 0, NULL, @jc)`);

        // The subsidiary row is what the walk-in balance is read from, so it
        // has to come down too or the RO still shows the old amount owing.
        const led = await new sql.Request(tx)
            .input('v', sql.Int, leg.VoucherID)
            .input('det', sql.Int, leg.VoucherDetailID)
            .input('gl', sql.Int, leg.GLCAID)
            .input('amt', sql.Decimal(18, 2), CUSTOMER_PAYS)
            .query(`UPDATE dms_PartyLedger
                    SET Debit = @amt
                    WHERE VoucherID = @v
                      AND (VoucherDetailID = @det OR (VoucherDetailID IS NULL AND GLCAID = @gl AND Debit > 0))`);
        console.log(`\n  receivable reduced to PKR ${money(CUSTOMER_PAYS)}`);
        console.log(`  PKR ${money(writeOff)} charged to ${dest.GLCode} ${dest.GLTitle}`);
        console.log(`  ${led.rowsAffected[0]} party-ledger row(s) followed`);
        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('\nNothing was changed — ' + err.message);
        process.exit(1);
    }

    const v = (await pool.request().input('v', sql.Int, leg.VoucherID)
        .query(`SELECT vi.VoucherNo, vi.VoucherDate, vi.Status, vi.TotalAmount,
                       SUM(vd.Debit) AS Dr, SUM(vd.Credit) AS Cr
                FROM   data_FinanceVoucherInfo vi
                JOIN   data_FinanceVoucherDetail vd ON vd.VoucherID = vi.VoucherID
                WHERE  vi.VoucherID = @v
                GROUP  BY vi.VoucherNo, vi.VoucherDate, vi.Status, vi.TotalAmount`)).recordset[0];
    const balanced = Math.abs(Number(v.Dr) - Number(v.Cr)) < 0.01;
    console.log(`\n${v.VoucherNo}  ${new Date(v.VoucherDate).toISOString().slice(0, 10)}  ${v.Status}  `
                + `Dr ${money(v.Dr)}  Cr ${money(v.Cr)}  ${balanced ? 'balanced' : '*** OUT OF BALANCE ***'}`);
    if (!balanced) process.exitCode = 1;
    console.log(`\nDone. ${jc.JobCardNo} now shows PKR ${money(CUSTOMER_PAYS)} outstanding, still dated as it was.`);
    process.exit(process.exitCode || 0);
})().catch(err => { console.error('CRASHED:', err.message); process.exit(1); });
