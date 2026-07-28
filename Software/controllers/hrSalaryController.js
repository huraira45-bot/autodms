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
            .input('rm',  sql.NVarChar(sql.MAX), b.Remarks || null)
            .input('un',  sql.NVarChar(100), req.user?.userName || null)
            .query(`
                MERGE hr_SalaryEntries AS tgt
                USING (SELECT @e AS EmployeeID, @m AS MonthID) AS src
                   ON tgt.EmployeeID = src.EmployeeID AND tgt.MonthID = src.MonthID
                WHEN MATCHED THEN UPDATE SET Advance=@ad, Fine=@fi, ManualFineRemarks=@mfr,
                                             Hold=@ho, MessDays=@md, PaidDays=@pd, LateFineRate=@lfr,
                                             Adjustment=@aj, Remarks=@rm,
                                             UpdatedAt=GETDATE(), UpdatedByName=@un
                WHEN NOT MATCHED THEN INSERT (EmployeeID, MonthID, Advance, Fine, ManualFineRemarks,
                                              Hold, MessDays, PaidDays, LateFineRate, Adjustment,
                                              Remarks, UpdatedByName)
                                      VALUES (@e, @m, @ad, @fi, @mfr, @ho, @md, @pd, @lfr, @aj, @rm, @un);
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
    const { MonthID, LateFinePerMinute, AbsentFinePerDay } = req.body || {};
    if (!MonthID) return res.status(400).json({ error: 'MonthID required' });
    try {
        const pool = await getPool();
        await pool.request()
            .input('m',  sql.Char(7),      MonthID)
            .input('l',  sql.Decimal(10,4), Number(LateFinePerMinute) || 0)
            .input('a',  sql.Decimal(10,2), Number(AbsentFinePerDay) || 0)
            .input('un', sql.NVarChar(100), req.user?.userName || null)
            .query(`
                MERGE hr_MonthlySettings AS tgt
                USING (SELECT @m AS MonthID) AS src ON tgt.MonthID = src.MonthID
                WHEN MATCHED THEN UPDATE SET LateFinePerMinute=@l, AbsentFinePerDay=@a,
                                             UpdatedAt=GETDATE(), UpdatedByName=@un
                WHEN NOT MATCHED THEN INSERT (MonthID, LateFinePerMinute, AbsentFinePerDay, UpdatedByName)
                                      VALUES (@m, @l, @a, @un);
            `);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Salary sheet (calculated view for one month) ───────────────
async function buildSheet(pool, monthId) {
    const [empRes, attRes, entRes, fsRes, msRes] = await Promise.all([
        pool.request().query(`
            SELECT e.EmployeeID, e.EmployeeName, e.SrNo, e.DesignationID, e.DepartmentID,
                   d.DepartmentName, dg.DesignationTitle AS Designation,
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
             WHERE e.IsActive = 1
             ORDER BY e.SrNo, e.EmployeeName`),
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

// (1) Accrual: Dr Salary Expense (per employee, gross-of-deductions "additions"),
//              Dr each deduction routes to specific liability if wired, else pooled.
// For MVP we do the salary system's original simple model:
//   Dr SALARY_EXPENSE       Σ net
//   Cr SALARY_PAYABLE       Σ net
// (Owner can extend later to split EOBI etc. into separate legs.)
exports.postAccrual = async (req, res) => {
    const { MonthID } = req.body || {};
    if (!MonthID) return res.status(400).json({ error: 'MonthID required' });
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const salaryExpGL = await loadRoleOrThrow('SALARY_EXPENSE');
        const salaryPayGL = await loadRoleOrThrow('SALARY_PAYABLE');

        const sheet = await buildSheet(pool, MonthID);
        const payable = sheet.rows.filter(r => r.Calc.net > 0);
        if (!payable.length) throw new Error('No payable employees for this month.');
        const total = r2(payable.reduce((s, r) => s + r.Calc.net, 0));

        const voucherNo = await nextVoucherNo(tx, 'JV');
        const narration = `Salary accrual for ${MonthID}`;
        const voucherId = await insertVoucherHeader(tx, {
            voucherNo, voucherTypeCode: 'JV', date: new Date(),
            narration, totalAmount: total,
            srcType: 'HR_SALARY_ACCRUAL', srcId: null, user: req.user
        });
        await insertLeg(tx, { voucherId, glCAID: salaryExpGL, dr: total, cr: 0, narration });
        await insertLeg(tx, { voucherId, glCAID: salaryPayGL, dr: 0, cr: total, narration });
        await postDraftToPosted(tx, voucherId, req.user);
        await recordPosting(tx, { monthId: MonthID, postingType: 'ACCRUAL', voucherId, totalAmount: total, employeeCount: payable.length, user: req.user });

        await tx.commit();
        res.json({ ok: true, voucherNo, voucherId, totalAmount: total, employees: payable.length });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        res.status(400).json({ error: err.message });
    }
};

// (2) Pay via bank: only employees where IsPaidByBank = 1
//   Dr SALARY_PAYABLE   Σ bankEmp.net
//   Cr Bank clearing GL Σ bankEmp.net    -- uses CASH_BOOK role fallback
exports.postPayBank = async (req, res) => {
    const { MonthID, BankGLCAID } = req.body || {};
    if (!MonthID) return res.status(400).json({ error: 'MonthID required' });
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const salaryPayGL = await loadRoleOrThrow('SALARY_PAYABLE');
        const bankGL      = BankGLCAID ? Number(BankGLCAID) : await loadRoleOrThrow('CASH_BOOK');

        const sheet = await buildSheet(pool, MonthID);
        const bankEmp = sheet.rows.filter(r => r.IsPaidByBank && r.Calc.net > 0);
        if (!bankEmp.length) throw new Error('No bank-payable employees with positive net for this month.');
        const total = r2(bankEmp.reduce((s, r) => s + r.Calc.net, 0));

        const voucherNo = await nextVoucherNo(tx, 'BPV');
        const narration = `Salary bank payment for ${MonthID}`;
        const voucherId = await insertVoucherHeader(tx, {
            voucherNo, voucherTypeCode: 'BPV', date: new Date(),
            narration, totalAmount: total,
            srcType: 'HR_SALARY_PAY_BANK', srcId: null, user: req.user
        });
        await insertLeg(tx, { voucherId, glCAID: salaryPayGL, dr: total, cr: 0, narration });
        await insertLeg(tx, { voucherId, glCAID: bankGL,      dr: 0, cr: total, narration });
        await postDraftToPosted(tx, voucherId, req.user);
        await recordPosting(tx, { monthId: MonthID, postingType: 'PAY_BANK', voucherId, totalAmount: total, employeeCount: bankEmp.length, user: req.user });

        await tx.commit();
        res.json({ ok: true, voucherNo, voucherId, totalAmount: total, employees: bankEmp.length });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        res.status(400).json({ error: err.message });
    }
};

// (3) Pay via cash: only employees where IsPaidByBank = 0
exports.postPayCash = async (req, res) => {
    const { MonthID } = req.body || {};
    if (!MonthID) return res.status(400).json({ error: 'MonthID required' });
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const salaryPayGL = await loadRoleOrThrow('SALARY_PAYABLE');
        const cashGL      = await loadRoleOrThrow('CASH_BOOK');

        const sheet = await buildSheet(pool, MonthID);
        const cashEmp = sheet.rows.filter(r => !r.IsPaidByBank && r.Calc.net > 0);
        if (!cashEmp.length) throw new Error('No cash-payable employees with positive net for this month.');
        const total = r2(cashEmp.reduce((s, r) => s + r.Calc.net, 0));

        const voucherNo = await nextVoucherNo(tx, 'CPV');
        const narration = `Salary cash payment for ${MonthID}`;
        const voucherId = await insertVoucherHeader(tx, {
            voucherNo, voucherTypeCode: 'CPV', date: new Date(),
            narration, totalAmount: total,
            srcType: 'HR_SALARY_PAY_CASH', srcId: null, user: req.user
        });
        await insertLeg(tx, { voucherId, glCAID: salaryPayGL, dr: total, cr: 0, narration });
        await insertLeg(tx, { voucherId, glCAID: cashGL,      dr: 0, cr: total, narration });
        await postDraftToPosted(tx, voucherId, req.user);
        await recordPosting(tx, { monthId: MonthID, postingType: 'PAY_CASH', voucherId, totalAmount: total, employeeCount: cashEmp.length, user: req.user });

        await tx.commit();
        res.json({ ok: true, voucherNo, voucherId, totalAmount: total, employees: cashEmp.length });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        res.status(400).json({ error: err.message });
    }
};

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
