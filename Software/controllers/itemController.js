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
      WHID, ItemType, Make, ItemModel, Range, SerialNo, CompanyID, Remarks, DepartmentID
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

    // SP doesn't support DepartmentID/JobTypeID — set via follow-up UPDATE
    const newId = result.recordset?.[0]?.ItemId;
    if (newId && (DepartmentID || req.body.JobTypeID)) {
      await pool.request()
        .input('id', sql.Int, newId)
        .input('deptId', sql.Int, DepartmentID || null)
        .input('jobTypeId', sql.Int, req.body.JobTypeID || null)
        .query('UPDATE InventItems SET DepartmentID=@deptId, JobTypeID=@jobTypeId WHERE ItemId=@id');
    }

    res.status(201).json({ message: 'Item Created Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { ItenName, ItemSalesPrice, DepartmentID, JobTypeID } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(200), ItenName)
      .input('price', sql.Decimal(18,2), ItemSalesPrice || 0)
      .input('deptId', sql.Int, DepartmentID || null)
      .input('jobTypeId', sql.Int, JobTypeID || null)
      .query('UPDATE InventItems SET ItenName=@name, ItemSalesPrice=@price, DepartmentID=@deptId, JobTypeID=@jobTypeId WHERE ItemId=@id');
    res.json({ message: 'Item updated' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};
