/**
 * Owner ask 2026-07-04 (revised): rebase every existing PENDING CRD
 * follow-up so its DueDate = the underlying Job Card's FinalizedAt + 2.
 * Earlier rows were created with a next-day (`Date.now()+1`) rule which
 * is now considered wrong.
 *
 * Skips:
 *   - Non-Pending rows (Contacted / NoResponse / Closed) — those already
 *     ran through the CRD workflow with their old date.
 *   - Rows whose JC has no FinalizedAt (shouldn't happen but defensive).
 *
 * Idempotent: the UPDATE sets DueDate to `FinalizedAt + 2` so re-running
 * is a no-op after the first pass.
 *
 * Usage (from D:\saher 2.0\autodms\Software):
 *   node scripts\fix_crd_followup_due_dates.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../config/db');

const DAYS = 2;

(async () => {
    console.log('Connecting to database…');
    const pool = await getPool();
    console.log('Connected.');

    // Preview
    const preview = await pool.request().query(`
        SELECT COUNT(*) AS n
        FROM dms_CRDFollowUps f
        INNER JOIN Addata_JobCardInfo j ON f.JobCardID = j.JobCardId
        WHERE f.Status = 'Pending'
          AND j.FinalizedAt IS NOT NULL
          AND CAST(f.DueDate AS DATE) <> CAST(DATEADD(day, ${DAYS}, j.FinalizedAt) AS DATE)
    `);
    const n = preview.recordset[0].n;
    if (n === 0) {
        console.log('Nothing to fix — every Pending follow-up already has DueDate = FinalizedAt + ' + DAYS + ' days.');
        process.exit(0);
    }
    console.log(`Rebasing ${n} Pending follow-up${n === 1 ? '' : 's'} to FinalizedAt + ${DAYS} days…`);

    const result = await pool.request().query(`
        UPDATE f
        SET DueDate = CAST(DATEADD(day, ${DAYS}, j.FinalizedAt) AS DATE),
            UpdatedAt = SYSUTCDATETIME()
        FROM dms_CRDFollowUps f
        INNER JOIN Addata_JobCardInfo j ON f.JobCardID = j.JobCardId
        WHERE f.Status = 'Pending'
          AND j.FinalizedAt IS NOT NULL
          AND CAST(f.DueDate AS DATE) <> CAST(DATEADD(day, ${DAYS}, j.FinalizedAt) AS DATE);
    `);
    console.log(`✓ Updated ${result.rowsAffected[0]} row${result.rowsAffected[0] === 1 ? '' : 's'}.`);
    process.exit(0);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
