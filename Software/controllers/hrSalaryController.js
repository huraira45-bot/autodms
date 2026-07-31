/**
 * HR / Salary Management controller.
 *
 * Endpoints (see routes/hrSalaryRoutes.js for wiring):
 *   Attendance:
 *     GET  /api/hr/attendance?monthId=YYYY-MM
 *     POST /api/hr/attendance          body: {EmployeeID, MonthID, Absents, LateMinutes, LeaveDays, WorkingDays}
 *   Salary entries:
 *     GET  /api/hr/salary?monthId=YYYY-MM
 *     POST /api/hr/salary              body: {EmployeeID, MonthID, Advance, Fine, Hold, MessDays, PaidDays, LateFineRate, Adjustment, Remarks, ManualFineRemarks}
 *   Monthly bundle (attendance + salary + monthly settings for a period):
 *     GET  /api/hr/month/:monthId
 *   Settings (global + per-month):
 *     GET  /api/hr/fine-settings
 *     POST /api/hr/fine-settings       body: {LateFinePerMinute, AbsentFinePerDay}
 *     GET  /api/hr/monthly-settings
 *     POST /api/hr/monthly-settings    body: {MonthID, LateFinePerMinute, AbsentFinePerDay}
 *   Salary sheet (calculated view for one month):
 *     GET  /api/hr/salary-sheet/:monthId
 *   Voucher postings (guarded by hr_salary_post):
 *     POST /api/hr/post/accrual        body: {MonthID}
 *     POST /api/hr/post/pay-bank       body: {MonthID}
 *     POST /api/hr/post/pay-cash       body: {MonthID}
 *     GET  /api/hr/postings?monthId=YYYY-MM  (audit)
 */
const { sql, getPool } = require('../config/db');
const { computeNetPay } = require('../utils/salaryCalculator');
const { nextVoucherNo } = require('../utils/voucherNumbering');
const { resolveRole } = require('./systemAccountsController');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Parse a "YYYY-MM-DD" (or "YYYY-MM-DDTHH:MM") into a Date whose UTC
// face matches the picked wall-clock, so mssql stores the literal
// date without a timezone shift. Same pattern as the JobCard fix.
const parseWallDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(v));
    if (!m) return new Date(v);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
};

