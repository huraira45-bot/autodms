const { sql, dbConfig, getPool } = require('../config/db');

exports.getBranches = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveBranches');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
};

exports.createBranch = async (req, res) => {
  try {
    const { CompanyID, BranchName, BranchCode, BranchNumber, ActionUserID } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('CompanyID', sql.Int, CompanyID)
      .input('BranchName', sql.VarChar(100), BranchName)
      .input('BranchCode', sql.VarChar(50), BranchCode)
      .input('BranchNumber', sql.VarChar(50), BranchNumber)
      .input('ActionUserID', sql.Int, ActionUserID)
      .execute('sp_InsertBranch');

    res.status(201).json({ message: 'Branch Created Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};
