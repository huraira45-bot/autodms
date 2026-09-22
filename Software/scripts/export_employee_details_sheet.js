/**
 * Fills the "Employee Details Sheet" template with every employee in the HR
 * module. Owner ask 2026-09-22.
 *
 *   node scripts/export_employee_details_sheet.js [template.xlsx] [output.xlsx]
 *
 * Defaults to the template on the owner's DATA folder and writes a dated copy
 * beside it. The template's headers, column widths, merges and its "Source
 * File" tab are left exactly as they are — only the data rows are written,
 * from row 3 down.
 *
 * Columns the HR module has no field for are left blank for HR to complete by
 * hand: CNIC issuance/expiry, the three emergency-contact columns,
 * sub-department, joining confirmation due, joining salary, the Vehicle and
 * Others benefit columns, and religion. The summary printed at the end says,
 * per column, whether a blank is an empty field or a field we do not hold.
 */
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../config/db');

const TEMPLATE = process.argv[2] || 'C:/Users/ServerDeskop/Desktop/DATA/Employee Details Sheet.xlsx';
const OUT = process.argv[3] || TEMPLATE.replace(/\.xlsx$/i, '') + ` - FILLED ${new Date().toISOString().slice(0, 10)}.xlsx`;
const DEALERSHIP = process.env.DEALERSHIP_NAME || 'Changan Multan Motors';

const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => (v === null || v === undefined || Number(v) === 0 ? '' : Number(v));

function ageFrom(d) {
    if (!d) return '';
    const b = new Date(d), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    const m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
    return a >= 0 && a < 120 ? a : '';
}

/** "3 years, 3 months, 16 days" — the wording the template already uses. */
function tenure(from, to) {
    if (!from) return '';
    const a = new Date(from), b = to ? new Date(to) : new Date();
    if (isNaN(a) || b < a) return '';
    let y = b.getFullYear() - a.getFullYear();
    let m = b.getMonth() - a.getMonth();
    let d = b.getDate() - a.getDate();
    if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    const bits = [];
    if (y) bits.push(`${y} year${y === 1 ? '' : 's'}`);
    if (m) bits.push(`${m} month${m === 1 ? '' : 's'}`);
    bits.push(`${d} day${d === 1 ? '' : 's'}`);
    return bits.join(', ');
}

// label, and where it comes from ('' = the HR module has no such field)
const COLUMNS = [
    ['S.N', 'row number'], ['Emp. ID', 'EmployeeNo'], ['Punch Codes', 'MachineId / EnrollmentNo'],
    ['Prefix Name', 'from gender'], ['Employee Name', 'EmployeeName'], ['Father Name', 'FatherName'],
    ['Cell No', 'MobileNo'], ["Employee's NIC", 'CNICno'], ['Issuance Date of CNIC', ''],
    ['Expiry date of CNIC', ''], ['DOB', 'DOB'], ['Age', 'from DOB'], ['Present Address', 'TemporaryAddress'],
    ['Permanent Address', 'PermanentAddress'], ['Emergency Contact Person', ''], ['Emergency Contact Relation', ''],
    ['Personal Email', 'EmailAddress'], ['Emergency Contact No.', ''], ['Designation', 'DesignationName'],
    ['Department', 'DepartmentName'], ['Sub-Department', ''], ['Dealership Name', 'constant'],
    ['DOJ', 'JoiningDate'], ['Current', "today / resign date"], ['Job Tenure', 'from JoiningDate'],
    ['Joining Confirmation Due', ''], ['Joining Salary', ''], ['Current Salary', 'BasicSalary'],
    ['Benefit: Vehicle', ''], ['Benefit: Fuel', 'FuelAllowance'], ['Benefit: Lunch', 'MessAmount'],
    ['Benefit: other Allowance', 'Medical + House Rent'], ['Benefit: Others', ''],
    ['Status: Active', 'IsActive'], ['Status: Resigned', 'ResignDate'], ['Religion', ''],
    ['Education', 'employee education'], ['Institute', 'employee education'],
    ['Bank Name', 'payment bank account'], ['Account No', 'BankAccountNumber'],
];

