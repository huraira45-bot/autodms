/**
 * Safe deleter for a GLChartOFAccount row created by accident.
 * Owner ask 2026-07-05: delete the "001 / N/A" account.
 *
 * Refuses to delete if the account is referenced by ANY of:
 *   - data_FinanceVoucherDetail (voucher activity)
 *   - dms_PartyLedger            (subsidiary ledger)
 *   - dms_SystemAccounts         (role mapping — CASH_BOOK, POS_CLEARING, etc.)
 *   - dms_BankAccounts           (registered bank account)
 *   - gen_PartiesInfo.PartyGLID  (any party pointing at it)
 *   - gen_JobCardType (Revenue/Receivable accounts)
 *
 * DRY RUN:  node scripts\delete_gl_001_na.js
 * COMMIT:   node scripts\delete_gl_001_na.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const TARGET_CODE  = '001';
const TARGET_TITLE = 'N/A';
const COMMIT = process.argv.includes('--commit');

(async () => {
    try {
        const pool = await getPool();
        console.log(`\nMode: ${COMMIT ? 'COMMIT (delete will happen)' : 'DRY RUN (no writes)'}\n`);

        // 1. Locate the account
        const r = await pool.request()
            .input('c', sql.NVarChar(50), TARGET_CODE)
            .input('t', sql.NVarChar(200), TARGET_TITLE)
            .query(`SELECT GLCAID, GLCode, GLTitle
                    FROM GLChartOFAccount
                    WHERE GLCode=@c OR GLTitle=@t OR GLTitle LIKE '%N/A%'`);
        if (!r.recordset.length) {
            console.log(`No account matches GLCode='${TARGET_CODE}' or GLTitle like '%N/A%'. Nothing to delete.`);
            process.exit(0);
        }

        console.log(`Matching account(s):`);
        for (const a of r.recordset) console.log(`  #${a.GLCAID}  ${a.GLCode.padEnd(12)}  ${a.GLTitle}`);
        console.log('');

        if (r.recordset.length > 1) {
            console.log('More than one match. Refuse to auto-delete — inspect and narrow first.');
            process.exit(1);
        }
        const acct = r.recordset[0];
        const id = acct.GLCAID;

        // 2. Reference checks
        const refs = {};
        const check = async (label, sqlq) => {
            const q = await pool.request().input('id', sql.Int, id).query(sqlq);
            refs[label] = Number(q.recordset[0].n) || 0;
        };
        await check('data_FinanceVoucherDetail',    `SELECT COUNT(*) AS n FROM data_FinanceVoucherDetail WHERE GLCAID=@id`);
        await check('dms_PartyLedger',              `SELECT COUNT(*) AS n FROM dms_PartyLedger        WHERE GLCAID=@id`);
        await check('dms_SystemAccounts',           `SELECT COUNT(*) AS n FROM dms_SystemAccounts     WHERE GLCAID=@id`);
        await check('dms_BankAccounts',             `SELECT COUNT(*) AS n FROM dms_BankAccounts       WHERE GLCAID=@id`);
        await check('gen_PartiesInfo.PartyGLID',    `SELECT COUNT(*) AS n FROM gen_PartiesInfo        WHERE PartyGLID=@id`);
        await check('gen_JobCardType.Revenue/Recv', `SELECT COUNT(*) AS n FROM gen_JobCardType
                                                       WHERE JobRevenueAccount=@id OR PartsRevenueAccount=@id OR ReceivableAccount=@id`);
        // GLChartOFAccount has no ParentID column; hierarchy is stored via
        // AccountLevelOne..Nine code prefixes, not a self-referencing FK, so
        // there's no cascade risk. Reference safety is fully covered by the
        // six other checks above.

        console.log(`Reference counts:`);
        for (const [k, v] of Object.entries(refs)) {
            console.log(`  ${k.padEnd(38)} ${String(v).padStart(6)}`);
        }
        console.log('');

        const total = Object.values(refs).reduce((a, b) => a + b, 0);
        if (total > 0) {
            console.log(`✗ REFUSED — account is referenced by ${total} row(s). Cannot safely delete.`);
            console.log(`  Clear the references first, then re-run.`);
            process.exit(1);
        }
        console.log(`✓ No references found. Safe to delete.`);

        if (!COMMIT) {
            console.log(`\nDRY RUN complete. To delete, re-run with --commit:`);
            console.log(`  node scripts\\delete_gl_001_na.js --commit\n`);
            process.exit(0);
        }

        // 3. Delete
        await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM GLChartOFAccount WHERE GLCAID=@id`);
        console.log(`\n  ✓ Deleted GLCAID=#${id} (${acct.GLCode} · ${acct.GLTitle}).\n`);
        process.exit(0);
    } catch (e) {
        console.error('delete failed:', e.message);
        process.exit(1);
    }
})();
