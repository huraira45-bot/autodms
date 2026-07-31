/**
 * Read-only diagnostic: do the 15 "not found" ROs from
 * backfill_paint_lab_cost.js exist in the Legacy_JobCards shadow table
 * (pre-DMS FIS-system import, migration 091) instead of Addata_JobCardInfo?
 *
 * Makes no writes.
 *
 * RUN:  node scripts\check_legacy_ro.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const MISSING_ROS = [
    'B&P-11919', 'B&P-1206', 'B&P-12067', 'B&P-12066', 'B&P-12062',
    'B&P-12072', 'B&P-12071', 'B&P-12077', 'B&P-12075', 'B&P-12074',
    'B&P-12084', 'B&P-12076', 'B&P-12081', 'B&P-100131', 'B&P-110011',
];
// Also try each with the BRP prefix and with no prefix at all, in case the
// legacy system's WorkOrderNo format differs from the DMS's CardCode-###.
const bareNumbers = MISSING_ROS.map(ro => ro.split('-')[1]);

(async () => {
    const pool = await getPool();

    console.log('\n-- Legacy_JobCards: exact WorkOrderNo match (BRP-#### / B&P-#### / bare number) --');
    for (const num of bareNumbers) {
        const candidates = [`BRP-${num}`, `B&P-${num}`, num];
        for (const c of candidates) {
            const r = await pool.request().input('w', sql.NVarChar(100), c)
                .query(`SELECT LegacyID, WorkOrderNo, JobCardDate, ServiceType, RegistrationNumber, NetAmount, SparesAmount, LubricantsAmount
                        FROM Legacy_JobCards WHERE WorkOrderNo = @w`);
            if (r.recordset.length) {
                const row = r.recordset[0];
                console.log(`  FOUND  ${c}  ->  LegacyID=${row.LegacyID}  Date=${row.JobCardDate ? new Date(row.JobCardDate).toISOString().slice(0,10) : 'NULL'}  ServiceType=${row.ServiceType}  Reg=${row.RegistrationNumber}  NetAmount=${row.NetAmount}  Spares=${row.SparesAmount}  Lubricants=${row.LubricantsAmount}`);
            }
        }
    }

    console.log('\n-- Legacy_JobCards: LIKE search on the bare numbers (in case of extra padding/suffix) --');
    for (const num of bareNumbers) {
        const r = await pool.request().input('w', sql.NVarChar(100), `%${num}%`)
            .query(`SELECT TOP 3 LegacyID, WorkOrderNo, JobCardDate, ServiceType FROM Legacy_JobCards WHERE WorkOrderNo LIKE @w`);
        if (r.recordset.length) {
            r.recordset.forEach(row => {
                console.log(`  LIKE '%${num}%'  ->  WorkOrderNo='${row.WorkOrderNo}'  LegacyID=${row.LegacyID}  Date=${row.JobCardDate ? new Date(row.JobCardDate).toISOString().slice(0,10) : 'NULL'}  ServiceType=${row.ServiceType}`);
            });
        } else {
            console.log(`  LIKE '%${num}%'  ->  no match`);
        }
    }

    console.log('\n-- Distinct ServiceType values + row count in Legacy_JobCards (sanity check) --');
    const st = await pool.request().query(
        `SELECT ServiceType, COUNT(*) AS Cnt FROM Legacy_JobCards GROUP BY ServiceType ORDER BY Cnt DESC`
    );
    console.table(st.recordset);

    console.log('');
    process.exit(0);
})().catch(e => { console.error('check failed:', e.message); process.exit(1); });
