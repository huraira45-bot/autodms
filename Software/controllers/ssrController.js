const { sql, dbConfig, getPool } = require('../config/db');

exports.saveSSR = async (req, res) => {
  try {
    const {
      ReturnDate, OriginalSaleID, PartyID, CustomerName, Remarks,
      TotalReturnAmount, TotalTaxReturn, TotalDiscReturn, NetRefund, WHID, Items,
      RefundMode, RefundBankID,
    } = req.body;

    const pool = await getPool();
    const result = await pool.request()
      .input('ReturnDate', sql.DateTime, ReturnDate)
      .input('OriginalSaleID', sql.Int, OriginalSaleID ? parseInt(OriginalSaleID) : null)
      .input('PartyID', sql.Int, PartyID ? parseInt(PartyID) : null)
      .input('CustomerName', sql.NVarChar(200), CustomerName)
      .input('Remarks', sql.NVarChar(sql.MAX), Remarks || null)
      .input('TotalReturnAmount', sql.Decimal(18,2), parseFloat(TotalReturnAmount) || 0)
      .input('TotalTaxReturn', sql.Decimal(18,2), parseFloat(TotalTaxReturn) || 0)
      .input('TotalDiscReturn', sql.Decimal(18,2), parseFloat(TotalDiscReturn) || 0)
      .input('NetRefund', sql.Decimal(18,2), parseFloat(NetRefund) || 0)
      .input('WHID', sql.Int, WHID ? parseInt(WHID) : null)
      .input('ItemsJSON', sql.NVarChar(sql.MAX), JSON.stringify(Items))
      .execute('sp_SaveStoreSaleReturn');

    const newReturnId = result.recordset[0]?.NewReturnID || result.recordset[0]?.ReturnID;
    const newReturnNo = result.recordset[0]?.NewReturnNo;

    if (newReturnId) {
      // Follow-up: creator metadata + refund mode + bank
      await pool.request()
        .input('id', sql.Int, newReturnId)
        .input('by', sql.Int, req.user?.userId || null)
        .input('byName', sql.NVarChar(100), req.user?.userName || '')
        .input('rm', sql.NVarChar(20), RefundMode || 'Cash')
        .input('rbi', sql.Int, RefundBankID ? parseInt(RefundBankID) : null)
        .query(`UPDATE data_StoreSaleReturnInfo
                SET CreatedBy=@by, CreatedByName=@byName, RefundMode=@rm, RefundBankID=@rbi
                WHERE ReturnID=@id`);

      // Snapshot UnitLandedCost on each SSR detail by looking up the matching ItemID
      // in the original Store Sale's lines.
      try {
        // For each SSR detail line, find the matching original sale's UnitLandedCost
        // (averaging if multiple original lines for the same item — rare).
        await pool.request()
          .input('id', sql.Int, newReturnId)
          .query(`
            UPDATE prd
            SET UnitLandedCost = avg_cost.AvgCost
            FROM data_StoreSaleReturnDetail prd
            INNER JOIN data_StoreSaleReturnInfo ri ON prd.ReturnID = ri.ReturnID
            OUTER APPLY (
                SELECT AVG(d.UnitLandedCost) AS AvgCost
                FROM data_StoreSaleDetail d
                WHERE d.SaleID = ri.OriginalSaleID
                  AND d.ItemID = prd.ItemID
                  AND d.UnitLandedCost IS NOT NULL
            ) avg_cost
            WHERE prd.ReturnID = @id
              AND prd.UnitLandedCost IS NULL
          `);
      } catch (snapErr) {
        console.warn('SSR landed cost snapshot failed (non-fatal):', snapErr.message);
      }
    }

    res.status(201).json({
      message: 'Store Sale Return Saved Successfully',
      ReturnNo: newReturnNo,
      ReturnID: newReturnId,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

exports.getSSRs = async (req, res) => {
    try {
        const { search } = req.query;
        const pool = await getPool();
        const r = pool.request();
        let q = 'SELECT TOP 200 * FROM data_StoreSaleReturnInfo';
        if (search) {
            r.input('s', sql.NVarChar(200), `%${search}%`);
            q += ' WHERE (ReturnNo LIKE @s OR CustomerName LIKE @s)';
        }
        q += ' ORDER BY ReturnID DESC';
        res.json((await r.query(q)).recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
};

// GET /api/sales/ssr/:id/print-data — gated on IsFinalized
exports.getSSRPrintData = async (req, res) => {
    try {
        const pool = await getPool();
        const head = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT IsFinalized FROM data_StoreSaleReturnInfo WHERE ReturnID=@id');
        if (!head.recordset.length) return res.status(404).json({ error: 'SSR not found' });
        if (!head.recordset[0].IsFinalized) {
            return res.status(409).json({ error: 'SSR must be finalized before printing.' });
        }
        return exports.getSSRById(req, res);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/sales/ssr/:id  — single SSR with its lines (for open / edit / print)
exports.getSSRById = async (req, res) => {
    try {
        const pool = await getPool();
        const hdr = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT * FROM data_StoreSaleReturnInfo WHERE ReturnID=@id`);
        if (!hdr.recordset.length) return res.status(404).json({ error: 'SSR not found' });
        const lines = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT d.*, i.ItenName, i.ItemNumber
                    FROM data_StoreSaleReturnDetail d
                    LEFT JOIN InventItems i ON i.ItemId = d.ItemID
                    WHERE d.ReturnID=@id`);
        res.json({ ...hdr.recordset[0], Items: lines.recordset });
    } catch (err) {
        console.error('getSSRById:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/sales/ssr/:id  — update existing SSR. Refused if finalized.
//
// Replaces all detail lines (idempotent). Doesn't re-run sp_SaveStoreSaleReturn
// (which is creation-only); does a direct edit. Stock-restate from the
// original POST is preserved; net change in qty would need a delta-update —
// for now, we restrict edits to non-finalized rows only, which means stock
// hasn't moved yet (the SP fires on finalize).
exports.updateSSR = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const hdr = await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query(`SELECT IsFinalized FROM data_StoreSaleReturnInfo WITH (UPDLOCK, HOLDLOCK) WHERE ReturnID=@id`);
        if (!hdr.recordset.length) throw new Error('SSR not found.');
        if (hdr.recordset[0].IsFinalized) {
            const e = new Error('SSR is finalized — cannot edit.'); e.statusCode = 423; throw e;
        }

        const {
            ReturnDate, OriginalSaleID, PartyID, CustomerName, Remarks,
            TotalReturnAmount, TotalTaxReturn, TotalDiscReturn, NetRefund, WHID, Items,
            RefundMode, RefundBankID,
        } = req.body;

        await new sql.Request(tx)
            .input('id',   sql.Int,           id)
            .input('rd',   sql.DateTime,      ReturnDate)
            .input('osid', sql.Int,           OriginalSaleID ? parseInt(OriginalSaleID) : null)
            .input('pid',  sql.Int,           PartyID ? parseInt(PartyID) : null)
            .input('cn',   sql.NVarChar(200), CustomerName)
            .input('rem',  sql.NVarChar(sql.MAX), Remarks || null)
            .input('tra',  sql.Decimal(18,2), parseFloat(TotalReturnAmount) || 0)
            .input('ttr',  sql.Decimal(18,2), parseFloat(TotalTaxReturn) || 0)
            .input('tdr',  sql.Decimal(18,2), parseFloat(TotalDiscReturn) || 0)
            .input('nr',   sql.Decimal(18,2), parseFloat(NetRefund) || 0)
            .input('whid', sql.Int,           WHID ? parseInt(WHID) : null)
            .input('rm',   sql.NVarChar(20),  RefundMode || 'Cash')
            .input('rbi',  sql.Int,           RefundBankID ? parseInt(RefundBankID) : null)
            .query(`UPDATE data_StoreSaleReturnInfo
                    SET ReturnDate=@rd, OriginalSaleID=@osid, PartyID=@pid,
                        CustomerName=@cn, Remarks=@rem,
                        TotalReturnAmount=@tra, TotalTaxReturn=@ttr,
                        TotalDiscReturn=@tdr, NetRefund=@nr,
                        WHID=@whid, RefundMode=@rm, RefundBankID=@rbi
                    WHERE ReturnID=@id`);

        await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query(`DELETE FROM data_StoreSaleReturnDetail WHERE ReturnID=@id`);

        for (const li of (Items || [])) {
            await new sql.Request(tx)
                .input('rid',  sql.Int,           id)
                .input('iid',  sql.Int,           parseInt(li.ItemID))
                .input('qty',  sql.Decimal(18,3), parseFloat(li.Qty) || 0)
                .input('rate', sql.Decimal(18,2), parseFloat(li.SaleRate) || 0)
                .input('tp',   sql.Decimal(18,2), parseFloat(li.TaxPercent) || 0)
                .input('ta',   sql.Decimal(18,2), parseFloat(li.TaxAmt) || 0)
                .input('da',   sql.Decimal(18,2), parseFloat(li.DiscAmt) || 0)
                .input('na',   sql.Decimal(18,2), parseFloat(li.NetAmt) || 0)
                .input('whid', sql.Int,           li.WHID ? parseInt(li.WHID) : null)
                .query(`INSERT INTO data_StoreSaleReturnDetail
                            (ReturnID, ItemID, Quantity, SaleRate, TaxPercent,
                             TaxAmount, DiscountAmount, NetAmount, WHID)
                        VALUES (@rid, @iid, @qty, @rate, @tp, @ta, @da, @na, @whid)`);
        }

        await tx.commit();
        res.json({ message: 'SSR updated.' });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('updateSSR:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};
