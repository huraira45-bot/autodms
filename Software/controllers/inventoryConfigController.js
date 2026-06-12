const { sql, dbConfig, getPool } = require('../config/db');

// --- CATEGORIES ---
exports.getCategories = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveCategories');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createCategory = async (req, res) => {
  try {
    const { CategoryName, Description } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('CategoryName', sql.NVarChar(100), CategoryName)
      .input('Description', sql.NVarChar(sql.MAX), Description)
      .execute('sp_InsertCategory');
    res.status(201).json(result.recordset);
  } catch (err) { res.status(400).json({ error: err.message }); }
};

// --- BRANDS ---
exports.getBrands = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveBrands');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createBrand = async (req, res) => {
  try {
    const { BrandName } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('BrandName', sql.NVarChar(100), BrandName)
      .execute('sp_InsertBrand');
    res.status(201).json(result.recordset);
  } catch (err) { res.status(400).json({ error: err.message }); }
};

// --- UOMs ---
exports.getUOMs = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveUOMs');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createUOM = async (req, res) => {
  try {
    const { UOMName, Scale } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('UOMName', sql.NVarChar(100), UOMName)
      .input('Scale', sql.Decimal(18,2), Scale || 1.00)
      .execute('sp_InsertUOM');
    res.status(201).json(result.recordset);
  } catch (err) { res.status(400).json({ error: err.message }); }
};

// --- WAREHOUSES ---
exports.getWarehouses = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveWarehouses');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createWarehouse = async (req, res) => {
  try {
    const { WHDesc, WhCode, PhoneNo, LocationAddress } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('WHDesc', sql.NVarChar(200), WHDesc)
      .input('WhCode', sql.NVarChar(50), WhCode || null)
      .input('PhoneNo', sql.NVarChar(50), PhoneNo || null)
      .input('LocationAddress', sql.NVarChar(sql.MAX), LocationAddress || null)
      .execute('sp_InsertWarehouse');
    res.status(201).json(result.recordset);
  } catch (err) { res.status(400).json({ error: err.message }); }
};
