/**
 * One-shot importer for "employees for software.xlsx".
 *
 * For each row in the spreadsheet:
 *   1. Resolves or creates a row in gen_DepartmentInfo (by exact DepartmentName).
 *   2. Resolves or creates a row in gen_DesignationInfo (by exact DesignationName —
 *      typos/duplicate-looking names are kept verbatim per user instruction).
 *   3. Resolves the employee's EmployeeGLID:
 *        - If the spreadsheet has a numeric GL ID treated as a GLCode (e.g. 102004071),
 *          look up that GLCode under 102004. If missing, insert a new COA leaf with
 *          that exact code under the parent.
 *        - If the GL ID is blank, auto-allocate the next 102004NNN code under 102004.
 *   4. Inserts a row into gen_EmployeeInfo. Existing rows with the same EmployeeNo
 *      are skipped (idempotent — safe to re-run).
 *
 * Run:
 *   node Software/scripts/import_employees.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const XLSX = require('xlsx');
const { sql, getPool } = require('../config/db');

const SOURCE = 'c:/Users/ServerDeskop/Desktop/db1/employees for software.xlsx';
const PARENT_CODE = '102004';   // Staff Receivables & Advances

const trimWs = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const cleanCNIC = (s) => trimWs(s).replace(/[^0-9-]/g, '');

// Excel date serial -> JS Date  (1900 base, with the famous 1900-02-29 bug)
function excelDateToISO(serial) {
    if (!serial && serial !== 0) return null;
    const n = Number(serial);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Excel: 1 = 1900-01-01. Adjust by 25569 days to UNIX epoch + Excel's day-zero shift.
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > 2100) return null;
    return d.toISOString().slice(0, 10);
}

async function main() {
    console.log('Reading', SOURCE);
    const wb = XLSX.readFile(SOURCE);
    const sh = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
    // Row 0 = header; data = rows where Full Name (col 2) is non-empty.
    const dataRows = rows.slice(1).filter(r => trimWs(r[2]));
    console.log('Spreadsheet data rows:', dataRows.length);

    const pool = await getPool();

    // 1. Find parent GLCAID for 102004
    const parentRow = await pool.request()
        .input('code', sql.NVarChar(50), PARENT_CODE)
        .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode = @code');
    if (!parentRow.recordset.length) {
        console.error(`Parent COA leaf ${PARENT_CODE} not found — aborting.`);
        process.exit(1);
    }
    const parentGLCAID = parentRow.recordset[0].GLCAID;
    console.log(`Parent ${PARENT_CODE} = GLCAID ${parentGLCAID}`);

    // Caches
    const deptCache = new Map();   // name -> id
    const desigCache = new Map();  // name -> id
    const glCodeCache = new Map(); // GLCode -> GLCAID

    async function getOrCreateDept(name) {
        const k = trimWs(name);
        if (!k) return null;
        if (deptCache.has(k)) return deptCache.get(k);
        const ex = await pool.request()
            .input('n', sql.NVarChar(100), k)
            .query('SELECT DepartmentID FROM gen_DepartmentInfo WHERE DepartmentName = @n');
        if (ex.recordset.length) { deptCache.set(k, ex.recordset[0].DepartmentID); return ex.recordset[0].DepartmentID; }
        const ins = await pool.request()
            .input('n', sql.NVarChar(100), k)
            .query(`INSERT INTO gen_DepartmentInfo (DepartmentName, CompanyID, EntryUserID, EntryUserDateTime)
                    OUTPUT INSERTED.DepartmentID
                    VALUES (@n, 1, 1, GETDATE())`);
        const id = ins.recordset[0].DepartmentID;
        deptCache.set(k, id);
        console.log(`  +dept "${k}" = ${id}`);
        return id;
    }

    async function getOrCreateDesignation(name) {
        const k = trimWs(name);
        if (!k) return null;
        if (desigCache.has(k)) return desigCache.get(k);
        const ex = await pool.request()
            .input('n', sql.NVarChar(100), k)
            .query('SELECT DesignationID FROM gen_DesignationInfo WHERE DesignationName = @n');
        if (ex.recordset.length) { desigCache.set(k, ex.recordset[0].DesignationID); return ex.recordset[0].DesignationID; }
        const ins = await pool.request()
            .input('n', sql.NVarChar(100), k)
            .query(`INSERT INTO gen_DesignationInfo (DesignationName, CompanyID, EntryUserID, EntryUserDateTime)
                    OUTPUT INSERTED.DesignationID
                    VALUES (@n, 1, 1, GETDATE())`);
        const id = ins.recordset[0].DesignationID;
        desigCache.set(k, id);
        console.log(`  +desig "${k}" = ${id}`);
        return id;
    }

    async function nextAutoCode() {
        // Pick the next available GLCode under 102004NNN
        const r = await pool.request()
            .input('p', sql.NVarChar(50), `${PARENT_CODE}%`)
            .query(`SELECT MAX(GLCode) AS maxCode FROM GLChartOFAccount
                    WHERE GLCode LIKE @p AND GLCode <> '${PARENT_CODE}'`);
        const max = r.recordset[0].maxCode;
        if (!max) return PARENT_CODE + '001';
        const suffix = parseInt(max.slice(-3)) + 1;
        return PARENT_CODE + String(suffix).padStart(3, '0');
    }

    async function getOrCreateGLForEmployee(rawCode, fullName) {
        let code = String(rawCode || '').trim();
        // Excel may parse numeric values; coerce to string and pad if it dropped the leading zeros
        if (code && /^\d+$/.test(code) && !code.startsWith(PARENT_CODE)) {
            // Some rows had GL ID as plain numbers under the parent — treat as suffix
            code = PARENT_CODE + code.padStart(3, '0');
        }
        if (!code) {
            code = await nextAutoCode();
        }
        if (glCodeCache.has(code)) return { GLCAID: glCodeCache.get(code), GLCode: code, created: false };

        const ex = await pool.request()
            .input('c', sql.NVarChar(50), code)
            .query('SELECT GLCAID FROM GLChartOFAccount WHERE GLCode = @c');
        if (ex.recordset.length) {
            glCodeCache.set(code, ex.recordset[0].GLCAID);
            return { GLCAID: ex.recordset[0].GLCAID, GLCode: code, created: false };
        }
        // Create a new leaf under 102004
        const ins = await pool.request()
            .input('GLTitle',         sql.NVarChar(200), trimWs(fullName))
            .input('GLCode',          sql.NVarChar(50),  code)
            .input('GLLevel',         sql.Int, 4)
            .input('GLNature',        sql.TinyInt, 1)        // 1 = Debit (asset)
            .input('GLType',          sql.Int, 0)
            .input('isParent',        sql.Int, 0)
            .input('Companyid',       sql.Int, 1)
            .input('Status',          sql.Bit, 1)
            .input('AccountLevelOne', sql.NVarChar(50), '01')
            .input('ReadOnly',        sql.Bit, 0)
            .query(`INSERT INTO GLChartOFAccount (GLTitle, GLCode, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
                    OUTPUT INSERTED.GLCAID
                    VALUES (@GLTitle, @GLCode, @GLLevel, @GLNature, @GLType, @isParent, @Companyid, @Status, @AccountLevelOne, @ReadOnly)`);
        const newId = ins.recordset[0].GLCAID;
        glCodeCache.set(code, newId);
        console.log(`  +COA leaf ${code} "${trimWs(fullName)}" = GLCAID ${newId}`);
        return { GLCAID: newId, GLCode: code, created: true };
    }

    let inserted = 0, skipped = 0, errors = 0;

    for (const r of dataRows) {
        const empNo      = trimWs(r[0]);
        const glIdRaw    = r[1];
        const fullName   = trimWs(r[2]).replace(/\s+/g, ' ');
        const father     = trimWs(r[3]);
        const gender     = trimWs(r[4]) || 'Male';
        const cnic       = cleanCNIC(r[5]);
        const dob        = excelDateToISO(r[6]);
        const mobile     = trimWs(r[7]);
        const address    = trimWs(r[8]);
        const email      = trimWs(r[9]);
        const deptName   = trimWs(r[10]);
        const desigName  = trimWs(r[11]);
        const machineId  = r[12] && /^\d+$/.test(String(r[12]).trim()) ? parseInt(String(r[12]).trim()) : null;
        const salary     = Number(r[13]) || 0;

        try {
            // Skip if already present (idempotent re-run)
            if (empNo) {
                const dup = await pool.request()
                    .input('n', sql.NVarChar(50), empNo)
                    .query('SELECT EmployeeID FROM gen_EmployeeInfo WHERE EmployeeNo = @n');
                if (dup.recordset.length) { skipped++; continue; }
            }

            const deptId  = await getOrCreateDept(deptName);
            const desigId = await getOrCreateDesignation(desigName);
            const gl      = await getOrCreateGLForEmployee(glIdRaw, fullName);

            await pool.request()
                .input('EmployeeName',     sql.VarChar(200), fullName)
                .input('FatherName',       sql.VarChar(200), father)
                .input('CNICno',           sql.VarChar(50),  cnic)
                .input('MobileNo',         sql.NChar(50),    mobile)
                .input('EmailAddress',     sql.VarChar(200), email)
                .input('PermanentAddress', sql.VarChar(500), address)
                .input('DOB',              sql.Date,         dob)
                .input('EmployeeGender',   sql.VarChar(20),  gender)
                .input('BasicSalary',      sql.Numeric(18, 2), salary)
                .input('EmployeeGLID',     sql.Int, gl.GLCAID)
                .input('MachineId',        sql.Int, machineId)
                .input('EmployeeNo',       sql.NVarChar(50), empNo)
                .input('DepartmentID',     sql.Int, deptId)
                .input('DesignationID',    sql.Int, desigId)
                .input('CompanyID',        sql.Int, 1)
                .input('EntryUserID',      sql.Int, 1)
                .input('IsActive',         sql.Bit, 1)
                .input('IsTechnician',     sql.Bit, 0)
                .query(`INSERT INTO gen_EmployeeInfo (
                            EmployeeName, FatherName, CNICno, MobileNo, EmailAddress, PermanentAddress,
                            DOB, EmployeeGender, BasicSalary, EmployeeGLID, MachineId, EmployeeNo,
                            DepartmentID, DesignationID, CompanyID, EntryUserID, EntryUserDateTime,
                            IsActive, IsTechnician
                        ) VALUES (
                            @EmployeeName, @FatherName, @CNICno, @MobileNo, @EmailAddress, @PermanentAddress,
                            @DOB, @EmployeeGender, @BasicSalary, @EmployeeGLID, @MachineId, @EmployeeNo,
                            @DepartmentID, @DesignationID, @CompanyID, @EntryUserID, GETDATE(),
                            @IsActive, @IsTechnician
                        )`);
            inserted++;
            process.stdout.write(`\rinserted ${inserted}/${dataRows.length}`);
        } catch (err) {
            errors++;
            console.error(`\n  ✗ ${empNo} ${fullName}: ${err.message}`);
        }
    }
    console.log('');
    console.log(`Done. inserted=${inserted}  skipped(existing)=${skipped}  errors=${errors}`);
    console.log(`Departments  : ${deptCache.size}`);
    console.log(`Designations : ${desigCache.size}`);

    // Final report
    const counts = await pool.request().query(`
        SELECT 'Employees' AS T, COUNT(*) AS N FROM gen_EmployeeInfo
        UNION ALL SELECT 'Departments', COUNT(*) FROM gen_DepartmentInfo
        UNION ALL SELECT 'Designations', COUNT(*) FROM gen_DesignationInfo
        UNION ALL SELECT 'COA under 102004', COUNT(*) FROM GLChartOFAccount WHERE GLCode LIKE '102004%' AND GLCode <> '102004';
    `);
    console.table(counts.recordset);

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
