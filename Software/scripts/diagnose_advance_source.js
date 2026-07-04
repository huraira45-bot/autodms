/**
 * Per-JC ledger picture for every Job Card whose receipt landed in
 * Customer Advance instead of on the JC's Gen-Cust balance.
 *
 * For each such JC prints:
 *   - The SI (invoice) voucher and its Dr on Gen-Cust
 *   - Every Cr on Gen-Cust tagged with that JC (auto-settle + subsequent
 *     receipts) → this is what closed the AR
 *   - Every Cr on Customer Advance tagged with that JC → the "extra"
 *   - Verdict: DOUBLE (AR was already zero when the Advance Cr posted)
 *              or ORPHAN (no matching Dr on Gen-Cust — receipt against
 *              a non-finalized or unmapped JC).
 *
 * Read-only. Run:  node scripts\diagnose_advance_source.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';

(async () => {
    try {
        const pool = await getPool();
        const roles = await pool.request().query(`
            SELECT RoleKey, GLCAID FROM dms_SystemAccounts
            WHERE RoleKey IN ('CUSTOMER_ADVANCE_RECEIVED','GENERAL_CUSTOMER','POS_CLEARING')`);
        const rm = Object.fromEntries(roles.recordset.map(r => [r.RoleKey, r.GLCAID]));
        const { CUSTOMER_ADVANCE_RECEIVED: caGL, GENERAL_CUSTOMER: gcGL, POS_CLEARING: posGL } = rm;
        if (!caGL || !gcGL) throw new Error('CUSTOMER_ADVANCE_RECEIVED or GENERAL_CUSTOMER role not mapped.');

        // Every JC referenced by a Cr Customer-Advance line
        const jcs = await pool.request().input('ca', sql.Int, caGL)
            .query(`
                SELECT DISTINCT d.JobCardID AS JobCardId, jc.JobCardNo,
                       jc.IsFinalized, jc.PartyID,
                       (SELECT p.PartyName FROM gen_PartiesInfo p WHERE p.PartyID=jc.PartyID) AS PartyName
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                LEFT JOIN Addata_JobCardInfo jc ON jc.JobCardId = d.JobCardID
                WHERE d.GLCAID=@ca AND d.Credit > 0
                  AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
                  AND d.JobCardID IS NOT NULL
                ORDER BY d.JobCardID`);

        if (!jcs.recordset.length) {
            console.log('No Cust Advance credits tagged with a JobCardID. Nothing to diagnose here.');
            process.exit(0);
        }

        console.log(`\nDiagnosing ${jcs.recordset.length} Job Cards with Customer-Advance credits:\n`);
        let totalDouble = 0, totalOrphan = 0;
        for (const j of jcs.recordset) {
            // All Dr on Gen-Cust for this JC (the JC's actual invoiced amount)
            const drGC = await pool.request()
                .input('gl', sql.Int, gcGL).input('jc', sql.Int, j.JobCardId)
                .query(`SELECT ISNULL(SUM(d.Debit),0) AS s
                        FROM data_FinanceVoucherDetail d
                        INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                        WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
                          AND d.GLCAID=@gl AND d.JobCardID=@jc AND d.Debit > 0`);
            // All Cr on Gen-Cust for this JC (settlements)
            const crGC = await pool.request()
                .input('gl', sql.Int, gcGL).input('jc', sql.Int, j.JobCardId)
                .query(`SELECT ISNULL(SUM(d.Credit),0) AS s
                        FROM data_FinanceVoucherDetail d
                        INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                        WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
                          AND d.GLCAID=@gl AND d.JobCardID=@jc AND d.Credit > 0`);
            // All Cr on Customer Advance for this JC (the "extra")
            const crCA = await pool.request()
                .input('gl', sql.Int, caGL).input('jc', sql.Int, j.JobCardId)
                .query(`SELECT ISNULL(SUM(d.Credit),0) AS s
                        FROM data_FinanceVoucherDetail d
                        INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                        WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
                          AND d.GLCAID=@gl AND d.JobCardID=@jc AND d.Credit > 0`);
            // The individual Cust Advance vouchers for this JC (so we know what to reverse)
            const vouchers = await pool.request()
                .input('gl', sql.Int, caGL).input('jc', sql.Int, j.JobCardId)
                .query(`SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, d.Credit
                        FROM data_FinanceVoucherDetail d
                        INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                        WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
                          AND d.GLCAID=@gl AND d.JobCardID=@jc AND d.Credit > 0
                        ORDER BY v.VoucherDate, v.VoucherID`);

            const drGCVal = Number(drGC.recordset[0].s) || 0;
            const crGCVal = Number(crGC.recordset[0].s) || 0;
            const crCAVal = Number(crCA.recordset[0].s) || 0;
            const gcNet   = +(drGCVal - crGCVal).toFixed(2);  // remaining outstanding on Gen-Cust
            // Verdict: if Gen-Cust for this JC is already fully settled (or nearly so), the Cust Advance Cr is a duplicate.
            const verdict = (gcNet <= 0.01)
                ? 'DOUBLE — AR already closed'
                : (drGCVal === 0
                    ? 'ORPHAN — no invoice Dr on Gen-Cust (JC not finalized under Gen-Cust)'
                    : `PARTIAL — Gen-Cust still open by ${fmt(gcNet)}`);
            if (verdict.startsWith('DOUBLE'))  totalDouble += crCAVal;
            if (verdict.startsWith('ORPHAN'))  totalOrphan += crCAVal;

            console.log(`─ JC ${j.JobCardNo || '#'+j.JobCardId}   Party: ${j.PartyName || '—'}   Fin: ${j.IsFinalized ? 'YES':'NO'}`);
            console.log(`    Gen-Cust  Dr ${fmt(drGCVal).padStart(12)}   Cr ${fmt(crGCVal).padStart(12)}   Net (outstanding) ${fmt(gcNet).padStart(12)}`);
            console.log(`    Cust Adv  Cr ${fmt(crCAVal).padStart(12)}   ← ${verdict}`);
            for (const v of vouchers.recordset) {
                console.log(`      · ${dt(v.VoucherDate)}  ${v.VoucherNo.padEnd(14)}  Cr ${fmt(v.Credit).padStart(12)}   VoucherID #${v.VoucherID}`);
            }
            console.log('');
        }

        console.log('─'.repeat(80));
        console.log(`Total looking like DOUBLE (safe to reverse): PKR ${fmt(totalDouble)}`);
        console.log(`Total looking like ORPHAN (JC never finalized or untagged): PKR ${fmt(totalOrphan)}`);
        console.log(`\nNext steps:`);
        console.log(`  1. DOUBLE rows → reverse each Cust-Adv voucher (list above). The reversal`);
        console.log(`     posts Dr Cust Advance / Cr POS_CLEARING and undoes the extra.`);
        console.log(`  2. ORPHAN rows → these are legit customer over-deposits sitting in Advance.`);
        console.log(`     Leave them, OR post a JV that shifts them to the correct destination if`);
        console.log(`     you know where the money should really have gone.`);
        process.exit(0);
    } catch (e) {
        console.error('Diagnose failed:', e.message);
        process.exit(1);
    }
})();
