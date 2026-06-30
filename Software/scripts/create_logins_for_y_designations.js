/**
 * One-shot: create a GLUser login for every employee whose DesignationID is in
 * the user-approved "y" list. All logins go into the admin group (GroupID=1)
 * as a temporary blanket-access policy ("for a mean time give them all access
 * to admin", per request 2026-06-29) until per-role permission mapping is done.
 *
 * Username pattern: user001, user002, ... (sequential, padded to 3 digits)
 * Password: user123 (bcrypt-hashed)
 * Each login is linked to its employee via LinkedEmployeeID.
 *
 * Idempotent — skips employees who already have a linked GLUser row.
 *
 *   node Software/scripts/create_logins_for_y_designations.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../config/db');

// DesignationIDs marked "y" in the user's list (2026-06-29)
const Y_DESIGNATION_IDS = [
    64, 65, 66, 67, 68, 71, 72, 73, 74, 75, 76, 77, 78, 80, 82,
    92, 94, 99, 109, 110, 111, 113, 114, 122, 124, 125, 126, 127, 128, 130,
];

const PASSWORD       = 'user123';
const ADMIN_GROUP_ID = 1;
const USERNAME_PREFIX = 'user';

async function main() {
    const pool = await getPool();
    const employees = await pool.request().query(`
        SELECT e.EmployeeID, e.EmployeeName, e.EmployeeNo, e.DesignationID,
               d.DesignationName, dept.DepartmentName
        FROM gen_EmployeeInfo e
        LEFT JOIN gen_DesignationInfo d ON e.DesignationID = d.DesignationID
        LEFT JOIN gen_DepartmentInfo  dept ON e.DepartmentID = dept.DepartmentID
        WHERE e.DesignationID IN (${Y_DESIGNATION_IDS.join(',')})
        ORDER BY e.EmployeeID
    `);
    console.log(`Found ${employees.recordset.length} employees needing access.`);

    // Figure out the next available "userNNN" slot. Sort by N to fill gaps.
    const existing = await pool.request().query(`
        SELECT UserName FROM GLUser WHERE UserName LIKE 'user%'
    `);
    const used = new Set(existing.recordset.map(r => r.UserName.toLowerCase()));
    let seq = 1;
    const nextUsername = () => {
        let u;
        do { u = USERNAME_PREFIX + String(seq++).padStart(3, '0'); }
        while (used.has(u.toLowerCase()));
        used.add(u.toLowerCase());
        return u;
    };

    const hash = await bcrypt.hash(PASSWORD, 10);

    let created = 0, skipped = 0, errors = 0;
    const created_rows = [];

    for (const emp of employees.recordset) {
        try {
            // Skip if this employee already has any GLUser linked to them
            const dup = await pool.request()
                .input('e', sql.Int, emp.EmployeeID)
                .query('SELECT Userid, UserName FROM GLUser WHERE LinkedEmployeeID = @e');
            if (dup.recordset.length) {
                skipped++;
                console.log(`  - skip ${emp.EmployeeName} (already has login: ${dup.recordset[0].UserName})`);
                continue;
            }

            const userName = nextUsername();
            const ins = await pool.request()
                .input('UserName',        sql.NVarChar(100), userName)
                .input('UserPassword',    sql.NVarChar(200), hash)
                .input('GroupID',         sql.Int, ADMIN_GROUP_ID)
                .input('Active',          sql.Bit, 1)
                .input('CompanyID',       sql.Int, 1)
                .input('LinkedEmployeeID',sql.Int, emp.EmployeeID)
                .query(`INSERT INTO GLUser (UserName, UserPassword, GroupID, Active, CompanyID, LinkedEmployeeID)
                        OUTPUT INSERTED.Userid
                        VALUES (@UserName, @UserPassword, @GroupID, @Active, @CompanyID, @LinkedEmployeeID)`);
            const userId = ins.recordset[0].Userid;
            created++;
            created_rows.push({
                Userid: userId,
                UserName: userName,
                Employee: emp.EmployeeName,
                EmpNo: emp.EmployeeNo,
                Designation: emp.DesignationName,
                Department: emp.DepartmentName,
            });
        } catch (err) {
            errors++;
            console.error(`  ✗ ${emp.EmployeeName}: ${err.message}`);
        }
    }

    console.log(`\nDone. created=${created}  skipped(existing)=${skipped}  errors=${errors}`);
    if (created_rows.length) {
        console.log('\nNew logins (username  →  employee | designation | department):');
        for (const r of created_rows) {
            console.log(`  ${r.UserName.padEnd(8)} →  ${r.Employee} | ${r.Designation} | ${r.Department}`);
        }
        console.log(`\nAll passwords: ${PASSWORD}`);
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
