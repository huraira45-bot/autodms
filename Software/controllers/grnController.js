const { sql, dbConfig, getPool } = require('../config/db');
const multer = require('multer');
const path = require('path');
const { resolveRate } = require('./taxRatesController');
const { snapshotGRNLines } = require('../utils/grnJournalBuilder');

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
      PurchaseDate, SupplierBillNo, PartyID, WHID,
      Remarks, NetDiscount, FreightAmount, FreightTaxable, Items
    } = req.body;

    // Parsed items if sent as string (multipart form)
    const parsedItems = typeof Items === 'string' ? JSON.parse(Items) : Items;
    const imagePath = req.file ? req.file.path : null;
    // FreightTaxable from form (may arrive as 'true'/'false' string in multipart) — default true per Decision #15
    const freightTaxableFlag = (FreightTaxable === false || FreightTaxable === 'false' || FreightTaxable === '0') ? 0 : 1;

    const pool = await getPool();
    const result = await pool.request()
      .input('PurchaseDate', sql.DateTime, PurchaseDate)
      .input('SupplierBillNo', sql.NVarChar(100), SupplierBillNo)
      .input('PartyID', sql.Int, PartyID)
      .input('WHID', sql.Int, WHID)
      .input('Remarks', sql.NVarChar(sql.MAX), Remarks || '')
      .input('NetDiscount', sql.Decimal(18,2), NetDiscount || 0)
      .input('FreightAmount', sql.Decimal(18,2), FreightAmount || 0)
      .input('ImagePath', sql.NVarChar(sql.MAX), imagePath)
      .input('ItemsJSON', sql.NVarChar(sql.MAX), JSON.stringify(parsedItems))
      .execute('sp_SavePurchaseGRN');

    const newId = result.recordset[0]?.NewPurchaseID;
    if (newId) {
      const counterRes = await pool.request()
        .query("UPDATE dms_DocCounters SET CurrentCounter = CurrentCounter + 1 OUTPUT INSERTED.CurrentCounter WHERE DocType = 'GRN'");
      const counter = counterRes.recordset[0]?.CurrentCounter ?? 0;
      const voucherNo = `GRN-${String(counter).padStart(4, '0')}`;
      // Follow-up UPDATE on header: voucher no, creator metadata, freight-taxable flag
      await pool.request()
        .input('id', sql.Int, newId)
        .input('no', sql.NVarChar(50), voucherNo)
        .input('by', sql.Int, req.user?.userId || null)
        .input('byName', sql.NVarChar(100), req.user?.userName || '')
        .input('ft', sql.Bit, freightTaxableFlag)
        .query('UPDATE data_PurchaseInfo SET PurchaseVoucherNo=@no, CreatedBy=@by, CreatedByName=@byName, FreightTaxable=@ft WHERE PurchaseID=@id');

      // Snapshot per-line tax + landed cost per §14.4 / §14.7
      try {
        const gstRate = await resolveRate('GST');
        const lines = await pool.request()
          .input('id', sql.Int, newId)
          .query('SELECT PurchaseDetailID, Quantity, ItemRate FROM data_PurchaseDetail WHERE PurchaseID=@id');
        const header = {
          NetDiscount: NetDiscount || 0,
          FreightAmount: FreightAmount || 0,
          FreightTaxable: freightTaxableFlag === 1,
        };
        const snaps = snapshotGRNLines({ header, lines: lines.recordset, gstRate });
        for (const s of snaps) {
          await pool.request()
            .input('id',  sql.Int,           s.PurchaseDetailID)
            .input('tr',  sql.Decimal(8,4),  s.TaxRate)
            .input('ta',  sql.Decimal(18,2), s.TaxAmount)
            .input('ulc', sql.Decimal(18,4), s.UnitLandedCost)
            .query('UPDATE data_PurchaseDetail SET TaxRate=@tr, TaxAmount=@ta, UnitLandedCost=@ulc WHERE PurchaseDetailID=@id');
        }
      } catch (snapErr) {
        // Snapshot is best-effort — log but don't fail the save. Finalize will re-verify.
        console.warn('GRN tax snapshot failed (non-fatal):', snapErr.message);
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
            PurchaseDate, SupplierBillNo, PartyID, WHID,
            Remarks, NetDiscount, FreightAmount, FreightTaxable, Items
        } = req.body;
        const parsedItems = typeof Items === 'string' ? JSON.parse(Items) : Items;
        const freightTaxableFlag = (FreightTaxable === false || FreightTaxable === 'false' || FreightTaxable === '0') ? 0 : 1;

        await new sql.Request(tx)
            .input('id',   sql.Int,            id)
            .input('pd',   sql.DateTime,       PurchaseDate)
            .input('sbn',  sql.NVarChar(100),  SupplierBillNo)
            .input('pid',  sql.Int,            PartyID)
            .input('whid', sql.Int,            WHID)
            .input('rem',  sql.NVarChar(sql.MAX), Remarks || '')
            .input('nd',   sql.Decimal(18,2),  NetDiscount || 0)
            .input('fa',   sql.Decimal(18,2),  FreightAmount || 0)
            .input('ft',   sql.Bit,            freightTaxableFlag)
            .query(`UPDATE data_PurchaseInfo
                    SET PurchaseDate=@pd, FBRInvoiceNumber=@sbn, PartyID=@pid,
                        WHID=@whid, Remarks=@rem,
                        DiscountAmount=@nd, FreightAmount=@fa, FreightTaxable=@ft
                    WHERE PurchaseID=@id`);

        await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query('DELETE FROM data_PurchaseDetail WHERE PurchaseID=@id');

        for (const li of (parsedItems || [])) {
            await new sql.Request(tx)
                .input('pid',  sql.Int,            id)
                .input('iid',  sql.Int,            parseInt(li.ItemId))
                .input('qty',  sql.Decimal(18,3),  parseFloat(li.Quantity) || 0)
                .input('rate', sql.Decimal(18,2),  parseFloat(li.ItemRate) || 0)
                .input('dp',   sql.Decimal(18,2),  parseFloat(li.DiscountPercentage) || 0)
                .input('da',   sql.Decimal(18,2),  parseFloat(li.DiscountAmount) || 0)
                .input('na',   sql.Decimal(18,2),  parseFloat(li.NetAmount) || 0)
                .input('sr',   sql.Decimal(18,2),  parseFloat(li.StockRate) || 0)
                .query(`INSERT INTO data_PurchaseDetail
                            (PurchaseID, ItemId, Quantity, ItemRate,
                             DiscountPercentage, DiscountAmount, NetAmount, StockRate)
                        VALUES (@pid, @iid, @qty, @rate, @dp, @da, @na, @sr)`);
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