// ─── Attendance ────────────────────────────────────────────────
exports.listAttendance = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        let where = '1=1';
        if (req.query.monthId) { rq.input('m', sql.Char(7), req.query.monthId); where += ' AND MonthID = @m'; }
        const r = await rq.query(`SELECT * FROM hr_AttendanceRecords WHERE ${where}`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveAttendance = async (req, res) => {
    const { EmployeeID, MonthID, Absents, LateMinutes, LeaveDays, WorkingDays } = req.body || {};
    if (!EmployeeID || !MonthID) return res.status(400).json({ error: 'EmployeeID and MonthID required' });
    try {
        const pool = await getPool();
        await pool.request()
            .input('e',  sql.Int,         EmployeeID)
            .input('m',  sql.Char(7),     MonthID)
            .input('ab', sql.Decimal(6,2), Number(Absents) || 0)
            .input('lm', sql.Int,         Number(LateMinutes) || 0)
            .input('ld', sql.Decimal(6,2), Number(LeaveDays) || 0)
            .input('wd', sql.Decimal(6,2), Number(WorkingDays) || 0)
            .input('un', sql.NVarChar(100), req.user?.userName || null)
            .query(`
                MERGE hr_AttendanceRecords AS tgt
                USING (SELECT @e AS EmployeeID, @m AS MonthID) AS src
                   ON tgt.EmployeeID = src.EmployeeID AND tgt.MonthID = src.MonthID
                WHEN MATCHED THEN UPDATE SET Absents=@ab, LateMinutes=@lm, LeaveDays=@ld, WorkingDays=@wd,
                                             UpdatedAt=GETDATE(), UpdatedByName=@un
                WHEN NOT MATCHED THEN INSERT (EmployeeID, MonthID, Absents, LateMinutes, LeaveDays, WorkingDays, UpdatedByName)
                                      VALUES (@e, @m, @ab, @lm, @ld, @wd, @un);
            `);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Salary entries ─────────────────────────────────────────────
exports.listSalaryEntries = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        let where = '1=1';
        if (req.query.monthId) { rq.input('m', sql.Char(7), req.query.monthId); where += ' AND MonthID = @m'; }
        const r = await rq.query(`SELECT * FROM hr_SalaryEntries WHERE ${where}`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveSalaryEntry = async (req, res) => {
    const b = req.body || {};
    if (!b.EmployeeID || !b.MonthID) return res.status(400).json({ error: 'EmployeeID and MonthID required' });
    try {
        const pool = await getPool();
        await pool.request()
            .input('e',   sql.Int,         b.EmployeeID)
            .input('m',   sql.Char(7),     b.MonthID)
            .input('ad',  sql.Decimal(18,2), Number(b.Advance) || 0)
            .input('fi',  sql.Decimal(18,2), Number(b.Fine) || 0)
            .input('mfr', sql.NVarChar(300), b.ManualFineRemarks || null)
            .input('ho',  sql.Decimal(18,2), Number(b.Hold) || 0)
            .input('md',  sql.Decimal(6,2),  Number(b.MessDays) || 0)
            .input('pd',  sql.Decimal(6,2),  b.PaidDays == null || b.PaidDays === '' ? null : Number(b.PaidDays))
            .input('lfr', sql.Decimal(10,4), b.LateFineRate == null || b.LateFineRate === '' ? null : Number(b.LateFineRate))
            .input('aj',  sql.Decimal(18,2), Number(b.Adjustment) || 0)
            .input('tx',  sql.Decimal(18,2), Number(b.Tax) || 0)
            .input('rm',  sql.NVarChar(sql.MAX), b.Remarks || null)
            .input('un',  sql.NVarChar(100), req.user?.userName || null)
            .query(`
                MERGE hr_SalaryEntries AS tgt
                USING (SELECT @e AS EmployeeID, @m AS MonthID) AS src
                   ON tgt.EmployeeID = src.EmployeeID AND tgt.MonthID = src.MonthID
                WHEN MATCHED THEN UPDATE SET Advance=@ad, Fine=@fi, ManualFineRemarks=@mfr,
                                             Hold=@ho, MessDays=@md, PaidDays=@pd, LateFineRate=@lfr,
                                             Adjustment=@aj, Tax=@tx, Remarks=@rm,
                                             UpdatedAt=GETDATE(), UpdatedByName=@un
                WHEN NOT MATCHED THEN INSERT (EmployeeID, MonthID, Advance, Fine, ManualFineRemarks,
                                              Hold, MessDays, PaidDays, LateFineRate, Adjustment, Tax,
                                              Remarks, UpdatedByName)
                                      VALUES (@e, @m, @ad, @fi, @mfr, @ho, @md, @pd, @lfr, @aj, @tx, @rm, @un);
            `);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Fine settings ──────────────────────────────────────────────
exports.getFineSettings = async (_req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query('SELECT * FROM hr_FineSettings WHERE SettingID = 1');
        res.json(r.recordset[0] || { LateFinePerMinute: 10, AbsentFinePerDay: 500 });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveFineSettings = async (req, res) => {
    const { LateFinePerMinute, AbsentFinePerDay } = req.body || {};
    try {
        const pool = await getPool();
        await pool.request()
            .input('l',  sql.Decimal(10,4), Number(LateFinePerMinute) || 0)
            .input('a',  sql.Decimal(10,2), Number(AbsentFinePerDay) || 0)
            .input('un', sql.NVarChar(100), req.user?.userName || null)
            .query(`UPDATE hr_FineSettings
                    SET LateFinePerMinute=@l, AbsentFinePerDay=@a, UpdatedAt=GETDATE(), UpdatedByName=@un
                    WHERE SettingID = 1`);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.listMonthlySettings = async (_req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query('SELECT * FROM hr_MonthlySettings ORDER BY MonthID DESC');
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveMonthlySettings = async (req, res) => {
    const { MonthID, LateFinePerMinute, AbsentFinePerDay, WorkingDays } = req.body || {};
    if (!MonthID) return res.status(400).json({ error: 'MonthID required' });
    try {
        const pool = await getPool();
        const wd = (WorkingDays === '' || WorkingDays == null) ? null : Number(WorkingDays);
        await pool.request()
            .input('m',  sql.Char(7),      MonthID)
            .input('l',  sql.Decimal(10,4), Number(LateFinePerMinute) || 0)
            .input('a',  sql.Decimal(10,2), Number(AbsentFinePerDay) || 0)
            .input('wd', sql.Decimal(6,2),  wd)
            .input('un', sql.NVarChar(100), req.user?.userName || null)
            .query(`
                MERGE hr_MonthlySettings AS tgt
                USING (SELECT @m AS MonthID) AS src ON tgt.MonthID = src.MonthID
                WHEN MATCHED THEN UPDATE SET LateFinePerMinute=@l, AbsentFinePerDay=@a,
                                             WorkingDays=@wd,
                                             UpdatedAt=GETDATE(), UpdatedByName=@un
                WHEN NOT MATCHED THEN INSERT (MonthID, LateFinePerMinute, AbsentFinePerDay, WorkingDays, UpdatedByName)
                                      VALUES (@m, @l, @a, @wd, @un);
            `);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Salary sheet (calculated view for one month) ───────────────
async function buildSheet(pool, monthId) {
    const [empRes, attRes, entRes, fsRes, msRes] = await Promise.all([
        pool.request().query(`
            SELECT e.EmployeeID, e.EmployeeName, e.SrNo, e.DesignationID, e.DepartmentID,
                   d.DepartmentName, dg.DesignationName AS Designation,
                   e.BasicSalary, e.EOBI, e.HasEOBI, e.MedicalAllowance, e.HouseRent,
                   e.HasFuelAllowance, e.FuelAllowance,
                   e.HasMess, e.MessAmount,
                   e.HasCustomLateFine, e.CustomLateFineAmount,
                   e.IsPaidByBank, e.BankAccountNumber,
                   e.EmployeeGLID, gl.GLCode AS AccountCode, gl.GLTitle AS AccountTitle,
                   e.IsActive
              FROM gen_EmployeeInfo e
              LEFT JOIN gen_DepartmentInfo d  ON d.DepartmentID  = e.DepartmentID
              LEFT JOIN gen_DesignationInfo dg ON dg.DesignationID = e.DesignationID
              LEFT JOIN GLChartOFAccount gl   ON gl.GLCAID = e.EmployeeGLID
             WHERE e.IsActive = 1 AND ISNULL(e.IsOnPayroll, 1) = 1
             ORDER BY ISNULL(d.DepartmentName, '~'), e.SrNo, e.EmployeeName`),
        pool.request().input('m', sql.Char(7), monthId).query('SELECT * FROM hr_AttendanceRecords WHERE MonthID=@m'),
        pool.request().input('m', sql.Char(7), monthId).query('SELECT * FROM hr_SalaryEntries WHERE MonthID=@m'),
        pool.request().query('SELECT * FROM hr_FineSettings WHERE SettingID = 1'),
        pool.request().input('m', sql.Char(7), monthId).query('SELECT * FROM hr_MonthlySettings WHERE MonthID=@m'),
    ]);
    const global  = fsRes.recordset[0] || { LateFinePerMinute: 10, AbsentFinePerDay: 500 };
    const monthly = msRes.recordset[0] || null;
    const attByE  = new Map(attRes.recordset.map(a => [a.EmployeeID, a]));
    const entByE  = new Map(entRes.recordset.map(e => [e.EmployeeID, e]));
    const rows = empRes.recordset.map(emp => {
        const calc = computeNetPay({
            employee: emp,
            attendance: attByE.get(emp.EmployeeID),
            entry:      entByE.get(emp.EmployeeID),
            global, monthly, monthId,
        });
        return {
            EmployeeID: emp.EmployeeID, SrNo: emp.SrNo, Name: emp.EmployeeName,
            Designation: emp.Designation, DepartmentName: emp.DepartmentName,
            AccountCode: emp.AccountCode, AccountTitle: emp.AccountTitle,
            IsPaidByBank: !!emp.IsPaidByBank, BankAccountNumber: emp.BankAccountNumber,
            Employee: emp,
            Attendance: attByE.get(emp.EmployeeID) || null,
            Entry:      entByE.get(emp.EmployeeID) || null,
            Calc: calc,
        };
    });
    const totalNet = rows.reduce((s, r) => s + r.Calc.net, 0);
    return { monthId, global, monthly, rows, totalNet, effectiveLateRate: monthly?.LateFinePerMinute ?? global.LateFinePerMinute, effectiveAbsentRate: monthly?.AbsentFinePerDay ?? global.AbsentFinePerDay };
}

exports.getSalarySheet = async (req, res) => {
    try {
        const pool = await getPool();
        const sheet = await buildSheet(pool, req.params.monthId);
        res.json(sheet);
    } catch (err) { console.error('getSalarySheet:', err); res.status(500).json({ error: err.message }); }
};

// ─── Voucher posting ────────────────────────────────────────────
async function loadRoleOrThrow(name) {
    const gl = await resolveRole(name);
    if (!gl) throw new Error(`${name} system account not configured. Map it in Accounting Setup first.`);
    return gl;
}

async function insertVoucherHeader(tx, { voucherNo, voucherTypeCode, date, narration, totalAmount, srcType, srcId, user }) {
    const vt = await new sql.Request(tx)
        .input('c', sql.NVarChar(20), voucherTypeCode)
        .query('SELECT Voucherid FROM GLVoucherType WHERE Title=@c');
    if (!vt.recordset.length) throw new Error(`Voucher type ${voucherTypeCode} not found.`);
    const r = await new sql.Request(tx)
        .input('vd',   sql.DateTime,         date)
        .input('vno',  sql.NVarChar(50),     voucherNo)
        .input('vt',   sql.Int,              vt.recordset[0].Voucherid)
        .input('nar',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2),    totalAmount)
        .input('src',  sql.NVarChar(20),     srcType)
        .input('sid',  sql.Int,              srcId)
        .input('cby',  sql.Int,              user?.userId || null)
        .input('cbyN', sql.NVarChar(100),    user?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vt, @nar, @tot, 'Draft', 0, @src, @sid, @cby, @cbyN)`);
    return r.recordset[0].VoucherID;
}

async function insertLeg(tx, { voucherId, glCAID, dr, cr, narration, partyId = null }) {
    await new sql.Request(tx)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               glCAID)
        .input('nar', sql.NVarChar(sql.MAX), narration)
        .input('dr',  sql.Decimal(18,2),     dr || 0)
        .input('cr',  sql.Decimal(18,2),     cr || 0)
        .input('pid', sql.Int,               partyId)
        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, PartyID)
                VALUES (@vid, @gl, @nar, @dr, @cr, @pid)`);
}

async function postDraftToPosted(tx, voucherId, user) {
    await new sql.Request(tx)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, user?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);
}

async function recordPosting(tx, { monthId, postingType, voucherId, totalAmount, employeeCount, user }) {
    await new sql.Request(tx)
        .input('m',   sql.Char(7),       monthId)
        .input('pt',  sql.NVarChar(20),  postingType)
        .input('vid', sql.Int,           voucherId)
        .input('ta',  sql.Decimal(18,2), totalAmount)
        .input('ec',  sql.Int,           employeeCount)
        .input('un',  sql.NVarChar(100), user?.userName || null)
        .query(`INSERT INTO hr_SalaryPostings (MonthID, PostingType, VoucherID, TotalAmount, EmployeeCount, PostedByName)
                VALUES (@m, @pt, @vid, @ta, @ec, @un)`);
}

// (1) Accrual — new dept-based model (owner ask 2026-07-29).
//
// Owner ask 2026-07-30: post EOBI and Non-EOBI payrolls as SEPARATE
// vouchers under one Post Accrual click. Each voucher's TotalAmount
// equals that category's Employee GL Cr sum (= net payable for that
// category). The two totals together equal total salary payable.
//
// For each employee:
//   Dr {Dept.SalaryExpense EOBI or Non-EOBI}   prorated basic
//   Dr {Dept.Fuel Expense}                     fuel allowance
//     Cr {Dept.Absent Fine}                    absent fine
//     Cr {Dept.Late Fine}                      late fine
//     Cr {Dept.Manual Fine}                    manual fine
//     Cr {Dept.Mess Recovery}                  mess deduction
//     Cr {Dept.EOBI Payable}                   EOBI amount
//     Cr {Dept.Tax Payable}                    tax withheld (owner ask 2026-07-31)
//     Cr Employee GL (EmployeeGLID)            balancing = additions − above credits
//
// Advance & Hold flow naturally through Employee GL (no separate legs).
//
// Body: { MonthID, PostDate (YYYY-MM-DD) }
// Validates every employee has EmployeeGLID and every dept has the
// required GLs mapped, else refuses with a specific error.
exports.postAccrual = async (req, res) => {
    const { MonthID, PostDate } = req.body || {};
    if (!MonthID)  return res.status(400).json({ error: 'MonthID required' });
    if (!PostDate) return res.status(400).json({ error: 'PostDate required' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const sheet = await buildSheet(pool, MonthID);
        const payable = sheet.rows.filter(r => r.Calc.additions > 0);
        if (!payable.length) throw new Error('No employees with positive earnings for this month.');

        // Load per-dept GL map
        const deptRes = await new sql.Request(tx).query(`
            SELECT DepartmentID, SalaryExpenseEobiGLID, SalaryExpenseNonEobiGLID, FuelExpenseGLID,
                   AbsentFineGLID, LateFineGLID, ManualFineGLID, MessRecoveryGLID, EobiPayableGLID,
                   TaxPayableGLID
              FROM hr_DepartmentSalaryAccounts`);
        const deptMap = new Map(deptRes.recordset.map(d => [d.DepartmentID, d]));

        // Validate every employee has EmployeeGLID + every dept used has all required GLs
        const missingEmp = payable.filter(r => !r.Employee.EmployeeGLID);
        if (missingEmp.length) {
            throw new Error(`No Employee GL mapped for: ${missingEmp.slice(0, 5).map(r => r.Name).join(', ')}${missingEmp.length > 5 ? ` + ${missingEmp.length - 5} more` : ''}. Set 'Salary GL' in Employee Salary Settings.`);
        }
        const missingDept = [];
        const check = (r, key, label) => {
            const acct = deptMap.get(r.Employee.DepartmentID);
            if (!acct || !acct[key]) {
                const deptName = r.DepartmentName || `Dept #${r.Employee.DepartmentID}`;
                missingDept.push(`${deptName}: ${label}`);
            }
        };
        payable.forEach(r => {
            const c = r.Calc;
            if (c.prorated > 0) check(r, r.Employee.HasEOBI ? 'SalaryExpenseEobiGLID' : 'SalaryExpenseNonEobiGLID',
                                       r.Employee.HasEOBI ? 'Salary Expense (EOBI)' : 'Salary Expense (Non-EOBI)');
            if (c.fuel > 0)         check(r, 'FuelExpenseGLID',   'Fuel Expense');
            if (c.absentFine > 0)   check(r, 'AbsentFineGLID',    'Absent Fine');
            if (c.lateFine > 0)     check(r, 'LateFineGLID',      'Late Fine');
            if (c.manualFine > 0)   check(r, 'ManualFineGLID',    'Manual Fine');
            if (c.messDeduction > 0)check(r, 'MessRecoveryGLID',  'Mess Recovery');
            if (c.eobi > 0)         check(r, 'EobiPayableGLID',   'EOBI Payable');
            if (c.tax > 0)          check(r, 'TaxPayableGLID',    'Tax Payable');
        });
        if (missingDept.length) {
            const uniq = Array.from(new Set(missingDept));
            throw new Error(`Department salary accounts not mapped: ${uniq.slice(0, 6).join('; ')}${uniq.length > 6 ? `; +${uniq.length - 6} more` : ''}. Go to HR → Dept Salary Accounts.`);
        }

        // Helper: build & post one JV for a given filter/category
        const buildAndPost = async (categoryLabel, rows) => {
            if (!rows.length) return null;

            const legs = new Map();
            const push = (glCAID, dr, cr, narration) => {
                if (!glCAID) return;
                const key = `${glCAID}|${dr > 0 ? 'D' : 'C'}`;
                const ex = legs.get(key);
                if (ex) { ex.dr += dr; ex.cr += cr; }
                else    { legs.set(key, { glCAID, dr, cr, narration }); }
            };
            // Per-employee Employee GL Cr — kept as its own line, not aggregated,
            // so the subsidiary trail per employee stays clear.
            const empLegs = [];

            let payableTotal = 0;
            for (const r of rows) {
                const c = r.Calc;
                const acct = deptMap.get(r.Employee.DepartmentID);
                const deptNar = `${r.DepartmentName || ''} salary ${MonthID}`;

                const salaryGL = r.Employee.HasEOBI ? acct.SalaryExpenseEobiGLID : acct.SalaryExpenseNonEobiGLID;
                if (c.prorated > 0)       push(salaryGL,               c.prorated,     0, `${deptNar} — basic (${r.Employee.HasEOBI ? 'EOBI' : 'Non-EOBI'})`);
                if (c.fuel > 0)           push(acct.FuelExpenseGLID,   c.fuel,         0, `${deptNar} — fuel`);
                if (c.absentFine > 0)     push(acct.AbsentFineGLID,    0, c.absentFine,   `${deptNar} — absent fine`);
                if (c.lateFine > 0)       push(acct.LateFineGLID,      0, c.lateFine,     `${deptNar} — late fine`);
                if (c.manualFine > 0)     push(acct.ManualFineGLID,    0, c.manualFine,   `${deptNar} — manual fine`);
                if (c.messDeduction > 0)  push(acct.MessRecoveryGLID,  0, c.messDeduction,`${deptNar} — mess`);
                if (c.eobi > 0)           push(acct.EobiPayableGLID,   0, c.eobi,         `${deptNar} — EOBI payable`);
                if (c.tax > 0)            push(acct.TaxPayableGLID,    0, c.tax,          `${deptNar} — tax payable`);

                const empCr = r2(c.additions - c.absentFine - c.lateFine - c.manualFine - c.messDeduction - c.eobi - c.tax);
                if (empCr !== 0) {
                    empLegs.push({ glCAID: r.Employee.EmployeeGLID, dr: 0, cr: empCr, narration: `Salary ${MonthID} — ${r.Name}` });
                    payableTotal = r2(payableTotal + empCr);
                }
            }

            const dedupedLegs = Array.from(legs.values())
                .map(l => ({ ...l, dr: r2(l.dr), cr: r2(l.cr) }))
                .filter(l => l.dr > 0 || l.cr > 0)
                .concat(empLegs);

            const totalDr = r2(dedupedLegs.reduce((s, l) => s + l.dr, 0));
            const totalCr = r2(dedupedLegs.reduce((s, l) => s + l.cr, 0));
            if (Math.abs(totalDr - totalCr) > 0.01) {
                throw new Error(`${categoryLabel} JV unbalanced: Dr ${totalDr} vs Cr ${totalCr}`);
            }

            const voucherNo = await nextVoucherNo(tx, 'JV');
            const narration = `Salary accrual ${MonthID} — ${categoryLabel}`;
            const voucherId = await insertVoucherHeader(tx, {
                voucherNo, voucherTypeCode: 'JV',
                date: parseWallDate(PostDate),
                narration,
                // TotalAmount = net payable for this category (= sum of Employee GL Crs).
                // Sum of both vouchers' TotalAmount == total salary payable on the sheet.
                totalAmount: payableTotal,
                srcType: 'HR_SALARY_ACCRUAL', srcId: null, user: req.user
            });
            for (const l of dedupedLegs) {
                await insertLeg(tx, { voucherId, glCAID: l.glCAID, dr: l.dr, cr: l.cr, narration: l.narration });
            }
            await postDraftToPosted(tx, voucherId, req.user);
            await recordPosting(tx, {
                monthId: MonthID, postingType: 'ACCRUAL', voucherId,
                totalAmount: payableTotal, employeeCount: rows.length, user: req.user
            });
            return { voucherNo, voucherId, totalAmount: payableTotal, employees: rows.length, legs: dedupedLegs.length, category: categoryLabel };
        };

        const eobiRows    = payable.filter(r => r.Employee.HasEOBI);
        const nonEobiRows = payable.filter(r => !r.Employee.HasEOBI);
        const results = [];
        const eobiRes    = await buildAndPost('EOBI',     eobiRows);      if (eobiRes)    results.push(eobiRes);
        const nonEobiRes = await buildAndPost('Non-EOBI', nonEobiRows);   if (nonEobiRes) results.push(nonEobiRes);
        if (!results.length) throw new Error('No accrual to post.');

        await tx.commit();
        const totalPayable = r2(results.reduce((s, r) => s + r.totalAmount, 0));
        res.json({
            ok: true,
            vouchers: results,
            totalPayable,
            totalEmployees: results.reduce((s, r) => s + r.employees, 0),
        });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        res.status(400).json({ error: err.message });
    }
};

// Payment vouchers (bank / cash) — REMOVED per owner ask 2026-07-29.
// The new model uses ONE accrual JV (see postAccrual above rewrite) that
// posts per-department expense Drs and per-employee GL Crs. Actual cash
// disbursement is done via existing CPV/BPV screens transferring from
// Employee GL to Cash/Bank when payment happens.

exports.listPostings = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        let where = '1=1';
        if (req.query.monthId) { rq.input('m', sql.Char(7), req.query.monthId); where += ' AND p.MonthID = @m'; }
        const r = await rq.query(`
            SELECT p.PostingID, p.MonthID, p.PostingType, p.TotalAmount, p.EmployeeCount,
                   p.PostedAt, p.PostedByName,
                   v.VoucherID, v.VoucherNo, v.Status AS VoucherStatus
              FROM hr_SalaryPostings p
              LEFT JOIN data_FinanceVoucherInfo v ON v.VoucherID = p.VoucherID
             WHERE ${where}
             ORDER BY p.PostedAt DESC`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports._buildSheet = buildSheet;  // exported for print endpoints

// Per-employee slip data — same buildSheet, filtered to one row.
exports.getEmployeeSlip = async (req, res) => {
    try {
        const pool = await getPool();
        const sheet = await buildSheet(pool, req.params.monthId);
        const row = sheet.rows.find(r => r.EmployeeID === parseInt(req.params.employeeId));
        if (!row) return res.status(404).json({ error: 'Employee not found on sheet' });
        // Include company header via business profile lookup
        const bp = await pool.request().query('SELECT TOP 1 * FROM dms_BusinessProfile');
        res.json({ monthId: sheet.monthId, business: bp.recordset[0] || {}, row });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
