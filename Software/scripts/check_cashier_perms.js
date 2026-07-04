/**
 * Diagnose why the CASHIER role can't see Receive/Make Payment menu items.
 *
 * Prints:
 *   - The CASHIER group's raw permission keys
 *   - The derived "modules" array (which drives the sidebar hasModule() checks)
 *   - Which sidebar entries in Finance & Accounts would show / hide
 *
 * Run:  node scripts\check_cashier_perms.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { derivedModulesFromPermissions } = require('../config/permissions');

(async () => {
    try {
        const pool = await getPool();
        const g = await pool.request()
            .query(`SELECT GroupID, GroupTitle FROM GLUserGroup
                    WHERE GroupTitle LIKE '%CASHIER%'`);
        if (!g.recordset.length) {
            console.log('No group with title matching "CASHIER" — check the title in GLUserGroup.');
            process.exit(1);
        }

        for (const grp of g.recordset) {
            console.log(`\nGroup: ${grp.GroupTitle}   GroupID: ${grp.GroupID}`);

            const perms = await pool.request()
                .input('gid', sql.Int, grp.GroupID)
                .query(`SELECT PermissionKey FROM dms_ModulePermissions
                        WHERE GroupID = @gid
                        ORDER BY PermissionKey`);
            const rawKeys = perms.recordset.map(p => p.PermissionKey);
            const modules = derivedModulesFromPermissions(rawKeys);

            console.log(`\nRaw permission keys (${rawKeys.length}):`);
            rawKeys.forEach(k => console.log('  · ' + k));

            console.log(`\nDerived modules (${modules.length}):`);
            modules.forEach(m => console.log('  · ' + m));

            // Simulate the sidebar for a few important menu items
            const has = (k) => modules.includes(k);
            console.log(`\nSidebar visibility — Finance & Accounts:`);
            console.log(`  Chart of Accounts        (finance_coa)             : ${has('finance_coa') ? 'SHOW' : 'HIDE'}`);
            console.log(`  Vouchers (CPV/CRV/BPV/BRV/JV) (finance_vouchers)   : ${has('finance_vouchers') ? 'SHOW' : 'HIDE'}`);
            console.log(`  Accounting Setup         (accounting_setup)        : ${has('accounting_setup') ? 'SHOW' : 'HIDE'}`);
            console.log(`  Business Profile         (settings_business_profile): ${has('settings_business_profile') ? 'SHOW' : 'HIDE'}`);
            console.log(`  Receive Payment          (payments)                 : ${has('payments') ? 'SHOW' : 'HIDE'}`);
            console.log(`  Make Payment             (payments)                 : ${has('payments') ? 'SHOW' : 'HIDE'}`);
            console.log(`  POS Settlement           (payments)                 : ${has('payments') ? 'SHOW' : 'HIDE'}`);
            console.log(`  Cheque Clearance         (finance_cheques)          : ${has('finance_cheques') ? 'SHOW' : 'HIDE'}`);

            // Users in this group
            const users = await pool.request()
                .input('gid', sql.Int, grp.GroupID)
                .query(`SELECT UserName, UserID, Active FROM GLUser WHERE GroupID = @gid`);
            console.log(`\nUsers in this group (${users.recordset.length}):`);
            users.recordset.forEach(u => console.log(`  · ${u.UserName} (UserID=${u.UserID})  Active=${u.Active ? 'YES' : 'NO'}`));
        }

        console.log('\n──────────────────────────────────────────────────────');
        console.log('If any of the above show HIDE for the menu you expect:');
        console.log('  1. Grant the missing key under Role Permissions.');
        console.log('  2. Log the affected user out and back in (JWT payload');
        console.log('     is refreshed at every /api/auth/me call, but the');
        console.log('     initial modules array in localStorage sticks until');
        console.log('     re-login).');
        process.exit(0);
    } catch (e) {
        console.error('Check failed:', e.message);
        process.exit(1);
    }
})();
