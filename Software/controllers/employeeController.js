const { sql, dbConfig, getPool } = require('../config/db');

// @route   GET /api/employees
exports.getEmployees = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT e.*,
             d.DepartmentName,
             des.DesignationName,
             r.EmployeeName AS ReportsToName
      FROM vw_ActiveEmployees e
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
exports.setActive = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .input('val', sql.Bit, req.body.IsActive ? 1 : 0)
      .query('UPDATE gen_EmployeeInfo SET IsActive=@val WHERE EmployeeID=@id');
    res.json({ message: 'Active status updated' });
  } catch (err) {
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
