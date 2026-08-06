const { sql, dbConfig, getPool } = require('../config/db');

// @route   GET /api/employees
// @query   includeInactive=1 — also return employees who have left (IsActive=0).
// vw_ActiveEmployees already filters IsActive=1, so the includeInactive path
// reads gen_EmployeeInfo directly instead.
exports.getEmployees = async (req, res) => {
  try {
    const pool = await getPool();
    const source = req.query.includeInactive === '1' ? 'gen_EmployeeInfo' : 'vw_ActiveEmployees';
    const result = await pool.request().query(`
      SELECT e.*,
             d.DepartmentName,
             des.DesignationName,
             r.EmployeeName AS ReportsToName
      FROM ${source} e
      LEFT JOIN gen_DepartmentInfo d ON e.DepartmentID = d.DepartmentID
      LEFT JOIN gen_DesignationInfo des ON e.DesignationID = des.DesignationID
      LEFT JOIN gen_EmployeeInfo r ON e.ReportsToID = r.EmployeeID
      ORDER BY e.EmployeeName
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
};

// @route   PUT /api/employees/:id
// Full edit of an existing employee's core details (everything createEmployee
// captures at registration). Owner ask 2026-07-31.
exports.updateEmployee = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      EmployeeName, EmployeeNo, FatherName, CNICno, MobileNo,
      EmployeeGender, PermanentAddress, DOB, EmailAddress,
      DepartmentID, DesignationID, MachineId, BasicSalary, EmployeeGLID,
    } = req.body || {};
    if (!EmployeeName) return res.status(400).json({ error: 'Full Name is required.' });

    const pool = await getPool();
    await pool.request()
      .input('id',   sql.Int,          id)
      .input('name', sql.VarChar(100), EmployeeName)
      .input('no',   sql.VarChar(50),  EmployeeNo || null)
      .input('fn',   sql.VarChar(100), FatherName || null)
      .input('cnic', sql.VarChar(50),  CNICno || null)
      .input('mob',  sql.VarChar(50),  MobileNo || null)
      .input('gen',  sql.VarChar(20),  EmployeeGender || null)
      .input('addr', sql.VarChar(sql.MAX), PermanentAddress || null)
      .input('dob',  sql.Date,         DOB ? new Date(DOB) : null)
      .input('email',sql.VarChar(100), EmailAddress || null)
      .input('dept', sql.Int,          DepartmentID || null)
      .input('desig',sql.Int,          DesignationID || null)
      .input('mach', sql.Int,          MachineId || null)
      .input('bs',   sql.Decimal(18,2),BasicSalary != null && BasicSalary !== '' ? Number(BasicSalary) : null)
      .input('gl',   sql.Int,          EmployeeGLID || null)
      .query(`UPDATE gen_EmployeeInfo SET
                EmployeeName=@name, EmployeeNo=@no, FatherName=@fn, CNICno=@cnic,
                MobileNo=@mob, EmployeeGender=@gen, PermanentAddress=@addr, DOB=@dob,
                EmailAddress=@email, DepartmentID=@dept, DesignationID=@desig,
                MachineId=@mach, BasicSalary=@bs, EmployeeGLID=@gl,
                ModifyUserDateTime=GETDATE()
              WHERE EmployeeID=@id`);
    res.json({ message: 'Employee updated' });
  } catch (err) {
    console.error('updateEmployee:', err);
    res.status(400).json({ error: err.message });
  }
};

// @route   PATCH /api/employees/:id/payroll-inclusion
// Owner ask 2026-07-31: some active employees (e.g. the owner/CEO) draw no
// salary and shouldn't appear on the HR Salary Sheet, even though they're
// still active staff. Separate from IsActive — see migration 101.
exports.setPayrollInclusion = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',  sql.Int, parseInt(req.params.id))
      .input('val', sql.Bit, req.body.IsOnPayroll ? 1 : 0)
      .query('UPDATE gen_EmployeeInfo SET IsOnPayroll=@val WHERE EmployeeID=@id');
    res.json({ message: 'Payroll inclusion updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// @route   PATCH /api/employees/:id/reports-to
exports.setReportsTo = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reportsToId = req.body.ReportsToID ? parseInt(req.body.ReportsToID) : null;
    if (reportsToId === id) {
      return res.status(400).json({ error: 'Employee cannot report to themselves.' });
    }
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('rep', sql.Int, reportsToId)
      .query('UPDATE gen_EmployeeInfo SET ReportsToID=@rep WHERE EmployeeID=@id');
    res.json({ message: 'Reports-To updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// @route   PATCH /api/employees/:id/active
// Body: { IsActive, ResignDate? }. Deactivating without a ResignDate stamps
// today's date; reactivating clears it. Owner ask 2026-07-31 — employees who
// leave should stop appearing anywhere active (incl. the salary sheet) with
// a recorded leave date, not just silently vanish.
exports.setActive = async (req, res) => {
  try {
    const isActive = !!req.body.IsActive;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .input('val', sql.Bit, isActive ? 1 : 0)
      .input('rd', sql.Date, isActive ? null : (req.body.ResignDate ? new Date(req.body.ResignDate) : new Date()))
      .query(`UPDATE gen_EmployeeInfo
                SET IsActive=@val, ResignDate=@rd
              WHERE EmployeeID=@id`);
    res.json({ message: 'Active status updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// @route   PATCH /api/employees/:id/salary-settings
// Updates the HR/salary-specific columns added by migration 095.
// Owner rule 2026-07-29: non-EOBI employees are always paid in cash, so
// IsPaidByBank is force-cleared server-side whenever HasEOBI is off.
exports.setSalarySettings = async (req, res) => {
  try {
    const pool = await getPool();
    const b = req.body || {};
    const hasEobi = !!b.HasEOBI;
    const isBank  = hasEobi && !!b.IsPaidByBank;   // never bank without EOBI
    await pool.request()
      .input('id',  sql.Int,          parseInt(req.params.id))
      .input('bs',  sql.Decimal(18,2), b.BasicSalary != null ? Number(b.BasicSalary) : null)
      .input('eb',  sql.Bit,          hasEobi ? 1 : 0)
      .input('ea',  sql.Decimal(10,2), Number(b.EOBI) || 0)
      .input('fa',  sql.Bit,          b.HasFuelAllowance ? 1 : 0)
      .input('fv',  sql.Decimal(10,2), Number(b.FuelAllowance) || 0)
      .input('ms',  sql.Bit,          b.HasMess ? 1 : 0)
      .input('mv',  sql.Decimal(10,2), Number(b.MessAmount) || 0)
      .input('cl',  sql.Bit,          b.HasCustomLateFine ? 1 : 0)
      .input('cv',  sql.Decimal(10,4), Number(b.CustomLateFineAmount) || 0)
      .input('bk',  sql.Bit,          isBank ? 1 : 0)
      .input('ba',  sql.NVarChar(100), isBank ? (b.BankAccountNumber || null) : null)
      .input('pbg', sql.Int,          isBank && b.PaymentBankGLCAID ? parseInt(b.PaymentBankGLCAID) : null)
      .input('sn',  sql.NVarChar(50),  b.SrNo || null)
      .input('gl',  sql.Int,          b.EmployeeGLID ? parseInt(b.EmployeeGLID) : null)
      .query(`UPDATE gen_EmployeeInfo
                 SET BasicSalary          = COALESCE(@bs, BasicSalary),
                     HasEOBI              = @eb,
                     EOBI                 = @ea,
                     HasFuelAllowance     = @fa,
                     FuelAllowance        = @fv,
                     HasMess              = @ms,
                     MessAmount           = @mv,
                     HasCustomLateFine    = @cl,
                     CustomLateFineAmount = @cv,
                     IsPaidByBank         = @bk,
                     BankAccountNumber    = @ba,
                     PaymentBankGLCAID    = @pbg,
                     SrNo                 = @sn,
                     EmployeeGLID         = COALESCE(@gl, EmployeeGLID)
               WHERE EmployeeID = @id`);
    res.json({ ok: true });
  } catch (err) {
    console.error('setSalarySettings:', err);
    res.status(400).json({ error: err.message });
  }
};

// @route   PATCH /api/employees/:id/technician
exports.toggleTechnician = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('val', sql.Bit, req.body.IsTechnician ? 1 : 0)
      .query('UPDATE gen_EmployeeInfo SET IsTechnician=@val WHERE EmployeeID=@id');
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// @route   POST /api/employees
exports.createEmployee = async (req, res) => {
  try {
    const { 
      EmployeeName, EmployeeNo, FatherName, CNICno, MobileNo, 
      EmployeeGender, PermanentAddress, DOB, EmailAddress,
      DepartmentID, DesignationID, MachineId, BasicSalary, EmployeeGLID,
      ActionUserID 
    } = req.body;

    const pool = await getPool();
    
    const result = await pool.request()
      .input('EmployeeName', sql.VarChar(100), EmployeeName)
      .input('EmployeeNo', sql.VarChar(50), EmployeeNo)
      .input('FatherName', sql.VarChar(100), FatherName)
      .input('CNICno', sql.VarChar(50), CNICno)
      .input('MobileNo', sql.VarChar(50), MobileNo)
      .input('EmployeeGender', sql.VarChar(20), EmployeeGender)
      .input('PermanentAddress', sql.VarChar(sql.MAX), PermanentAddress)
      .input('DOB', sql.Date, DOB ? new Date(DOB) : null)
      .input('EmailAddress', sql.NVarChar(100), EmailAddress)
      .input('DepartmentID', sql.Int, DepartmentID || null)
      .input('DesignationID', sql.Int, DesignationID || null)
      .input('MachineId', sql.Int, MachineId || null)
      .input('BasicSalary', sql.Decimal(18,2), BasicSalary || null)
      .input('EmployeeGLID', sql.Int, EmployeeGLID || null)
      .input('ActionUserID', sql.Int, ActionUserID) 
      .execute('sp_InsertEmployee');

    res.status(201).json({ message: 'Employee Created Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};
