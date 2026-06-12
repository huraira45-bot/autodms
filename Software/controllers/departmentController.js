const { sql, dbConfig, getPool } = require('../config/db');

exports.getDepartments = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveDepartments');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const { CompanyID, DepartmentName, ActionUserID } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('CompanyID', sql.Int, CompanyID)
      .input('DepartmentName', sql.VarChar(100), DepartmentName)
      .input('ActionUserID', sql.Int, ActionUserID)
      .execute('sp_InsertDepartment');

    res.status(201).json({ message: 'Department Created Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

// @route PATCH /api/departments/:id/manager
exports.setDepartmentManager = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .input('emp', sql.Int, req.body.ManagerEmployeeID ? parseInt(req.body.ManagerEmployeeID) : null)
      .query('UPDATE gen_DepartmentInfo SET ManagerEmployeeID=@emp WHERE DepartmentID=@id');
    res.json({ message: 'Department manager updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