(async () => {
    const pool = await getPool();
    const rows = (await pool.request().query(`
        SELECT e.EmployeeID, e.EmployeeNo, e.SrNo, e.MachineId, e.EnrollmentNo,
               e.EmployeeName, e.FatherName, e.MobileNo, e.PhoneNo, e.CNICno, e.DOB,
               e.EmployeeGender, e.TemporaryAddress, e.PermanentAddress, e.EmailAddress,
               e.JoiningDate, e.ResignDate, e.IsActive,
               e.BasicSalary, e.MedicalAllowance, e.HouseRent,
               e.FuelAllowance, e.MessAmount, e.BankAccountNumber,
               d.DepartmentName, g.DesignationName,
               bank.GLTitle AS BankName,
               ed.DegreeName, ed.Institute
        FROM   gen_EmployeeInfo e
        LEFT   JOIN gen_DepartmentInfo  d    ON d.DepartmentID  = e.DepartmentID
        LEFT   JOIN gen_DesignationInfo g    ON g.DesignationID = e.DesignationID
        LEFT   JOIN GLChartOFAccount    bank ON bank.GLCAID     = e.PaymentBankGLCAID
        OUTER  APPLY (SELECT TOP 1 x.DegreeName, x.Institute
                      FROM gen_EmployeeEducationDetail x
                      WHERE x.EmployeeID = e.EmployeeID
                      ORDER BY x.PassingYear DESC, x.EmployeeEducationDetailID DESC) ed
        ORDER  BY e.IsActive DESC, e.EmployeeName`)).recordset;

    const wb = XLSX.readFile(TEMPLATE, { cellStyles: true, cellDates: true });
    const ws = wb.Sheets['Employee Details'];
    if (!ws) throw new Error('The template has no "Employee Details" sheet.');

    // Clear any previous data rows, leaving the two header rows untouched.
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 2; R <= range.e.r; R++) {
        for (let C = 0; C <= Math.max(range.e.c, 39); C++) delete ws[XLSX.utils.encode_cell({ r: R, c: C })];
    }

    const put = (R, C, v) => {
        if (v === '' || v === null || v === undefined) return;
        ws[XLSX.utils.encode_cell({ r: R, c: C })] =
            v instanceof Date ? { t: 'd', v, z: 'dd-mmm-yy' }
          : typeof v === 'number' ? { t: 'n', v }
          : { t: 's', v: String(v) };
    };

    const today = new Date();
    const filled = new Array(COLUMNS.length).fill(0);

    rows.forEach((e, i) => {
        const R = 2 + i;
        const prefix = /female/i.test(clean(e.EmployeeGender)) ? 'Ms.'
                     : /male/i.test(clean(e.EmployeeGender)) ? 'Mr.' : '';
        const vals = [
            i + 1,
            clean(e.EmployeeNo) || clean(e.SrNo) || e.EmployeeID,
            clean(e.MachineId) || clean(e.EnrollmentNo),
            prefix,
            clean(e.EmployeeName),
            clean(e.FatherName),
            clean(e.MobileNo) || clean(e.PhoneNo),
            clean(e.CNICno),
            '', '',
            e.DOB ? new Date(e.DOB) : '',
            ageFrom(e.DOB),
            clean(e.TemporaryAddress),
            clean(e.PermanentAddress),
            '', '',
            clean(e.EmailAddress),
            '',
            clean(e.DesignationName),
            clean(e.DepartmentName),
            '',
            DEALERSHIP,
            e.JoiningDate ? new Date(e.JoiningDate) : '',
            e.ResignDate ? new Date(e.ResignDate) : today,
            tenure(e.JoiningDate, e.ResignDate),
            '', '',
            num(e.BasicSalary),
            '',
            num(e.FuelAllowance),
            num(e.MessAmount),
            num(Number(e.MedicalAllowance || 0) + Number(e.HouseRent || 0)),
            '',
            e.IsActive ? 'Active' : '',
            e.IsActive ? '' : (e.ResignDate ? new Date(e.ResignDate) : 'Resigned'),
            '',
            clean(e.DegreeName),
            clean(e.Institute),
            clean(e.BankName),
            clean(e.BankAccountNumber),
        ];
        vals.forEach((v, c) => { put(R, c, v); if (v !== '' && v !== null && v !== undefined) filled[c]++; });
    });

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1 + rows.length, c: COLUMNS.length - 1 } });
    XLSX.writeFile(wb, OUT, { cellStyles: true, cellDates: true });

    console.log(`${rows.length} employees written to:\n  ${OUT}\n`);
    console.log('COLUMN                          FILLED   NOTE');
    COLUMNS.forEach(([label, source], c) => {
        const n = filled[c];
        const note = !source ? 'the HR module has no field for this — fill in by hand'
                   : n === rows.length ? ''
                   : n === 0 ? `field exists (${source}) but is empty for every employee`
                   : `field exists (${source}), blank for ${rows.length - n}`;
        console.log('  ' + label.padEnd(30) + String(n).padStart(4) + '     ' + note);
    });
    process.exit(0);
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
