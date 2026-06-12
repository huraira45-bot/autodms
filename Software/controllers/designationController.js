const { sql, dbConfig, getPool } = require('../config/db');

exports.getDesignations = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveDesignations');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
};

exports.createDesignation = async (req, res) => {
  try {
    const { CompanyID, DesignationName, ActionUserID } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('CompanyID', sql.Int, CompanyID)
      .input('DesignationName', sql.VarChar(100), DesignationName)
      .input('ActionUserID', sql.Int, ActionUserID)
      .execute('sp_InsertDesignation');

    res.status(201).json({ message: 'Designation Created Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};
