/**
 * Quick diagnostic: shows Paint Lab setup readiness on this DB.
 * Run:  node scripts\check_paint_lab_perms.js
 */
require('dotenv').config();
const { getPool } = require('../config/db');

(async () => {
    try {
        const pool = await getPool();
        const [perms, sys, groups] = await Promise.all([
            pool.request().query(`
                SELECT PermissionKey FROM dms_ModulePermissions
                WHERE GroupID=1 AND PermissionKey LIKE 'paint_lab%'
                ORDER BY PermissionKey`),
            pool.request().query(`
                SELECT sa.RoleKey, sa.GLCAID, coa.GLCode, coa.GLTitle
                FROM dms_SystemAccounts sa
                LEFT JOIN GLChartOFAccount coa ON sa.GLCAID = coa.GLCAID
                WHERE sa.RoleKey IN ('PAINT_INVENTORY','PAINT_CONSUMPTION')`),
            pool.request().query(`
                SELECT GroupID, GroupTitle FROM GLUserGroup WHERE GroupID=1`),
        ]);

        console.log('\n--- Paint Lab setup diagnostic ---');
        console.log(`Admin group (GroupID=1): ${groups.recordset[0]?.GroupTitle || 'NOT FOUND'}`);
        console.log(`paint_lab_* permission rows: ${perms.recordset.length}  (expect 35 = 7 modules × 5 keys)`);
        if (perms.recordset.length < 35) {
            console.log('MISSING keys — Paint Lab sidebar will not show for admin.');
            const found = new Set(perms.recordset.map(r => r.PermissionKey));
            const expected = [];
            for (const m of ['paint_lab_dashboard','paint_lab_items','paint_lab_grn','paint_lab_grtn','paint_lab_issue','paint_lab_reports','paint_lab_settings']) {
                expected.push(m);
                for (const s of ['view','insert','edit','delete']) expected.push(`${m}:${s}`);
            }
            const missing = expected.filter(k => !found.has(k));
            console.log('Missing:', missing);
        } else {
            console.log('All 35 paint_lab_* keys are seeded on the admin group.');
        }

        console.log('\n--- System accounts (Paint Lab) ---');
        for (const k of ['PAINT_INVENTORY','PAINT_CONSUMPTION']) {
            const row = sys.recordset.find(x => x.RoleKey === k);
            console.log(`  ${k}: ${row ? `${row.GLCode} · ${row.GLTitle}` : 'NOT MAPPED (set under Accounting Setup)'}`);
        }
        process.exit(0);
    } catch (e) {
        console.error('Diagnostic failed:', e.message);
        process.exit(1);
    }
})();
