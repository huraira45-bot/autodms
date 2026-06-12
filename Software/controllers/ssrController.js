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
        const pool = await getPool();
        const result = await pool.request().query('SELECT TOP 100 * FROM data_StoreSaleReturnInfo ORDER BY ReturnID DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
};
