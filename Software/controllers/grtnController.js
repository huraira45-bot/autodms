const { sql, dbConfig, getPool } = require('../config/db');
const { snapshotGRTNLines } = require('../utils/grtnJournalBuilder');

exports.saveGRTN = async (req, res) => {
  try {
    const { 
      ReturnDate, PartyID, WHID, 
      Remarks, NetAmount, DiscountAmount, 
      OriginalGRNID, Items 
    } = req.body;

    const pool = await getPool();
    const result = await pool.request()
      .input('ReturnDate', sql.DateTime, ReturnDate)
      .input('PartyID', sql.Int, PartyID)
      .input('WHID', sql.Int, WHID)
      .input('Remarks', sql.NVarChar(sql.MAX), Remarks || '')
      .input('NetAmount', sql.Decimal(18,2), NetAmount || 0)
      .input('DiscountAmount', sql.Decimal(18,2), DiscountAmount || 0)
      .input('OriginalGRNID', sql.Int, OriginalGRNID || null)
      .input('ItemsJSON', sql.NVarChar(sql.MAX), JSON.stringify(Items))
      .execute('sp_SavePurchaseReturn');

    const newId = result.recordset[0]?.NewReturnID;
    if (newId) {
      const counterRes = await pool.request()
        .query("UPDATE dms_DocCounters SET CurrentCounter = CurrentCounter + 1 OUTPUT INSERTED.CurrentCounter WHERE DocType = 'GRTN'");
      const counter = counterRes.recordset[0]?.CurrentCounter ?? 0;
      const returnNo = `GRTN-${String(counter).padStart(4, '0')}`;
      await pool.request()
        .input('id', sql.Int, newId)
        .input('no', sql.NVarChar(50), returnNo)
        .input('by', sql.Int, req.user?.userId || null)
        .input('byName', sql.NVarChar(100), req.user?.userName || '')
        .query('UPDATE data_PurchaseReturnInfo SET PurchaseReturnNo=@no, CreatedBy=@by, CreatedByName=@byName WHERE PurchaseReturnID=@id');

      // Snapshot per-line tax + carrying cost per §14.4 + §14.8
      // The carrying cost (UnitLandedCost) is looked up from the original GRN line
      // via PurchaseDetailId (back-reference already on data_PurchaseReturnDetail).
      try {
        const detailRows = await pool.request()
          .input('id', sql.Int, newId)
          .query(`SELECT prd.PurchaseReturnDetailID, prd.Quantity, prd.ItemRate,
                         pd.TaxRate AS OriginalTaxRate, pd.UnitLandedCost AS OriginalLandedCost
                  FROM data_PurchaseReturnDetail prd
                  LEFT JOIN data_PurchaseDetail pd ON prd.PurchaseDetailId = pd.PurchaseDetailID
                  WHERE prd.PurchaseReturnID=@id`);
        const snaps = snapshotGRTNLines({ lines: detailRows.recordset });
        for (const s of snaps) {
          await pool.request()
            .input('id',  sql.Int,           s.PurchaseReturnDetailID)
            .input('tr',  sql.Decimal(8,4),  s.TaxRate)
            .input('ta',  sql.Decimal(18,2), s.TaxAmount)
            .input('ulc', sql.Decimal(18,4), s.UnitLandedCost)
            .query('UPDATE data_PurchaseReturnDetail SET TaxRate=@tr, TaxAmount=@ta, UnitLandedCost=@ulc WHERE PurchaseReturnDetailID=@id');
        }
      } catch (snapErr) {
        console.warn('GRTN tax snapshot failed (non-fatal):', snapErr.message);
      }
    }
    res.status(201).json({ message: 'GRTN Saved Successfully', data: result.recordset });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

exports.getGRTNs = async (req, res) => {
  try {
    const { search } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let query = 'SELECT TOP 100 * FROM vw_PurchaseReturnHeader';
    if (search) {
      request.input('search', sql.NVarChar(100), `%${search}%`);
      query += ' WHERE PurchaseReturnNo LIKE @search OR PartyName LIKE @search';
    }
    query += ' ORDER BY PurchaseReturnID DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
