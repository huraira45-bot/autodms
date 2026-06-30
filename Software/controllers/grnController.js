const { sql, dbConfig, getPool } = require('../config/db');
const multer = require('multer');
const path = require('path');

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

exports.uploadMiddleware = upload.single('BillImage');

exports.saveGRN = async (req, res) => {
  try {
    const {
      PurchaseDate, SupplierBillNo, PartyID, WHID, NTN, Remarks, Items,
    } = req.body;

    const parsedItems = typeof Items === 'string' ? JSON.parse(Items) : Items;
    const imagePath = req.file ? req.file.path : null;

    // sp_SavePurchaseGRN's OPENJSON expects the legacy key names (ItemID, Qty,
    // Rate, Tax, Discount, DiscType, IsGST, OtherExp, SalesRate). The new
    // format uses ItemId/Quantity/ItemRate/etc — map them so the SP's inserts
    // pick up the values. The new columns (AdditionalDiscount*, AITAmount,
    // TaxRate) are patched per-line in the follow-up UPDATE below.
    const spItems = (parsedItems || []).map(it => ({
      ItemID:    it.ItemId ?? it.ItemID,
      Qty:       Number(it.Quantity ?? it.Qty) || 0,
      Rate:      Number(it.ItemRate ?? it.Rate) || 0,
      Tax:       Number(it.TaxAmount ?? it.Tax) || 0,
      Discount:  Number(it.DiscountAmount ?? it.Discount) || 0,
      DiscType:  'Amount',
      IsGST:     1,
      OtherExp:  0,
      SalesRate: Number(it.SalesRate ?? it.ItemRate ?? it.Rate) || 0,
    }));

    const pool = await getPool();
    const result = await pool.request()
      .input('PurchaseDate',   sql.DateTime,        PurchaseDate)
      .input('SupplierBillNo', sql.NVarChar(100),   SupplierBillNo)
      .input('PartyID',        sql.Int,             PartyID)
      .input('WHID',           sql.Int,             WHID)
      .input('Remarks',        sql.NVarChar(sql.MAX), Remarks || '')
      .input('NetDiscount',    sql.Decimal(18,2),   0)
      .input('FreightAmount',  sql.Decimal(18,2),   0)
      .input('ImagePath',      sql.NVarChar(sql.MAX), imagePath)
      .input('ItemsJSON',      sql.NVarChar(sql.MAX), JSON.stringify(spItems))
      .execute('sp_SavePurchaseGRN');

    const newId = result.recordset[0]?.NewPurchaseID;
    if (newId) {
      const counterRes = await pool.request()
        .query("UPDATE dms_DocCounters SET CurrentCounter = CurrentCounter + 1 OUTPUT INSERTED.CurrentCounter WHERE DocType = 'GRN'");
      const counter = counterRes.recordset[0]?.CurrentCounter ?? 0;
      const voucherNo = `GRN-${String(counter).padStart(4, '0')}`;

      // Follow-up UPDATE on header: voucher number + creator metadata.
      // (FreightTaxable retained for legacy schema; not used by new format.)
      await pool.request()
        .input('id', sql.Int, newId)
        .input('no', sql.NVarChar(50), voucherNo)
        .input('by', sql.Int, req.user?.userId || null)
        .input('byName', sql.NVarChar(100), req.user?.userName || '')
        .query(`UPDATE data_PurchaseInfo
                SET PurchaseVoucherNo=@no, CreatedBy=@by, CreatedByName=@byName,
                    FreightTaxable=0
                WHERE PurchaseID=@id`);

      // Per-line patch: the SP only persists base columns. Apply the
      // user-entered GST / additional-discount / AIT directly per line.
      // UnitLandedCost = gross unit retail (ItemRate) per the owner decision
      // — discounts post separately to PARTS_DISCOUNT_RECEIVED rather than
      // being netted out of inventory cost.
      const linesRes = await pool.request()
        .input('id', sql.Int, newId)
        .query('SELECT PurchaseDetailID FROM data_PurchaseDetail WHERE PurchaseID=@id ORDER BY PurchaseDetailID');
      const detailIds = linesRes.recordset.map(r => r.PurchaseDetailID);

      for (let i = 0; i < parsedItems.length && i < detailIds.length; i++) {
        const li = parsedItems[i] || {};
        const did = detailIds[i];
        const itemRate = Number(li.ItemRate) || 0;
        await pool.request()
          .input('id',   sql.Int,           did)
          .input('tr',   sql.Decimal(8,4),  Number(li.TaxRate) || 0)
          .input('ta',   sql.Decimal(18,2), Number(li.TaxAmount) || 0)
          .input('ulc',  sql.Decimal(18,4), itemRate)
          .input('addp', sql.Decimal(8,3),  Number(li.AdditionalDiscountPct) || 0)
          .input('adda', sql.Decimal(18,2), Number(li.AdditionalDiscountAmount) || 0)
          .input('ait',  sql.Decimal(18,2), Number(li.AITAmount) || 0)
          .query(`UPDATE data_PurchaseDetail
                  SET TaxRate=@tr, TaxAmount=@ta, UnitLandedCost=@ulc,
                      AdditionalDiscountPct=@addp,
                      AdditionalDiscountAmount=@adda,
                      AITAmount=@ait
                  WHERE PurchaseDetailID=@id`);
      }
    }
    res.status(201).json({ message: 'GRN Saved Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

// GET /api/grn/:id/print-data — gated on IsFinalized
exports.getGRNPrintData = async (req, res) => {
    try {
        const pool = await getPool();
        const head = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT IsFinalized FROM data_PurchaseInfo WHERE PurchaseID=@id');
        if (!head.recordset.length) return res.status(404).json({ error: 'GRN not found' });
        if (!head.recordset[0].IsFinalized) {
            return res.status(409).json({ error: 'GRN must be finalized before printing.' });
        }
        return exports.getGRNById(req, res);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/grn/:id  — single GRN + lines (for open / edit / print)
exports.getGRNById = async (req, res) => {
    try {
        const pool = await getPool();
        const hdr = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT * FROM vw_PurchaseGRNHeader WHERE PurchaseID=@id');
        if (!hdr.recordset.length) return res.status(404).json({ error: 'GRN not found' });
        const lines = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT d.*, i.ItenName, i.ItemNumber
                    FROM data_PurchaseDetail d
                    LEFT JOIN InventItems i ON i.ItemId = d.ItemId
                    WHERE d.PurchaseID=@id`);
        res.json({ ...hdr.recordset[0], Items: lines.recordset });
    } catch (err) {
        console.error('getGRNById:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/grn/:id  — update existing GRN (refused if finalized).
// Replaces all detail lines; finalize gate enforced at the DB layer.
exports.updateGRN = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const hdr = await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query('SELECT IsFinalized FROM data_PurchaseInfo WITH (UPDLOCK, HOLDLOCK) WHERE PurchaseID=@id');
        if (!hdr.recordset.length) throw new Error('GRN not found.');
        if (hdr.recordset[0].IsFinalized) {
            const e = new Error('GRN is finalized — cannot edit.'); e.statusCode = 423; throw e;
        }

        const {
            PurchaseDate, SupplierBillNo, PartyID, WHID, Remarks, Items,
        } = req.body;
        const parsedItems = typeof Items === 'string' ? JSON.parse(Items) : Items;

        await new sql.Request(tx)
            .input('id',   sql.Int,            id)
            .input('pd',   sql.DateTime,       PurchaseDate)
            .input('sbn',  sql.NVarChar(100),  SupplierBillNo)
            .input('pid',  sql.Int,            PartyID)
            .input('whid', sql.Int,            WHID)
            .input('rem',  sql.NVarChar(sql.MAX), Remarks || '')
            .query(`UPDATE data_PurchaseInfo
                    SET PurchaseDate=@pd, FBRInvoiceNumber=@sbn, PartyID=@pid,
                        WHID=@whid, Remarks=@rem,
                        DiscountAmount=0, FreightAmount=0, FreightTaxable=0
                    WHERE PurchaseID=@id`);

        await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query('DELETE FROM data_PurchaseDetail WHERE PurchaseID=@id');

        for (const li of (parsedItems || [])) {
            const itemRate = parseFloat(li.ItemRate) || 0;
            await new sql.Request(tx)
                .input('pid',   sql.Int,            id)
                .input('iid',   sql.Int,            parseInt(li.ItemId))
                .input('qty',   sql.Decimal(18,3),  parseFloat(li.Quantity) || 0)
                .input('rate',  sql.Decimal(18,2),  itemRate)
                .input('dp',    sql.Decimal(8,3),   parseFloat(li.DiscountPercentage) || 0)
                .input('da',    sql.Decimal(18,2),  parseFloat(li.DiscountAmount) || 0)
                .input('na',    sql.Decimal(18,2),  parseFloat(li.NetAmount) || 0)
                .input('sr',    sql.Decimal(18,2),  parseFloat(li.StockRate) || 0)
                .input('tr',    sql.Decimal(8,4),   parseFloat(li.TaxRate) || 0)
                .input('ta',    sql.Decimal(18,2),  parseFloat(li.TaxAmount) || 0)
                .input('addp',  sql.Decimal(8,3),   parseFloat(li.AdditionalDiscountPct) || 0)
                .input('adda',  sql.Decimal(18,2),  parseFloat(li.AdditionalDiscountAmount) || 0)
                .input('ait',   sql.Decimal(18,2),  parseFloat(li.AITAmount) || 0)
                .input('ulc',   sql.Decimal(18,4),  itemRate)
                .query(`INSERT INTO data_PurchaseDetail
                            (PurchaseID, ItemId, Quantity, ItemRate,
                             DiscountPercentage, DiscountAmount, NetAmount, StockRate,
                             TaxRate, TaxAmount,
                             AdditionalDiscountPct, AdditionalDiscountAmount, AITAmount,
                             UnitLandedCost)
                        VALUES (@pid, @iid, @qty, @rate, @dp, @da, @na, @sr,
                                @tr, @ta, @addp, @adda, @ait, @ulc)`);
        }

        await tx.commit();
        res.json({ message: 'GRN updated.' });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('updateGRN:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

exports.getGRNs = async (req, res) => {
  try {
    const { search } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let query = 'SELECT TOP 100 * FROM vw_PurchaseGRNHeader';
    if (search) {
      request.input('search', sql.NVarChar(100), `%${search}%`);
      query += ' WHERE PurchaseVoucherNo LIKE @search OR SupplierBillNo LIKE @search OR PartyName LIKE @search';
    }
    query += ' ORDER BY PurchaseID DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
