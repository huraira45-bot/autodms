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

// GET /api/grtn/:id/print-data — gated on IsFinalized
exports.getGRTNPrintData = async (req, res) => {
    try {
        const pool = await getPool();
        const head = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT IsFinalized FROM data_PurchaseReturnInfo WHERE PurchaseReturnID=@id');
        if (!head.recordset.length) return res.status(404).json({ error: 'GRTN not found' });
        if (!head.recordset[0].IsFinalized) {
            return res.status(409).json({ error: 'GRTN must be finalized before printing.' });
        }
        return exports.getGRTNById(req, res);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/grtn/:id  — single GRTN + lines
exports.getGRTNById = async (req, res) => {
    try {
        const pool = await getPool();
        const hdr = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT * FROM vw_PurchaseReturnHeader WHERE PurchaseReturnID=@id');
        if (!hdr.recordset.length) return res.status(404).json({ error: 'GRTN not found' });
        const lines = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT d.*, i.ItenName, i.ItemNumber
                    FROM data_PurchaseReturnDetail d
                    LEFT JOIN InventItems i ON i.ItemId = d.ItemId
                    WHERE d.PurchaseReturnID=@id`);
        res.json({ ...hdr.recordset[0], Items: lines.recordset });
    } catch (err) {
        console.error('getGRTNById:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/grtn/:id  — update existing GRTN (refused if finalized)
exports.updateGRTN = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const hdr = await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query('SELECT IsFinalized FROM data_PurchaseReturnInfo WITH (UPDLOCK, HOLDLOCK) WHERE PurchaseReturnID=@id');
        if (!hdr.recordset.length) throw new Error('GRTN not found.');
        if (hdr.recordset[0].IsFinalized) {
            const e = new Error('GRTN is finalized — cannot edit.'); e.statusCode = 423; throw e;
        }

        const { PurchaseReturnDate, PartyID, WHID, Remarks, DiscountAmount, FreightAmount, NetAmount, Items, PurchaseID } = req.body;
        const parsedItems = typeof Items === 'string' ? JSON.parse(Items) : Items;

        await new sql.Request(tx)
            .input('id',   sql.Int,           id)
            .input('pd',   sql.DateTime,      PurchaseReturnDate)
            .input('pid',  sql.Int,           PartyID)
            .input('whid', sql.Int,           WHID)
            .input('rem',  sql.NVarChar(sql.MAX), Remarks || '')
            .input('da',   sql.Decimal(18,2), DiscountAmount || 0)
            .input('fa',   sql.Decimal(18,2), FreightAmount || 0)
            .input('na',   sql.Decimal(18,2), NetAmount || 0)
            .input('puid', sql.Int,           PurchaseID || null)
            .query(`UPDATE data_PurchaseReturnInfo
                    SET PurchaseReturnDate=@pd, PartyID=@pid, WHID=@whid,
                        Remarks=@rem, DiscountAmount=@da, FreightAmount=@fa,
                        NetAmount=@na, PurchaseID=@puid
                    WHERE PurchaseReturnID=@id`);

        await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query('DELETE FROM data_PurchaseReturnDetail WHERE PurchaseReturnID=@id');

        for (const li of (parsedItems || [])) {
            await new sql.Request(tx)
                .input('rid',  sql.Int,           id)
                .input('iid',  sql.Int,           parseInt(li.ItemId))
                .input('qty',  sql.Decimal(18,3), parseFloat(li.Quantity) || 0)
                .input('rate', sql.Decimal(18,2), parseFloat(li.ItemRate) || 0)
                .input('da',   sql.Decimal(18,2), parseFloat(li.DiscountAmount) || 0)
                .input('na',   sql.Decimal(18,2), parseFloat(li.NetAmount) || 0)
                .input('sr',   sql.Decimal(18,2), parseFloat(li.StockRate) || 0)
                .query(`INSERT INTO data_PurchaseReturnDetail
                            (PurchaseReturnID, ItemId, Quantity, ItemRate,
                             DiscountAmount, NetAmount, StockRate)
                        VALUES (@rid, @iid, @qty, @rate, @da, @na, @sr)`);
        }

        await tx.commit();
        res.json({ message: 'GRTN updated.' });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('updateGRTN:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
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
