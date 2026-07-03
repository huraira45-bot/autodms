const { sql, dbConfig, getPool } = require('../config/db');

exports.getItems = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM vw_ActiveItems');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
};

/**
 * GET /api/items/issued-summary
 * Owner ask 2026-07-03: show a "total issued" quantity next to each part in
 * the catalog. Returns [{ ItemId, TotalIssuedQty, TotalIssuedValue }].
 * Cheap enough to run on every catalog load (small parts count).
 */
exports.getItemsIssuedSummary = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT sid.ItemId,
             SUM(ISNULL(sid.IssueQuantity, 0))                                          AS TotalIssuedQty,
             SUM(ISNULL(sid.IssueQuantity, 0) * ISNULL(sid.ItemRate, 0)
                 - ISNULL(sid.DiscAmt, 0)
                 + ISNULL(sid.TaxAmount, 0))                                            AS TotalIssuedValue,
             COUNT(DISTINCT sid.StockIssueID)                                           AS IssueCount
      FROM data_StockIssuetoJobCardDetail sid
      GROUP BY sid.ItemId
    `);
    res.json(r.recordset);
  } catch (err) {
    console.error('getItemsIssuedSummary:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.createItem = async (req, res) => {
  try {
    const {
      CategoryID, ManualNumber, ItenName, UOMId, ItemBrandId,
      ItemSalesPrice, ItemPurchasePrice, ItemPurchaseGL, ItemSalesGL,
      WHID, ItemType, Make, ItemModel, Range, SerialNo, CompanyID, Remarks, DepartmentID,
      BinLocation,
    } = req.body;

    const pool = await getPool();
    const result = await pool.request()
      .input('CategoryID', sql.Int, CategoryID)
      // Owner ask 2026-07-03: part numbers are alphanumeric (e.g. AA-12X-B),
      // so we no longer force them into the legacy BIGINT ItemNumber column.
      // The manual part code lives in InventItems.ManualNumber (NVARCHAR 100)
      // and is written by the follow-up UPDATE below.
      .input('ItemNumber', sql.BigInt, null)
      .input('ItenName', sql.NVarChar(200), ItenName)
      .input('UOMId', sql.Int, UOMId)
      .input('ItemBrandId', sql.Int, ItemBrandId || null)
      .input('ItemSalesPrice', sql.Decimal(18,2), ItemSalesPrice || 0)
      .input('ItemPurchasePrice', sql.Decimal(18,2), ItemPurchasePrice || 0)
      .input('ItemPurchaseGL', sql.Int, ItemPurchaseGL || null)
      .input('ItemSalesGL', sql.Int, ItemSalesGL || null)
      .input('WHID', sql.Int, WHID || null)
      .input('ItemType', sql.VarChar(50), ItemType || 'Part')
      .input('Make', sql.NVarChar(100), Make || null)
      .input('ItemModel', sql.NVarChar(100), ItemModel || null)
      .input('Range', sql.NVarChar(100), Range || null)
      .input('SerialNo', sql.NVarChar(100), SerialNo || null)
      .input('CompanyID', sql.Int, CompanyID || null)
      .input('Remarks', sql.NVarChar(sql.MAX), Remarks || null)
      .execute('sp_InsertItem');

    // SP doesn't support DepartmentID / JobTypeID / BinLocation / ReOrderLevel
    // / ManualNumber — set via follow-up UPDATE.
    const newId = result.recordset?.[0]?.NewItemId || result.recordset?.[0]?.ItemId;
    const ReOrderLevel = req.body.ReOrderLevel;
    if (newId && (DepartmentID || req.body.JobTypeID || BinLocation || ReOrderLevel || ManualNumber)) {
      await pool.request()
        .input('id', sql.Int, newId)
        .input('deptId', sql.Int, DepartmentID || null)
        .input('jobTypeId', sql.Int, req.body.JobTypeID || null)
        .input('bin', sql.NVarChar(50), BinLocation || null)
        .input('reorder', sql.Int, ReOrderLevel ? parseInt(ReOrderLevel) : null)
        .input('manNo', sql.NVarChar(100), ManualNumber || null)
        .query(`UPDATE InventItems
                SET DepartmentID=@deptId, JobTypeID=@jobTypeId,
                    BinLocation=@bin, ReOrderLevel=@reorder,
                    ManualNumber=@manNo
                WHERE ItemId=@id`);
    }

    res.status(201).json({ message: 'Item Created Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { ItenName, ItemSalesPrice, ItemPurchasePrice, DepartmentID, JobTypeID,
            CategoryID, BinLocation, UOMId, ItemBrandId, ManualNumber, ReOrderLevel } = req.body;
    const pool = await getPool();
    // Build dynamic SET so callers can omit fields they don't want to touch.
    // Sale price flows from InventItems.ItemSalesPrice -> Store Sale + Parts
    // Issue pickers automatically (they read the same view), so updating here
    // is enough to keep prices consistent across the app.
    const sets = ['ItenName=@name', 'ItemSalesPrice=@price'];
    const r = pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), ItenName)
      .input('price', sql.Decimal(18,2), ItemSalesPrice || 0);
    if (ItemPurchasePrice !== undefined) {
      sets.push('ItemPurchasePrice=@purPrice');
      r.input('purPrice', sql.Decimal(18,2), ItemPurchasePrice || 0);
    }
    if (CategoryID !== undefined && CategoryID !== '') {
      sets.push('CategoryID=@catId');
      r.input('catId', sql.Int, parseInt(CategoryID));
    }
    if (UOMId !== undefined && UOMId !== '') {
      sets.push('UOMId=@uomId');
      r.input('uomId', sql.Int, parseInt(UOMId));
    }
    if (ItemBrandId !== undefined && ItemBrandId !== '') {
      sets.push('ItemBrandId=@brandId');
      r.input('brandId', sql.Int, parseInt(ItemBrandId));
    }
    // Owner ask 2026-07-03: Part No is alphanumeric — save to ManualNumber
    // (NVARCHAR 100). The legacy BIGINT ItemNumber column is left untouched
    // so existing rows keep displaying (COALESCE(ManualNumber, ItemNumber)).
    if (ManualNumber !== undefined) {
      sets.push('ManualNumber=@manNo');
      r.input('manNo', sql.NVarChar(100), ManualNumber || null);
    }
    sets.push('BinLocation=@bin');
    r.input('bin', sql.NVarChar(50), BinLocation || null);
    if (ReOrderLevel !== undefined) {
      sets.push('ReOrderLevel=@reorder');
      r.input('reorder', sql.Int, ReOrderLevel === '' || ReOrderLevel === null ? null : parseInt(ReOrderLevel));
    }
    sets.push('DepartmentID=@deptId', 'JobTypeID=@jobTypeId');
    r.input('deptId', sql.Int, DepartmentID || null);
    r.input('jobTypeId', sql.Int, JobTypeID || null);

    await r.query(`UPDATE InventItems SET ${sets.join(', ')} WHERE ItemId=@id`);
    res.json({ message: 'Item updated' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};
