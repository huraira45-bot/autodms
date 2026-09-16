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

/**
 * GET /api/items/stock-on-hand
 * Owner ask 2026-09-10: the part pickers on Store Sale and Parts Issue should
 * show how many are actually in stock, so the counter finds out before adding
 * the line rather than at save time via "Insufficient stock".
 *
 * Same formula as services/stockBalanceService.getOnHand — arrivals plus the
 * signed in/out ledger — but aggregated for every item in one pass instead of
 * one query per item. Returns [{ ItemId, OnHand }].
 *
 * This is a display hint only. The authoritative check stays assertEnoughStock
 * inside the save transaction, because stock can move between the picker
 * rendering and the save.
 */
exports.getStockOnHand = async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT i.ItemId,
             ISNULL(a.Qty, 0) + ISNULL(io.Qty, 0) AS OnHand
      FROM InventItems i
      LEFT JOIN (SELECT ItemId, SUM(ISNULL(Quantity,0)) AS Qty
                 FROM data_StockArrivalDetail GROUP BY ItemId) a  ON a.ItemId  = i.ItemId
      LEFT JOIN (SELECT ItemId, SUM(ISNULL(Quantity,0)) AS Qty
                 FROM data_StockInOutDetail   GROUP BY ItemId) io ON io.ItemId = i.ItemId
      WHERE ISNULL(i.ItemType, 'Part') = 'Part'
    `);
    res.json(r.recordset.map(x => ({ ItemId: x.ItemId, OnHand: Number(x.OnHand) || 0 })));
  } catch (err) {
    console.error('getStockOnHand:', err);
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

    // Owner ask 2026-08-01: never let a part's sale price undercut its
    // purchase price. Only checked when both are actually set (0 = not
    // priced yet, not a real sale-below-cost case).
    const salePrice = Number(ItemSalesPrice) || 0;
    const purchasePrice = Number(ItemPurchasePrice) || 0;
    if (salePrice > 0 && purchasePrice > 0 && salePrice < purchasePrice) {
      return res.status(400).json({
        error: `Sale price (${salePrice.toFixed(2)}) can't be less than purchase price (${purchasePrice.toFixed(2)}).`,
      });
    }

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
    const { SupersededByItemId, SupersededByNumber } = req.body;
    if (newId && (DepartmentID || req.body.JobTypeID || BinLocation || ReOrderLevel || ManualNumber
                  || SupersededByItemId || SupersededByNumber)) {
      await pool.request()
        .input('id', sql.Int, newId)
        .input('deptId', sql.Int, DepartmentID || null)
        .input('jobTypeId', sql.Int, req.body.JobTypeID || null)
        .input('bin', sql.NVarChar(50), BinLocation || null)
        .input('reorder', sql.Int, ReOrderLevel ? parseInt(ReOrderLevel) : null)
        .input('manNo', sql.NVarChar(100), ManualNumber || null)
        .input('supId', sql.Int, SupersededByItemId ? parseInt(SupersededByItemId) : null)
        .input('supNo', sql.NVarChar(100), SupersededByNumber || null)
        .query(`UPDATE InventItems
                SET DepartmentID=@deptId, JobTypeID=@jobTypeId,
                    BinLocation=@bin, ReOrderLevel=@reorder,
                    ManualNumber=@manNo,
                    SupersededByItemId=@supId, SupersededByNumber=@supNo
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
            CategoryID, BinLocation, UOMId, ItemBrandId, ManualNumber, ReOrderLevel,
            SupersededByItemId, SupersededByNumber } = req.body;
    const pool = await getPool();

    // Owner ask 2026-08-01: never let a part's sale price undercut its
    // purchase price. If this request isn't also changing the purchase
    // price, check against whatever's currently on file. Only enforced
    // when both sides are actually priced (0 = not priced yet).
    const salePrice = Number(ItemSalesPrice) || 0;
    if (salePrice > 0) {
      let purchasePrice = ItemPurchasePrice !== undefined ? Number(ItemPurchasePrice) || 0 : null;
      if (purchasePrice === null) {
        const cur = await pool.request().input('id', sql.Int, req.params.id)
          .query('SELECT ItemPurchasePrice FROM InventItems WHERE ItemId=@id');
        purchasePrice = Number(cur.recordset[0]?.ItemPurchasePrice) || 0;
      }
      if (purchasePrice > 0 && salePrice < purchasePrice) {
        return res.status(400).json({
          error: `Sale price (${salePrice.toFixed(2)}) can't be less than purchase price (${purchasePrice.toFixed(2)}).`,
        });
      }
    }

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
    // Supersession (owner ask 2026-09-10). Both are clearable — sending '' must
    // null the column, otherwise a part wrongly marked superseded could never
    // be marked current again.
    if (SupersededByItemId !== undefined) {
      sets.push('SupersededByItemId=@supId');
      r.input('supId', sql.Int, SupersededByItemId === '' || SupersededByItemId === null ? null : parseInt(SupersededByItemId));
    }
    if (SupersededByNumber !== undefined) {
      sets.push('SupersededByNumber=@supNo');
      r.input('supNo', sql.NVarChar(100), SupersededByNumber || null);
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

// ---------------------------------------------------------------------------
// Delete / hide (owner ask 2026-09-16: let admin delete labour jobs)
// ---------------------------------------------------------------------------

// Where a catalog item can be referenced, and what to call it when telling
// someone why it can't be deleted. A job card line keeps only the item's id
// (Addata_JobCardInfoDetail.JobInfoId), with no foreign key, so deleting a
// used job would leave old job cards pointing at nothing — hence this list
// rather than relying on the database to refuse.
const ITEM_USAGE = [
  ['Addata_JobCardInfoDetail',        'JobInfoId',          'job cards'],
  ['Addata_JobCardInfoSubletJobDetail', 'JobInfoId',        'sublet jobs'],
  ['Addata_JobCardInfoPartsDetail',   'JobInfoId',          'job card parts'],
  ['Addata_JobCardInfolubricantDetail', 'JobInfoId',        'job card lubricants'],
  ['Addata_JobCardInfocheckboxDetail', 'JobInfoId',         'job card checklists'],
  ['Addata_JobCardInfosubjobDetail',  'JobInfoId',          'job card sub-jobs'],
  ['Addata_JobCardInfosubpartsDetail', 'JobInfoId',         'job card sub-parts'],
  ['addata_CustomerInvoiceDetailInfo', 'JobInfoId',         'customer invoices'],
  ['addata_CustomerInvoiceSubletJobDetail', 'JobInfoId',    'customer invoices'],
  ['adgen_ScheduleMaintainceDetail',  'JobInfoId',          'maintenance schedules'],
  ['dms_ServiceCampaignEligibleJobs', 'JobInfoId',          'service campaigns'],
  ['dms_ServiceEstimateLines',        'ItemID',             'service tablet estimates'],
  ['dms_PartsRequisitionLines',       'ItemID',             'parts requests'],
  ['data_StockIssuetoJobCardDetail',  'ItemId',             'parts issues'],
  ['data_StockInOutDetail',           'ItemId',             'stock movements'],
  ['data_StockArrivalDetail',         'ItemId',             'stock arrivals'],
  ['data_PurchaseDetail',             'ItemId',             'purchases (GRN)'],
  ['data_PurchaseReturnDetail',       'ItemId',             'purchase returns'],
  ['data_StoreSaleDetail',            'ItemId',             'store sales'],
  ['data_StoreSaleReturnDetail',      'ItemId',             'store sale returns'],
  ['adgen_InsuranceJobEstimateDetail', 'ItemId',            'insurance estimates'],
  ['paint_Issue',                     'ItemId',             'paint issues'],
  ['InventItems',                     'SupersededByItemId', 'another item superseded by it'],
];

/** Where this item is already used: [{ where, count }], empty when nowhere. */
async function itemUsage(pool, itemId) {
  // Only look at tables/columns this database actually has — the legacy schema
  // differs between installs.
  const present = (await pool.request().query(`
      SELECT t.name AS tbl, c.name AS col
      FROM   sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
      WHERE  t.is_ms_shipped = 0
        AND  c.name IN ('ItemId', 'ItemID', 'JobInfoId', 'SupersededByItemId')`)).recordset;
  const has = new Set(present.map(x => `${x.tbl.toLowerCase()}.${x.col.toLowerCase()}`));
  const checks = ITEM_USAGE.filter(([tbl, col]) => has.has(`${tbl.toLowerCase()}.${col.toLowerCase()}`));
  if (!checks.length) return [];

  const sqlText = checks
    .map(([tbl, col], i) => `SELECT ${i} AS i, COUNT(*) AS n FROM [${tbl}] WHERE [${col}] = @id`)
    .join(' UNION ALL ');
  const rows = (await pool.request().input('id', sql.Int, itemId).query(sqlText)).recordset;

  const byLabel = new Map();
  for (const row of rows) {
    if (!row.n) continue;
    const label = checks[row.i][2];
    byLabel.set(label, (byLabel.get(label) || 0) + Number(row.n));
  }
  return [...byLabel].map(([where, count]) => ({ where, count }));
}

const describeUsage = (usage) => usage.map(u => `${u.count} ${u.where}`).join(', ');

/**
 * DELETE /api/items/:id
 * Deletes a labour job or part outright, but only when it has never been used.
 * Anything with history is refused with where it is used, and the caller is
 * told it can be hidden instead (canHide).
 */
exports.deleteItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid item id.' });
    const pool = await getPool();
    const item = (await pool.request().input('id', sql.Int, id)
      .query('SELECT ItemId, ItenName, ItemType FROM InventItems WHERE ItemId = @id')).recordset[0];
    if (!item) return res.status(404).json({ error: 'That item no longer exists.' });

    const usage = await itemUsage(pool, id);
    if (usage.length) {
      return res.status(409).json({
        error: `"${item.ItenName}" is used on ${describeUsage(usage)}, so it cannot be deleted.`,
        usage,
        canHide: true,
      });
    }

    try {
      await pool.request().input('id', sql.Int, id).query('DELETE FROM InventItems WHERE ItemId = @id');
    } catch (e) {
      if (/REFERENCE constraint|FOREIGN KEY/i.test(e.message)) {
        return res.status(409).json({
          error: `"${item.ItenName}" is used elsewhere in the system, so it cannot be deleted.`,
          canHide: true,
        });
      }
      throw e;
    }
    console.warn(`[items] ${req.user?.userName || 'unknown user'} deleted ${item.ItemType || 'item'} ${id} "${item.ItenName}"`);
    res.json({ message: 'Deleted', ItemId: id, ItenName: item.ItenName });
  } catch (err) {
    console.error('deleteItem:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/items/:id/status   { IsActive }
 * Hides a job or part from every picker without touching history, or brings
 * it back. Hidden items keep working on the records that already use them.
 */
exports.setItemStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid item id.' });
    const raw = req.body?.IsActive;
    if (raw === undefined) return res.status(400).json({ error: 'Send IsActive: true or false.' });
    const isActive = raw === true || raw === 1 || raw === 'true' || raw === '1';
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .input('st', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE InventItems SET ItemStatus = @st WHERE ItemId = @id');
    if (!r.rowsAffected[0]) return res.status(404).json({ error: 'That item no longer exists.' });
    res.json({ ItemId: id, IsActive: isActive });
  } catch (err) {
    console.error('setItemStatus:', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/items/hidden?type=Service
 * Items switched off (ItemStatus = 0), so a screen can show and restore them.
 * vw_ActiveItems — what every picker reads — leaves these out.
 */
exports.getHiddenItems = async (req, res) => {
  try {
    const pool = await getPool();
    const rq = pool.request();
    const conds = ['i.ItemStatus = 0'];
    if (req.query.type) {
      rq.input('t', sql.VarChar(10), String(req.query.type));
      conds.push('i.ItemType = @t');
    }
    const r = await rq.query(`
      SELECT i.ItemId, i.ItenName, i.ItemNumber, i.ManualNumber, i.ItemSalesPrice, i.ItemPurchasePrice,
             i.ItemType, i.UOMId, i.CategoryID, i.DepartmentID, i.JobTypeID, i.BinLocation,
             jt.CardCode AS JobTypeCode, jt.Title AS JobTypeName
      FROM   InventItems i
      LEFT   JOIN gen_JobCardType jt ON i.JobTypeID = jt.JobCardTypeId
      WHERE  ${conds.join(' AND ')}
      ORDER  BY i.ItenName`);
    res.json(r.recordset);
  } catch (err) {
    console.error('getHiddenItems:', err);
    res.status(500).json({ error: err.message });
  }
};
