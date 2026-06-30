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

exports.createItem = async (req, res) => {
  try {
    const {
      CategoryID, ItemNumber, ItenName, UOMId, ItemBrandId,
      ItemSalesPrice, ItemPurchasePrice, ItemPurchaseGL, ItemSalesGL,
      WHID, ItemType, Make, ItemModel, Range, SerialNo, CompanyID, Remarks, DepartmentID,
      BinLocation,
    } = req.body;

    const pool = await getPool();
    const result = await pool.request()
      .input('CategoryID', sql.Int, CategoryID)
      .input('ItemNumber', sql.BigInt, ItemNumber || null)
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

    // SP doesn't support DepartmentID / JobTypeID / BinLocation — set via follow-up UPDATE
    const newId = result.recordset?.[0]?.NewItemId || result.recordset?.[0]?.ItemId;
    if (newId && (DepartmentID || req.body.JobTypeID || BinLocation)) {
      await pool.request()
        .input('id', sql.Int, newId)
        .input('deptId', sql.Int, DepartmentID || null)
        .input('jobTypeId', sql.Int, req.body.JobTypeID || null)
        .input('bin', sql.NVarChar(50), BinLocation || null)
        .query(`UPDATE InventItems
                SET DepartmentID=@deptId, JobTypeID=@jobTypeId, BinLocation=@bin
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
            CategoryID, BinLocation, UOMId, ItemBrandId, ItemNumber } = req.body;
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
    if (ItemNumber !== undefined) {
      sets.push('ItemNumber=@itemNo');
      r.input('itemNo', sql.BigInt, ItemNumber || null);
    }
    sets.push('BinLocation=@bin');
    r.input('bin', sql.NVarChar(50), BinLocation || null);
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
