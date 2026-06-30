const { sql, dbConfig, getPool } = require('../config/db');
const { postStoreSaleVoucher } = require('../services/storeSalePostingService');
const { assertEnoughStock } = require('../services/stockBalanceService');

exports.saveStoreSale = async (req, res) => {
  try {
    const {
      SaleDate, PartyID, CustomerName, VehicleName, Variant, PaymentMode,
      NICNo, NTNNo, MobileNo, Remarks, City, FBRInvoiceNo, TotalBillAmount,
      TotalTaxAmount, TotalDiscount, NetPayable, WHID, Items,
      PaymentBankID, DeliveryExpense,
    } = req.body;

    const pool = await getPool();

    // GST is per-line now: lines marked IsGST=true must carry tax > 0, lines
    // marked IsGST=false must carry tax = 0 (Non-GST items legitimately).
    if (Array.isArray(Items)) {
      const bad = Items.find(it => {
        const isGst = it.IsGST !== false;       // default-on if undefined
        const tax   = Number(it.TaxAmt ?? it.TaxAmount ?? 0);
        return isGst ? !(tax > 0) : (tax > 0);
      });
      if (bad) {
        return res.status(400).json({
          error: 'GST-marked lines must have tax > 0; Non-GST lines must have tax = 0.',
        });
      }
    }

    // Block over-sell: every line's quantity must be ≤ current on-hand
    try { await assertEnoughStock(pool.request(), Items); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const result = await pool.request()
      .input('SaleDate', sql.DateTime, SaleDate)
      .input('PartyID', sql.Int, PartyID ? parseInt(PartyID) : null)
      .input('CustomerName', sql.NVarChar(200), CustomerName)
      .input('VehicleName', sql.NVarChar(200), VehicleName || null)
      .input('Variant', sql.NVarChar(200), Variant || null)
      .input('PaymentMode', sql.NVarChar(20), PaymentMode)
      .input('NICNo', sql.NVarChar(50), NICNo || null)
      .input('MobileNo', sql.NVarChar(50), MobileNo || null)
      .input('Remarks', sql.NVarChar(sql.MAX), Remarks || null)
      .input('City', sql.NVarChar(100), City || null)
      .input('FBRInvoiceNo', sql.NVarChar(100), FBRInvoiceNo || null)
      .input('TotalBillAmount', sql.Decimal(18,2), parseFloat(TotalBillAmount) || 0)
      .input('TotalTaxAmount', sql.Decimal(18,2), parseFloat(TotalTaxAmount) || 0)
      .input('TotalDiscount', sql.Decimal(18,2), parseFloat(TotalDiscount) || 0)
      .input('NetPayable', sql.Decimal(18,2), parseFloat(NetPayable) || 0)
      .input('WHID', sql.Int, WHID ? parseInt(WHID) : null)
      .input('ItemsJSON', sql.NVarChar(sql.MAX), JSON.stringify(Items))
      .execute('sp_SaveStoreSale');

    const newSaleId = result.recordset[0]?.NewSaleID || result.recordset[0]?.SaleID;
    const newInvoiceNo = result.recordset[0]?.NewInvoiceNo;

    // Follow-up writes (creator stamp + per-line landed-cost snapshot) MUST
    // run together. If anything fails, the SP-created sale is hard-deleted
    // so the books are never half-committed.
    if (newSaleId) {
      const followUpTx = new sql.Transaction(pool);
      await followUpTx.begin();
      try {
        await new sql.Request(followUpTx)
          .input('id', sql.Int, newSaleId)
          .input('by', sql.Int, req.user?.userId || null)
          .input('byName', sql.NVarChar(100), req.user?.userName || '')
          .input('pbi', sql.Int, PaymentBankID ? parseInt(PaymentBankID) : null)
          .input('ntn', sql.NVarChar(50), NTNNo || null)
          .input('de',  sql.Decimal(18,2), parseFloat(DeliveryExpense) || 0)
          .query(`UPDATE data_StoreSaleInfo
                  SET CreatedBy=@by, CreatedByName=@byName, PaymentBankID=@pbi,
                      NTNNo=@ntn, DeliveryExpense=@de
                  WHERE SaleID=@id`);

        // Bulk landed-cost snapshot in a single UPDATE...FROM (no N+1 loop).
        await new sql.Request(followUpTx)
          .input('id', sql.Int, newSaleId)
          .query(`UPDATE d
                  SET d.UnitLandedCost = ISNULL(i.WeightedRate, i.ItemPurchasePrice)
                  FROM data_StoreSaleDetail d
                  LEFT JOIN InventItems i ON d.ItemID = i.ItemId
                  WHERE d.SaleID = @id`);

        await followUpTx.commit();
      } catch (followErr) {
        try { await followUpTx.rollback(); } catch {}
        // Hard-delete the half-committed sale so we never leave a stale row.
        try {
          await pool.request().input('id', sql.Int, newSaleId)
            .query(`DELETE FROM data_StoreSaleDetail WHERE SaleID=@id;
                    DELETE FROM data_StoreSaleInfo   WHERE SaleID=@id;`);
        } catch (cleanupErr) {
          console.error('Store Sale cleanup after follow-up failure also errored:', cleanupErr.message);
        }
        throw new Error('Store Sale follow-up writes failed: ' + followErr.message);
      }
    }

    // Auto-finalize: post the SI voucher + flip IsFinalized=1 in one transaction.
    // The UI presents this as a single "Finalize Sale" action so we do both
    // server-side. If posting fails we hard-delete the sale (same rollback
    // policy as the follow-up writes above) so the books stay clean.
    let voucherId = null;
    if (newSaleId) {
      const postTx = new sql.Transaction(pool);
      await postTx.begin();
      try {
        await new sql.Request(postTx)
          .input('id', sql.Int, newSaleId)
          .input('by', sql.Int, req.user?.userId || null)
          .input('byName', sql.NVarChar(100), req.user?.userName || '')
          .query(`UPDATE data_StoreSaleInfo
                  SET IsFinalized=1, FinalizedBy=@by, FinalizedByName=@byName, FinalizedAt=GETDATE()
                  WHERE SaleID=@id`);

        voucherId = await postStoreSaleVoucher(newSaleId, req.user, postTx);
        await postTx.commit();
      } catch (postErr) {
        try { await postTx.rollback(); } catch {}
        try {
          await pool.request().input('id', sql.Int, newSaleId)
            .query(`DELETE FROM data_StoreSaleDetail WHERE SaleID=@id;
                    DELETE FROM data_StoreSaleInfo   WHERE SaleID=@id;`);
        } catch (cleanupErr) {
          console.error('Store Sale cleanup after posting failure also errored:', cleanupErr.message);
        }
        throw new Error('Store Sale GL posting failed: ' + postErr.message);
      }
    }

    res.status(201).json({
      message: 'Store Sale Saved Successfully',
      InvoiceNo: newInvoiceNo,
      SaleID: newSaleId,
      VoucherID: voucherId,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

exports.getSales = async (req, res) => {
    try {
        const { search } = req.query;
        const pool = await getPool();
        const r = pool.request();
        let q = 'SELECT TOP 200 * FROM data_StoreSaleInfo';
        if (search) {
            r.input('s', sql.NVarChar(200), `%${search}%`);
            q += ' WHERE (InvoiceNo LIKE @s OR CustomerName LIKE @s OR MobileNo LIKE @s)';
        }
        q += ' ORDER BY SaleID DESC';
        res.json((await r.query(q)).recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
};

// GET /api/sales/store-sale/:id/print-data — same payload as getStoreSaleById
// but refuses if the sale isn't finalized. Backstops the frontend gate.
exports.getStoreSalePrintData = async (req, res) => {
    try {
        const pool = await getPool();
        const head = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT IsFinalized FROM data_StoreSaleInfo WHERE SaleID=@id');
        if (!head.recordset.length) return res.status(404).json({ error: 'Store Sale not found' });
        if (!head.recordset[0].IsFinalized) {
            return res.status(409).json({ error: 'Store Sale must be finalized before printing.' });
        }
        return exports.getStoreSaleById(req, res);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/sales/store-sale/:id — single Store Sale + lines
exports.getStoreSaleById = async (req, res) => {
    try {
        const pool = await getPool();
        const hdr = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT * FROM data_StoreSaleInfo WHERE SaleID=@id');
        if (!hdr.recordset.length) return res.status(404).json({ error: 'Store Sale not found' });
        const lines = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT d.*, i.ItenName, i.ItemNumber
                    FROM data_StoreSaleDetail d
                    LEFT JOIN InventItems i ON i.ItemId = d.ItemID
                    WHERE d.SaleID=@id`);
        res.json({ ...hdr.recordset[0], Items: lines.recordset });
    } catch (err) {
        console.error('getStoreSaleById:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/sales/store-sale/:id — update existing Store Sale (refused if finalized)
exports.updateStoreSale = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const hdr = await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query('SELECT IsFinalized FROM data_StoreSaleInfo WITH (UPDLOCK, HOLDLOCK) WHERE SaleID=@id');
        if (!hdr.recordset.length) throw new Error('Store Sale not found.');
        if (hdr.recordset[0].IsFinalized) {
            const e = new Error('Store Sale is finalized — cannot edit.'); e.statusCode = 423; throw e;
        }

        const {
            SaleDate, PartyID, CustomerName, VehicleName, Variant, PaymentMode,
            NICNo, NTNNo, MobileNo, Remarks, City, FBRInvoiceNo,
            TotalBillAmount, TotalTaxAmount, TotalDiscount, NetPayable, WHID, PaymentBankID,
            DeliveryExpense, Items,
        } = req.body;

        await new sql.Request(tx)
            .input('id',   sql.Int,           id)
            .input('sd',   sql.DateTime,      SaleDate)
            .input('pid',  sql.Int,           PartyID ? parseInt(PartyID) : null)
            .input('cn',   sql.NVarChar(200), CustomerName)
            .input('vn',   sql.NVarChar(200), VehicleName || null)
            .input('var',  sql.NVarChar(200), Variant || null)
            .input('pm',   sql.NVarChar(50),  PaymentMode || null)
            .input('nic',  sql.NVarChar(50),  NICNo || null)
            .input('mob',  sql.NVarChar(50),  MobileNo || null)
            .input('rem',  sql.NVarChar(sql.MAX), Remarks || null)
            .input('city', sql.NVarChar(100), City || null)
            .input('fbr',  sql.NVarChar(100), FBRInvoiceNo || null)
            .input('tba',  sql.Decimal(18,2), parseFloat(TotalBillAmount) || 0)
            .input('tta',  sql.Decimal(18,2), parseFloat(TotalTaxAmount) || 0)
            .input('td',   sql.Decimal(18,2), parseFloat(TotalDiscount) || 0)
            .input('np',   sql.Decimal(18,2), parseFloat(NetPayable) || 0)
            .input('whid', sql.Int,           WHID ? parseInt(WHID) : null)
            .input('pbid', sql.Int,           PaymentBankID ? parseInt(PaymentBankID) : null)
            .input('ntn',  sql.NVarChar(50),  NTNNo || null)
            .input('de',   sql.Decimal(18,2), parseFloat(DeliveryExpense) || 0)
            .query(`UPDATE data_StoreSaleInfo
                    SET SaleDate=@sd, PartyID=@pid, CustomerName=@cn,
                        VehicleName=@vn, Variant=@var, PaymentMode=@pm,
                        NICNo=@nic, NTNNo=@ntn, MobileNo=@mob, Remarks=@rem, City=@city,
                        FBRInvoiceNo=@fbr,
                        TotalBillAmount=@tba, TotalTaxAmount=@tta,
                        TotalDiscount=@td, NetPayable=@np,
                        WHID=@whid, PaymentBankID=@pbid, DeliveryExpense=@de
                    WHERE SaleID=@id`);

        await new sql.Request(tx)
            .input('id', sql.Int, id)
            .query('DELETE FROM data_StoreSaleDetail WHERE SaleID=@id');

        for (const li of (Items || [])) {
            await new sql.Request(tx)
                .input('sid',  sql.Int,           id)
                .input('iid',  sql.Int,           parseInt(li.ItemID))
                .input('qty',  sql.Decimal(18,3), parseFloat(li.Qty || li.Quantity) || 0)
                .input('rate', sql.Decimal(18,2), parseFloat(li.SaleRate) || 0)
                .input('pr',   sql.Decimal(18,2), parseFloat(li.PurchaseRate) || 0)
                .input('tp',   sql.Decimal(18,2), parseFloat(li.TaxPercent) || 0)
                .input('ta',   sql.Decimal(18,2), parseFloat(li.TaxAmt || li.TaxAmount) || 0)
                .input('da',   sql.Decimal(18,2), parseFloat(li.DiscAmt || li.DiscountAmount) || 0)
                .input('na',   sql.Decimal(18,2), parseFloat(li.NetAmt || li.NetAmount) || 0)
                .input('gst',  sql.Bit,           li.IsGST ? 1 : 0)
                .input('whid', sql.Int,           li.WHID ? parseInt(li.WHID) : null)
                .query(`INSERT INTO data_StoreSaleDetail
                            (SaleID, ItemID, Quantity, SaleRate, PurchaseRate,
                             TaxPercent, TaxAmount, DiscountAmount, NetAmount,
                             IsGST, WHID)
                        VALUES (@sid, @iid, @qty, @rate, @pr, @tp, @ta, @da, @na, @gst, @whid)`);
        }

        await tx.commit();

        // Re-finalize: after a successful edit, post a fresh SS voucher in a
        // second transaction. Mirrors the saveStoreSale auto-finalize flow so
        // an unfinalize -> edit -> save round-trip ends with a Posted voucher.
        let voucherId = null;
        const postTx = new sql.Transaction(pool);
        await postTx.begin();
        try {
            await new sql.Request(postTx)
                .input('id', sql.Int, id)
                .input('by', sql.Int, req.user?.userId || null)
                .input('byName', sql.NVarChar(100), req.user?.userName || '')
                .query(`UPDATE data_StoreSaleInfo
                        SET IsFinalized=1, FinalizedBy=@by, FinalizedByName=@byName, FinalizedAt=GETDATE()
                        WHERE SaleID=@id`);
            voucherId = await postStoreSaleVoucher(id, req.user, postTx);
            await postTx.commit();
        } catch (postErr) {
            try { await postTx.rollback(); } catch {}
            console.error('updateStoreSale re-finalize failed:', postErr);
            return res.status(400).json({
                error: 'Store Sale data saved but GL re-posting failed: ' + postErr.message,
            });
        }
        res.json({ message: 'Store Sale updated.', VoucherID: voucherId });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('updateStoreSale:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

/**
 * POST /api/sales/store-sale/:id/unfinalize
 *
 * Admin-only escape hatch. Reverses the GL effect of a finalized Store Sale
 * so the user can edit it: hard-deletes the SS voucher (header + details +
 * any party-ledger subsidiary rows) plus any POS-auto-settle CRV that was
 * posted alongside it, then flips IsFinalized=0. The Store Sale's stock-out
 * is left in place — the row still exists, the user is just editing it; the
 * subsequent PUT path re-posts a fresh SS voucher when the user saves again.
 */
exports.unfinalizeStoreSale = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id.' });

    try {
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // Make sure the sale exists + is currently finalized.
            const hdr = await new sql.Request(tx)
                .input('id', sql.Int, id)
                .query('SELECT IsFinalized FROM data_StoreSaleInfo WITH (UPDLOCK, HOLDLOCK) WHERE SaleID=@id');
            if (!hdr.recordset.length) throw new Error('Store Sale not found.');
            if (!hdr.recordset[0].IsFinalized) throw new Error('Store Sale is not finalized.');

            // Collect every voucher that was posted because of this sale: the
            // SS voucher and any auto-settle CRV (POS sales create both).
            const vRes = await new sql.Request(tx)
                .input('id', sql.Int, id)
                .query(`SELECT VoucherID FROM data_FinanceVoucherInfo
                        WHERE SourceDocType IN ('STORE_SALE') AND SourceDocID = @id`);
            const voucherIds = vRes.recordset.map(r => r.VoucherID);

            for (const vid of voucherIds) {
                await new sql.Request(tx).input('vid', sql.Int, vid)
                    .query('DELETE FROM dms_PartyLedger WHERE VoucherID=@vid OR AllocatedToVoucherID=@vid');
                await new sql.Request(tx).input('vid', sql.Int, vid)
                    .query('DELETE FROM data_FinanceVoucherDetail WHERE VoucherID=@vid');
                await new sql.Request(tx).input('vid', sql.Int, vid)
                    .query('DELETE FROM data_FinanceVoucherInfo WHERE VoucherID=@vid');
            }

            // Flip the sale back to editable.
            await new sql.Request(tx).input('id', sql.Int, id)
                .query(`UPDATE data_StoreSaleInfo
                        SET IsFinalized=0, FinalizedBy=NULL, FinalizedByName=NULL, FinalizedAt=NULL
                        WHERE SaleID=@id`);

            await tx.commit();
            res.json({
                message: 'Store Sale unfinalized. You can now edit it.',
                vouchersReversed: voucherIds.length,
            });
        } catch (e) {
            try { await tx.rollback(); } catch {}
            throw e;
        }
    } catch (err) {
        console.error('unfinalizeStoreSale:', err);
        res.status(400).json({ error: err.message });
    }
};
