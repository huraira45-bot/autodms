const { sql, dbConfig, getPool } = require('../config/db');

exports.saveStoreSale = async (req, res) => {
  try {
    const {
      SaleDate, PartyID, CustomerName, VehicleName, Variant, PaymentMode,
      NICNo, MobileNo, Remarks, City, FBRInvoiceNo, TotalBillAmount,
      TotalTaxAmount, TotalDiscount, NetPayable, WHID, Items,
      PaymentBankID,
    } = req.body;

    const pool = await getPool();
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

    // Follow-up: write CreatedBy, PaymentBankID, snapshot landed cost on each detail line
    if (newSaleId) {
      // Header: creator metadata + bank
      await pool.request()
        .input('id', sql.Int, newSaleId)
        .input('by', sql.Int, req.user?.userId || null)
        .input('byName', sql.NVarChar(100), req.user?.userName || '')
        .input('pbi', sql.Int, PaymentBankID ? parseInt(PaymentBankID) : null)
        .query(`UPDATE data_StoreSaleInfo
                SET CreatedBy=@by, CreatedByName=@byName, PaymentBankID=@pbi
                WHERE SaleID=@id`);

      // Per-line snapshot of landed cost from InventItems.WeightedRate
      try {
        const lines = await pool.request()
          .input('id', sql.Int, newSaleId)
          .query(`SELECT d.SaleDetailID, d.ItemID, d.Quantity,
                         ISNULL(i.WeightedRate, i.ItemPurchasePrice) AS Cost
                  FROM data_StoreSaleDetail d
                  LEFT JOIN InventItems i ON d.ItemID = i.ItemId
                  WHERE d.SaleID=@id`);
        for (const l of lines.recordset) {
          await pool.request()
            .input('id', sql.Int, l.SaleDetailID)
            .input('ulc', sql.Decimal(18,4), l.Cost || 0)
            .query('UPDATE data_StoreSaleDetail SET UnitLandedCost=@ulc WHERE SaleDetailID=@id');
        }
      } catch (snapErr) {
        console.warn('Store Sale landed cost snapshot failed (non-fatal):', snapErr.message);
      }
    }

    res.status(201).json({
      message: 'Store Sale Saved Successfully',
      InvoiceNo: newInvoiceNo,
      SaleID: newSaleId,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Database Error', details: err.message });
  }
};

exports.getSales = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT TOP 100 * FROM data_StoreSaleInfo ORDER BY SaleID DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
};
