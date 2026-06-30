/**
 * Parts / Inventory reports.
 *
 * Stock On-Hand already lives in reportsController.getInventoryValuation —
 * the Parts module surfaces it through the same backend endpoint, just under
 * a new sidebar link. This file adds:
 *   - Stock Movement Register   (period in/out per item)
 *   - Reorder Alert             (items at/below ReOrderLevel)
 *   - Parts Sales Register      (store sales line-by-line)
 *   - Parts Purchase Summary    (GRN line-by-line)
 */
const { sql, getPool } = require('../config/db');

function parseRange(req) {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const from = req.query.from ? new Date(req.query.from) : firstOfMonth;
    const to = req.query.to ? new Date(req.query.to) : today;
    to.setHours(23, 59, 59, 999);
    return { from, to };
}

/**
 * GET /reports/parts/stock-movement
 * Per-item summary of inflows (GRN) and outflows (issue, sale) in the period.
 */
exports.stockMovement = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();

        // Inflow = StockArrival rows + positive StockInOut rows (purchase, return-in)
        // Outflow = |negative StockInOut rows| (issue, sale)
        const [items, inflow, outflow] = await Promise.all([
            pool.request().query(`
                SELECT i.ItemId, i.ItemNumber, i.ItenName, i.ManualNumber,
                       i.WeightedRate, i.ReOrderLevel,
                       w.WHDesc, c.CategoryName
                FROM InventItems i
                LEFT JOIN InventWareHouse w ON i.WHID = w.WHID
                LEFT JOIN InventCategory  c ON i.CategoryID = c.CategoryID
                WHERE i.ItemStatus = 1`),
            pool.request().input('from', sql.DateTime, from).input('to', sql.DateTime, to).query(`
                SELECT ItemId, SUM(QtyIn) AS QtyIn, SUM(ValIn) AS ValIn FROM (
                    SELECT sd.ItemId,
                           ISNULL(sd.Quantity,0) AS QtyIn,
                           ISNULL(sd.Quantity * sd.StockRate, 0) AS ValIn
                    FROM data_StockArrivalDetail sd
                    INNER JOIN data_StockArrivalInfo si ON sd.ArrivalID = si.ArrivalID
                    WHERE si.ArrivalDate BETWEEN @from AND @to
                    UNION ALL
                    SELECT od.ItemId,
                           ISNULL(od.Quantity,0) AS QtyIn,
                           ISNULL(od.Quantity * od.StockRate, 0) AS ValIn
                    FROM data_StockInOutDetail od
                    INNER JOIN data_StockInOutInfo oi ON od.StockIOID = oi.StockIOID
                    WHERE oi.StockIODate BETWEEN @from AND @to AND od.Quantity > 0
                ) u GROUP BY ItemId`),
            pool.request().input('from', sql.DateTime, from).input('to', sql.DateTime, to).query(`
                SELECT od.ItemId,
                       SUM(ABS(ISNULL(od.Quantity,0))) AS QtyOut,
                       SUM(ABS(ISNULL(od.Quantity * od.StockRate, 0))) AS ValOut
                FROM data_StockInOutDetail od
                INNER JOIN data_StockInOutInfo oi ON od.StockIOID = oi.StockIOID
                WHERE oi.StockIODate BETWEEN @from AND @to AND od.Quantity < 0
                GROUP BY od.ItemId`),
        ]);

        const inMap = new Map(inflow.recordset.map(r => [r.ItemId, { qty: Number(r.QtyIn), val: Number(r.ValIn) }]));
        const outMap = new Map(outflow.recordset.map(r => [r.ItemId, { qty: Number(r.QtyOut), val: Number(r.ValOut) }]));

        let rows = items.recordset.map(x => {
            const i = inMap.get(x.ItemId) || { qty: 0, val: 0 };
            const o = outMap.get(x.ItemId) || { qty: 0, val: 0 };
            return {
                ItemId:    x.ItemId,
                ItemCode:  x.ItemNumber != null ? String(x.ItemNumber) : '',
                ItemName:  x.ItenName || '',
                PartNumber: x.ManualNumber || '',
                Warehouse: x.WHDesc || '',
                Category:  x.CategoryName || '',
                Rate:      +Number(x.WeightedRate || 0).toFixed(2),
                QtyIn:     +i.qty.toFixed(2),
                QtyOut:    +o.qty.toFixed(2),
                NetChange: +(i.qty - o.qty).toFixed(2),
                ValIn:     +i.val.toFixed(2),
                ValOut:    +o.val.toFixed(2),
            };
        }).filter(r => r.QtyIn > 0 || r.QtyOut > 0);
        rows.sort((a, b) => (b.QtyIn + b.QtyOut) - (a.QtyIn + a.QtyOut));

        const totals = {
            items: rows.length,
            qtyIn:  +rows.reduce((s, x) => s + x.QtyIn,  0).toFixed(2),
            qtyOut: +rows.reduce((s, x) => s + x.QtyOut, 0).toFixed(2),
            valIn:  +rows.reduce((s, x) => s + x.ValIn,  0).toFixed(2),
            valOut: +rows.reduce((s, x) => s + x.ValOut, 0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('stockMovement:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/parts/reorder-alert
 * Items at or below their ReOrderLevel. Uses live stock-on-hand (same as
 * inventory valuation) to compute the current quantity.
 */
exports.reorderAlert = async (req, res) => {
    try {
        const pool = await getPool();

        const [items, inflow, outflow] = await Promise.all([
            pool.request().query(`
                SELECT i.ItemId, i.ItemNumber, i.ItenName, i.ManualNumber, i.Remarks,
                       i.WeightedRate, i.ReOrderLevel,
                       w.WHDesc, c.CategoryName
                FROM InventItems i
                LEFT JOIN InventWareHouse w ON i.WHID = w.WHID
                LEFT JOIN InventCategory  c ON i.CategoryID = c.CategoryID
                WHERE i.ItemStatus = 1 AND ISNULL(i.ReOrderLevel, 0) > 0`),
            pool.request().query(`
                SELECT sd.ItemId, SUM(ISNULL(sd.Quantity,0)) AS QtyIn
                FROM data_StockArrivalDetail sd
                INNER JOIN data_StockArrivalInfo si ON sd.ArrivalID = si.ArrivalID
                GROUP BY sd.ItemId`),
            pool.request().query(`
                SELECT od.ItemId, SUM(ISNULL(od.Quantity,0)) AS QtyOut
                FROM data_StockInOutDetail od
                INNER JOIN data_StockInOutInfo oi ON od.StockIOID = oi.StockIOID
                GROUP BY od.ItemId`),
        ]);

        const inMap = new Map(inflow.recordset.map(r => [r.ItemId, Number(r.QtyIn)]));
        const outMap = new Map(outflow.recordset.map(r => [r.ItemId, Number(r.QtyOut)]));

        let rows = items.recordset.map(x => {
            // StockInOutDetail.Quantity is signed (purchase +, issue/sale -)
            const onHand = (inMap.get(x.ItemId) || 0) + (outMap.get(x.ItemId) || 0);
            const reorder = Number(x.ReOrderLevel || 0);
            const shortfall = Math.max(0, reorder - onHand);
            return {
                ItemId:       x.ItemId,
                ItemCode:     x.ItemNumber != null ? String(x.ItemNumber) : '',
                ItemName:     x.ItenName || '',
                PartNumber:   x.ManualNumber || '',
                BinLocation:  x.Remarks || '',
                Warehouse:    x.WHDesc || '',
                Category:     x.CategoryName || '',
                OnHand:       +onHand.toFixed(2),
                ReOrderLevel: reorder,
                Shortfall:    +shortfall.toFixed(2),
                Rate:         +Number(x.WeightedRate || 0).toFixed(2),
                SuggestedOrderValue: +(shortfall * Number(x.WeightedRate || 0)).toFixed(2),
            };
        }).filter(r => r.OnHand <= r.ReOrderLevel);
        rows.sort((a, b) => b.SuggestedOrderValue - a.SuggestedOrderValue);

        const totals = {
            items: rows.length,
            shortfall: +rows.reduce((s, x) => s + x.Shortfall, 0).toFixed(2),
            suggestedOrderValue: +rows.reduce((s, x) => s + x.SuggestedOrderValue, 0).toFixed(2),
        };

        res.json({ rows, totals });
    } catch (err) { console.error('reorderAlert:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/parts/sales-register
 * Line-by-line store-sale register for the period.
 */
exports.partsSalesRegister = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT s.SaleID, s.SaleVoucherNo, s.SaleDate, s.NetAmount AS InvoiceNet,
                       p.PartyName AS Customer,
                       d.SaleDetailID, d.ItemId, i.ItemNumber AS ItemCode, i.ItenName AS ItemName,
                       d.Quantity, d.ItemRate, d.NetAmount AS LineNet,
                       (ISNULL(d.TaxOneAmount,0) + ISNULL(d.TaxTwoAmount,0)) AS Tax,
                       d.DiscountAmount
                FROM data_SaleDetail d
                INNER JOIN data_SaleInfo s ON d.SaleID = s.SaleID
                LEFT JOIN gen_PartiesInfo p ON s.PartyID = p.PartyID
                LEFT JOIN InventItems i    ON d.ItemId = i.ItemId
                WHERE s.SaleDate BETWEEN @from AND @to
                ORDER BY s.SaleDate DESC, s.SaleID DESC`);

        const rows = r.recordset.map(x => ({
            SaleVoucherNo: x.SaleVoucherNo,
            SaleDate:      x.SaleDate?.toISOString().slice(0,10),
            Customer:      x.Customer || '',
            ItemCode:      x.ItemCode != null ? String(x.ItemCode) : '',
            ItemName:      x.ItemName || '',
            Quantity:      +Number(x.Quantity || 0).toFixed(2),
            ItemRate:      +Number(x.ItemRate || 0).toFixed(2),
            Discount:      +Number(x.DiscountAmount || 0).toFixed(2),
            Tax:           +Number(x.Tax || 0).toFixed(2),
            LineNet:       +Number(x.LineNet || 0).toFixed(2),
        }));

        const totals = {
            lines:    rows.length,
            invoices: new Set(rows.map(r => r.SaleVoucherNo)).size,
            quantity: +rows.reduce((s, x) => s + x.Quantity, 0).toFixed(2),
            discount: +rows.reduce((s, x) => s + x.Discount, 0).toFixed(2),
            tax:      +rows.reduce((s, x) => s + x.Tax, 0).toFixed(2),
            net:      +rows.reduce((s, x) => s + x.LineNet, 0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('partsSalesRegister:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/parts/purchase-summary
 * Line-by-line GRN summary for the period.
 */
exports.purchaseSummary = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT p.PurchaseID, p.PurchaseVoucherNo, p.PurchaseDate, p.NetAmount AS GRNNet,
                       pp.PartyName AS Supplier,
                       d.PurchaseDetailID, d.ItemId, i.ItemNumber AS ItemCode, i.ItenName AS ItemName,
                       d.Quantity, d.ItemRate, d.NetAmount AS LineNet,
                       (ISNULL(d.TaxOneAmount,0) + ISNULL(d.TaxTwoAmount,0)) AS Tax,
                       d.DiscountAmount
                FROM data_PurchaseDetail d
                INNER JOIN data_PurchaseInfo p ON d.PurchaseID = p.PurchaseID
                LEFT JOIN gen_PartiesInfo pp   ON p.PartyID = pp.PartyID
                LEFT JOIN InventItems i        ON d.ItemId = i.ItemId
                WHERE p.PurchaseDate BETWEEN @from AND @to
                ORDER BY p.PurchaseDate DESC, p.PurchaseID DESC`);

        const rows = r.recordset.map(x => ({
            GRNNo:    x.PurchaseVoucherNo,
            GRNDate:  x.PurchaseDate?.toISOString().slice(0,10),
            Supplier: x.Supplier || '',
            ItemCode: x.ItemCode != null ? String(x.ItemCode) : '',
            ItemName: x.ItemName || '',
            Quantity: +Number(x.Quantity || 0).toFixed(2),
            ItemRate: +Number(x.ItemRate || 0).toFixed(2),
            Discount: +Number(x.DiscountAmount || 0).toFixed(2),
            Tax:      +Number(x.Tax || 0).toFixed(2),
            LineNet:  +Number(x.LineNet || 0).toFixed(2),
        }));

        const totals = {
            lines:    rows.length,
            grns:     new Set(rows.map(r => r.GRNNo)).size,
            quantity: +rows.reduce((s, x) => s + x.Quantity, 0).toFixed(2),
            discount: +rows.reduce((s, x) => s + x.Discount, 0).toFixed(2),
            tax:      +rows.reduce((s, x) => s + x.Tax, 0).toFixed(2),
            net:      +rows.reduce((s, x) => s + x.LineNet, 0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('purchaseSummary:', err); res.status(500).json({ error: err.message }); }
};
