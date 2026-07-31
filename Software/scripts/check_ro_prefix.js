/**
 * Read-only diagnostic: does 'BRP' exist as a real, separate CardCode on
 * this database (distinct from 'B&P')? Run before backfill_paint_lab_cost.js
 * --commit if the dry run shows a suspicious number of "not found" B&P ROs.
 *
 * Makes no writes.
 *
 * RUN:  node scripts\check_ro_prefix.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const CHECK_ROS = [
    'BRP-11919', 'B&P-11919',
    'BRP-1206',  'B&P-1206',
    'BRP-0022',  'B&P-0022',
    'BRP-1007',  'B&P-1007',
];

(async () => {
    const pool = await getPool();

    console.log('\n-- gen_JobCardType rows with CardCode BRP or B&P --');
    const types = await pool.request().query(
        `SELECT JobCardTypeId, CardCode, Title, Status FROM gen_JobCardType WHERE CardCode IN ('BRP','B&P') ORDER BY CardCode, Status`
    );
    console.table(types.recordset);

    console.log('\n-- dms_ROCounters for BRP / B&P --');
    const counters = await pool.request().query(
        `SELECT CardCode, CurrentCounter FROM dms_ROCounters WHERE CardCode IN ('BRP','B&P')`
    );
    console.table(counters.recordset);

    console.log('\n-- Which of these RO numbers actually exist? --');
    for (const ro of CHECK_ROS) {
        const r = await pool.request().input('no', sql.NVarChar(100), ro)
            .query(`SELECT JobCardId, JobCardNo, JobCardDate, IsFinalized FROM Addata_JobCardInfo WHERE JobCardNo=@no`);
        if (r.recordset.length) {
            const row = r.recordset[0];
            console.log(`  FOUND     ${ro}  ->  JobCardId=${row.JobCardId}  Date=${new Date(row.JobCardDate).toISOString().slice(0,10)}  Finalized=${row.IsFinalized}`);
        } else {
            console.log(`  not found ${ro}`);
        }
    }
    console.log('');
    process.exit(0);
})().catch(e => { console.error('check failed:', e.message); process.exit(1); });
