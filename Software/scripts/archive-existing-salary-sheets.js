// Baseline for previously posted months, NOT a reconstruction of their original posted figures.
// Default is read-only. Run with --commit after migration 166 to preserve the current sheets.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');
const snapshots = require('../services/salarySheetSnapshotService');
const { _buildLiveSheet } = require('../controllers/hrSalaryController');

(async () => {
    const pool = await getPool();
    const months = (await pool.request().query(`SELECT DISTINCT p.MonthID FROM hr_SalaryPostings p
        WHERE NOT EXISTS (SELECT 1 FROM hr_SalarySheetSnapshots s WHERE s.MonthID=p.MonthID) ORDER BY p.MonthID`)).recordset;
    const commit = process.argv.includes('--commit');
    console.log(`${months.length} previously posted month(s) without saved sheets. ${commit ? 'Capturing current sheets; not original historical figures.' : 'Dry run; use --commit to capture current sheets.'}`);
    for (const { MonthID } of months) {
        snapshots.validateMonth(MonthID);
        if (!commit) { console.log(`${MonthID}: pending capture`); continue; }
        const tx = new sql.Transaction(pool);
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        try {
            await snapshots.lockMonth(tx, MonthID);
            if (await snapshots.getSnapshot(tx, MonthID)) { await tx.commit(); continue; }
            const postings = await snapshots.getPostings(tx, MonthID);
            if (!postings.length) throw new Error(`No salary posting exists for ${MonthID}.`);
            const sheet = await _buildLiveSheet(tx, MonthID);
            await snapshots.freezeSnapshot(tx, sheet, { userName: 'Salary snapshot deployment baseline' }, 'LEGACY_CURRENT', postings[0].VoucherID);
            await tx.commit();
            console.log(`${MonthID}: saved ${sheet.rows.length} employee rows, labelled captured after posting.`);
        } catch (error) {
            try { await tx.rollback(); } catch {}
            throw error;
        }
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sql.close());
