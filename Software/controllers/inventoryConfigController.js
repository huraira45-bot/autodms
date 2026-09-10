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

// ---------------------------------------------------------------------------
// UPDATES — owner ask 2026-09-10: "in inventory setting there must be an
// option to edit the values". Until now these four lists could only be created
// and deleted, so fixing a typo in a category or warehouse name meant deleting
// it — which refuseIfInUse blocks the moment anything references it, leaving
// the bad name stuck permanently.
//
// Renaming is safe in a way deleting is not: every reference is by id, so the
// label can change without touching a single transaction row.
// ---------------------------------------------------------------------------

// Rejects blank/whitespace names before they reach the database, and rejects a
// name already used by a DIFFERENT row so the lists stay unambiguous.
async function assertNameFree(pool, { table, nameCol, idCol, id, value, label }) {
    const trimmed = (value || '').trim();
    if (!trimmed) {
        const e = new Error(`${label} name cannot be empty.`); e.status = 400; throw e;
    }
    const dup = await pool.request()
        .input('n', sql.NVarChar(200), trimmed)
        .input('id', sql.Int, id)
        .query(`SELECT TOP 1 ${idCol} FROM ${table} WHERE ${nameCol} = @n AND ${idCol} <> @id`);
    if (dup.recordset.length) {
        const e = new Error(`Another ${label.toLowerCase()} is already called "${trimmed}".`);
        e.status = 409; throw e;
    }
    return trimmed;
}

exports.updateCategory = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const name = await assertNameFree(pool, {
            table: 'InventCategory', nameCol: 'CategoryName', idCol: 'CategoryID',
            id, value: req.body.CategoryName, label: 'Category',
        });
        const r = await pool.request().input('id', sql.Int, id)
            .input('n', sql.NVarChar(100), name)
            .query('UPDATE InventCategory SET CategoryName=@n WHERE CategoryID=@id');
        if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'Category not found' });
        res.json({ message: 'Category updated', CategoryName: name });
    } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
};

exports.updateBrand = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const name = await assertNameFree(pool, {
            table: 'InventItemBrands', nameCol: 'BrandName', idCol: 'ItemBrandId',
            id, value: req.body.BrandName, label: 'Brand',
        });
        const r = await pool.request().input('id', sql.Int, id)
            .input('n', sql.NVarChar(100), name)
            .query('UPDATE InventItemBrands SET BrandName=@n WHERE ItemBrandId=@id');
        if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'Brand not found' });
        res.json({ message: 'Brand updated', BrandName: name });
    } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
};

exports.updateUOM = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const name = await assertNameFree(pool, {
            table: 'InventUOM', nameCol: 'UOMName', idCol: 'UOMId',
            id, value: req.body.UOMName, label: 'Unit of measure',
        });
        // Scale is intentionally NOT editable here. It converts between a unit
        // and the item's base unit, and historic GRN / issue quantities were
        // converted with the OLD scale -- changing it silently rewrites what
        // every past document meant. (Precisely the gram/piece class of bug
        // that corrupted the paint stock in Aug 2026.)
        const r = await pool.request().input('id', sql.Int, id)
            .input('n', sql.NVarChar(100), name)
            .query('UPDATE InventUOM SET UOMName=@n WHERE UOMId=@id');
        if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'Unit of measure not found' });
        res.json({ message: 'Unit of measure updated', UOMName: name });
    } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
};

exports.updateWarehouse = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { WhCode, PhoneNo, LocationAddress } = req.body;
        const pool = await getPool();
        const name = await assertNameFree(pool, {
            table: 'InventWareHouse', nameCol: 'WHDesc', idCol: 'WHID',
            id, value: req.body.WHDesc, label: 'Warehouse',
        });
        const r = await pool.request().input('id', sql.Int, id)
            .input('n',    sql.NVarChar(200), name)
            .input('code', sql.NVarChar(50),  WhCode || null)
            .input('ph',   sql.NVarChar(50),  PhoneNo || null)
            .input('addr', sql.NVarChar(sql.MAX), LocationAddress || null)
            .query(`UPDATE InventWareHouse
                    SET WHDesc=@n, WhCode=@code, PhoneNo=@ph, LocationAddress=@addr
                    WHERE WHID=@id`);
        if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'Warehouse not found' });
        res.json({ message: 'Warehouse updated', WHDesc: name });
    } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
};
