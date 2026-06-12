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
