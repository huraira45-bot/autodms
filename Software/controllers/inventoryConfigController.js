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

// --- DELETE (owner ask 2026-07-03) ---
// Small helper: refuse if the row is referenced by any InventItems row so we
// never orphan a live part. Categories/brands/uoms are hard-deleted; the
// warehouse table has an InActive column so we soft-delete that one so
// historical stock/GRN rows still resolve back to a warehouse name.

async function refuseIfInUse(pool, { column, id, label }) {
  const r = await pool.request()
    .input('id', sql.Int, id)
    .query(`SELECT COUNT(*) AS n FROM InventItems WHERE ${column} = @id`);
  if (r.recordset[0].n > 0) {
    const e = new Error(`Cannot delete ${label} — it is still used by ${r.recordset[0].n} part(s). Reassign those parts first.`);
    e.status = 409;
    throw e;
  }
}

exports.deleteCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getPool();
    await refuseIfInUse(pool, { column: 'CategoryID', id, label: 'category' });
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM InventCategory WHERE CategoryID=@id');
    res.json({ message: 'Category deleted' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
};

exports.deleteBrand = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getPool();
    await refuseIfInUse(pool, { column: 'ItemBrandId', id, label: 'brand' });
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM InventItemBrands WHERE ItemBrandId=@id');
    res.json({ message: 'Brand deleted' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
};

exports.deleteUOM = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getPool();
    await refuseIfInUse(pool, { column: 'UOMId', id, label: 'unit of measure' });
    await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM InventUOM WHERE UOMId=@id');
    res.json({ message: 'Unit of measure deleted' });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
};

exports.deleteWarehouse = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getPool();
    // Warehouses can't be hard-deleted because historic GRN / stock rows point
    // at them by FK. Soft-delete via the existing InActive column instead.
    const r = await pool.request().input('id', sql.Int, id)
      .query('UPDATE InventWareHouse SET InActive=1 WHERE WHID=@id');
    if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'Warehouse not found' });
    res.json({ message: 'Warehouse archived' });
  } catch (err) { res.status(400).json({ error: err.message }); }
};
