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
        const search = (req.query.search || '').trim();
        const pool = await getPool();

        // Inflow = StockArrival rows + positive StockInOut rows (purchase, return-in)
        // Outflow = |negative StockInOut rows| (issue, sale)
        const itemsReq = pool.request();
        const itemsWhere = ['i.ItemStatus = 1'];
        if (search) {
            itemsReq.input('q', sql.NVarChar(200), `%${search}%`);
            itemsWhere.push('(i.ItenName LIKE @q OR i.ManualNumber LIKE @q OR CAST(i.ItemNumber AS NVARCHAR(50)) LIKE @q)');
        }
        const [items, inflow, outflow] = await Promise.all([
            itemsReq.query(`
                SELECT i.ItemId, i.ItemNumber, i.ItenName, i.ManualNumber,
                       i.BinLocation, i.WeightedRate, i.ReOrderLevel,
                       w.WHDesc, c.CategoryName
                FROM InventItems i
                LEFT JOIN InventWareHouse w ON i.WHID = w.WHID
                LEFT JOIN InventCategory  c ON i.CategoryID = c.CategoryID
                WHERE ${itemsWhere.join(' AND ')}`),
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
            const balQty = i.qty - o.qty;
            const balVal = i.val - o.val;
            return {
                ItemId:    x.ItemId,
                ItemCode:  x.ItemNumber != null ? String(x.ItemNumber) : '',
                ItemName:  x.ItenName || '',
                PartNumber: x.ManualNumber || '',
                BinLocation: x.BinLocation || '',
                Warehouse: x.WHDesc || '',
                Category:  x.CategoryName || '',
                Rate:      +Number(x.WeightedRate || 0).toFixed(2),
                QtyIn:     +i.qty.toFixed(2),
                QtyOut:    +o.qty.toFixed(2),
                // BalanceQty: net change in the period (in − out). Renamed from
                // NetChange so the UI label reads as "Balance Quantity".
                BalanceQty: +balQty.toFixed(2),
                NetChange:  +balQty.toFixed(2),   // alias for legacy callers
                ValIn:     +i.val.toFixed(2),
                ValOut:    +o.val.toFixed(2),
                TotalValue: +balVal.toFixed(2),   // ValIn − ValOut for the period
            };
        }).filter(r => r.QtyIn > 0 || r.QtyOut > 0);
        rows.sort((a, b) => (b.QtyIn + b.QtyOut) - (a.QtyIn + a.QtyOut));

        const totals = {
            items: rows.length,
            qtyIn:  +rows.reduce((s, x) => s + x.QtyIn,  0).toFixed(2),
            qtyOut: +rows.reduce((s, x) => s + x.QtyOut, 0).toFixed(2),
            balQty: +rows.reduce((s, x) => s + x.BalanceQty, 0).toFixed(2),
            valIn:  +rows.reduce((s, x) => s + x.ValIn,  0).toFixed(2),
            valOut: +rows.reduce((s, x) => s + x.ValOut, 0).toFixed(2),
            totalValue: +rows.reduce((s, x) => s + x.TotalValue, 0).toFixed(2),
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
        const search = (req.query.search || '').trim();
        const pool = await getPool();
        // AutoDMS store sales live in data_StoreSaleInfo / data_StoreSaleDetail
        // (sp_SaveStoreSale writes them). The earlier query targeted the legacy
        // FIS tables data_SaleInfo / data_SaleDetail which AutoDMS never writes
        // to — that's why the report was always empty.
        // Owner ask 2026-07-03: add a free-text filter that matches part no
        // (ManualNumber or legacy BIGINT ItemNumber), part name, customer,
        // or SS invoice number.
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);
        let where = 's.SaleDate BETWEEN @from AND @to';
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            where += ` AND (
                s.InvoiceNo LIKE @s
                OR ISNULL(p.PartyName, s.CustomerName) LIKE @s
                OR i.ItenName LIKE @s
                OR i.ManualNumber LIKE @s
                OR CAST(i.ItemNumber AS NVARCHAR(50)) LIKE @s
            )`;
        }
        const r = await rq.query(`
                SELECT s.SaleID, s.InvoiceNo AS SaleVoucherNo, s.SaleDate, s.NetPayable AS InvoiceNet,
                       ISNULL(p.PartyName, s.CustomerName) AS Customer,
                       d.SaleDetailID, d.ItemID,
                       i.ItemNumber AS ItemCode, i.ManualNumber AS ManualCode, i.ItenName AS ItemName,
                       d.Quantity, d.SaleRate AS ItemRate, d.NetAmount AS LineNet,
                       ISNULL(d.TaxAmount, 0) AS Tax,
                       d.DiscountAmount
                FROM data_StoreSaleDetail d
                INNER JOIN data_StoreSaleInfo s ON d.SaleID = s.SaleID
                LEFT JOIN gen_PartiesInfo p ON s.PartyID = p.PartyID
                LEFT JOIN InventItems i     ON d.ItemID = i.ItemId
                WHERE ${where}
                ORDER BY s.SaleDate DESC, s.SaleID DESC`);

        const rows = r.recordset.map(x => ({
            SaleVoucherNo: x.SaleVoucherNo,
            SaleDate:      x.SaleDate?.toISOString().slice(0,10),
            Customer:      x.Customer || '',
            // Prefer alphanumeric ManualNumber over legacy BIGINT ItemNumber.
            ItemCode:      x.ManualCode || (x.ItemCode != null ? String(x.ItemCode) : ''),
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
        const search = (req.query.search || '').trim();
        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);
        let where = 'p.PurchaseDate BETWEEN @from AND @to';
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            where += ` AND (
                p.PurchaseVoucherNo LIKE @s
                OR pp.PartyName LIKE @s
                OR i.ItenName LIKE @s
                OR i.ManualNumber LIKE @s
                OR CAST(i.ItemNumber AS NVARCHAR(50)) LIKE @s
            )`;
        }
        const r = await rq.query(`
                SELECT p.PurchaseID, p.PurchaseVoucherNo, p.PurchaseDate, p.NetAmount AS GRNNet,
                       pp.PartyName AS Supplier,
                       d.PurchaseDetailID, d.ItemId,
                       i.ItemNumber AS ItemCode, i.ManualNumber AS ManualCode, i.ItenName AS ItemName,
                       d.Quantity, d.ItemRate, d.NetAmount AS LineNet,
                       (ISNULL(d.TaxOneAmount,0) + ISNULL(d.TaxTwoAmount,0)) AS Tax,
                       d.DiscountAmount
                FROM data_PurchaseDetail d
                INNER JOIN data_PurchaseInfo p ON d.PurchaseID = p.PurchaseID
                LEFT JOIN gen_PartiesInfo pp   ON p.PartyID = pp.PartyID
                LEFT JOIN InventItems i        ON d.ItemId = i.ItemId
                WHERE ${where}
                ORDER BY p.PurchaseDate DESC, p.PurchaseID DESC`);

        const rows = r.recordset.map(x => ({
            GRNNo:    x.PurchaseVoucherNo,
            GRNDate:  x.PurchaseDate?.toISOString().slice(0,10),
            Supplier: x.Supplier || '',
            // Prefer alphanumeric ManualNumber over legacy BIGINT ItemNumber.
            ItemCode: x.ManualCode || (x.ItemCode != null ? String(x.ItemCode) : ''),
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

/**
 * GET /reports/parts/issued-to-jc
 * Owner ask 2026-07-03: "which parts were issued to which job cards"
 * line-by-line for a date range, with a free-text filter.
 */
exports.partsIssuedToJc = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const search = (req.query.search || '').trim();
        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);
        let where = 'v.IssueDate BETWEEN @from AND @to';
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            where += ` AND (
                v.JobCardNo LIKE @s
                OR v.ItemName LIKE @s
                OR v.ManualNumber LIKE @s
                OR CAST(v.ItemNumber AS NVARCHAR(50)) LIKE @s
                OR ISNULL(c.endUserName, '') LIKE @s
            )`;
        }
        const r = await rq.query(`
            SELECT v.StockIssueDetailID, v.IssueNo, v.IssueDate,
                   v.JobCardId, v.JobCardNo,
                   c.endUserName AS CustomerName,
                   j.VehicleRegNo,
                   v.ItemId, v.ItemName, v.ItemNumber, v.ManualNumber,
                   v.IssueQuantity, v.ItemRate, v.Discount, v.DiscAmt,
                   v.TaxRate, v.TaxAmount, v.LineNet
            FROM vw_PartsIssueToJobCard v
            LEFT JOIN Addata_JobCardInfo  j ON v.JobCardId = j.JobCardId
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            WHERE ${where}
            ORDER BY v.IssueDate DESC, v.StockIssueID DESC, v.StockIssueDetailID DESC
        `);
        const rows = r.recordset.map(x => ({
            SlipNo:       'PI-' + String(x.IssueNo || 0).padStart(4, '0'),
            IssueDate:    x.IssueDate?.toISOString().slice(0, 10),
            JobCardNo:    x.JobCardNo || '',
            Customer:     x.CustomerName || '',
            VehicleRegNo: x.VehicleRegNo || '',
            ItemCode:     x.ManualNumber || (x.ItemNumber != null ? String(x.ItemNumber) : ''),
            ItemName:     x.ItemName || '',
            Quantity:     +Number(x.IssueQuantity || 0).toFixed(2),
            Rate:         +Number(x.ItemRate || 0).toFixed(2),
            Discount:     +Number(x.DiscAmt || 0).toFixed(2),
            Tax:          +Number(x.TaxAmount || 0).toFixed(2),
            LineNet:      +Number(x.LineNet || 0).toFixed(2),
        }));
        const totals = {
            lines:    rows.length,
            slips:    new Set(rows.map(r => r.SlipNo)).size,
            quantity: +rows.reduce((s, x) => s + x.Quantity, 0).toFixed(2),
            discount: +rows.reduce((s, x) => s + x.Discount, 0).toFixed(2),
            tax:      +rows.reduce((s, x) => s + x.Tax, 0).toFixed(2),
            net:      +rows.reduce((s, x) => s + x.LineNet, 0).toFixed(2),
        };
        res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), rows, totals });
    } catch (err) { console.error('partsIssuedToJc:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/parts/item-search?q=
 *
 * Typeahead helper for the Item Ledger. Returns up to 50 items whose
 * name / item number / part number matches the query. Owner ask 2026-07-17.
 */
exports.itemSearch = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const pool = await getPool();
        const r = await pool.request()
            .input('q', sql.NVarChar(200), `%${q}%`)
            .query(`
                SELECT TOP 50
                    i.ItemId,
                    CAST(i.ItemNumber AS NVARCHAR(50)) AS ItemNumber,
                    i.ManualNumber   AS PartNumber,
                    i.ItenName       AS ItemName,
                    i.WeightedRate,
                    c.CategoryName,
                    w.WHDesc         AS Warehouse
                FROM InventItems i
                LEFT JOIN InventCategory  c ON c.CategoryID = i.CategoryID
                LEFT JOIN InventWareHouse w ON w.WHID       = i.WHID
                WHERE i.ItemStatus = 1
                  AND (@q = '%%'
                       OR i.ItenName    LIKE @q
                       OR i.ManualNumber LIKE @q
                       OR CAST(i.ItemNumber AS NVARCHAR(50)) LIKE @q)
                ORDER BY i.ItenName
            `);
        res.json(r.recordset);
    } catch (err) {
        console.error('itemSearch:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/parts/item-ledger?itemId=X&from=&to=
 *
 * Chronological ledger of every stock movement for one item in a period —
 * with opening balance, running quantity + running value, and closing.
 * Rows come from data_StockArrivalDetail (GRNs / opening stock) and
 * data_StockInOutDetail (positive = purchase-return-in / positive adj,
 * negative = issue / sale / negative adj), joined to the header for the
 * date and source-doc reference. Owner ask 2026-07-17.
 */
exports.itemLedger = async (req, res) => {
    try {
        const itemId = parseInt(req.query.itemId);
        if (!Number.isFinite(itemId)) return res.status(400).json({ error: 'itemId is required.' });
        const { from, to } = parseRange(req);

        const pool = await getPool();

        // 1. Item master (title, part #, weighted rate, warehouse, category)
        const itmRes = await pool.request()
            .input('id', sql.Int, itemId)
            .query(`
                SELECT i.ItemId,
                       CAST(i.ItemNumber AS NVARCHAR(50)) AS ItemNumber,
                       i.ManualNumber AS PartNumber,
                       i.ItenName     AS ItemName,
                       i.WeightedRate,
                       i.ReOrderLevel,
                       u.UOMName,
                       c.CategoryName,
                       w.WHDesc       AS Warehouse
                FROM InventItems i
                LEFT JOIN InventUOM       u ON u.UOMId      = i.UOMId
                LEFT JOIN InventCategory  c ON c.CategoryID = i.CategoryID
                LEFT JOIN InventWareHouse w ON w.WHID       = i.WHID
                WHERE i.ItemId = @id`);
        if (!itmRes.recordset.length) return res.status(404).json({ error: 'Item not found.' });
        const item = itmRes.recordset[0];

        // 2. Opening quantity — everything strictly before @from.
        const openRes = await pool.request()
            .input('id',   sql.Int,      itemId)
            .input('from', sql.DateTime, from)
            .query(`
                SELECT
                    ISNULL((SELECT SUM(sd.Quantity)
                            FROM   data_StockArrivalDetail sd
                            JOIN   data_StockArrivalInfo   si ON si.ArrivalID = sd.ArrivalID
                            WHERE  sd.ItemId = @id AND si.ArrivalDate < @from), 0)
                  + ISNULL((SELECT SUM(od.Quantity)
                            FROM   data_StockInOutDetail od
                            JOIN   data_StockInOutInfo   oi ON oi.StockIOID = od.StockIOID
                            WHERE  od.ItemId = @id AND oi.StockIODate < @from), 0)
                    AS OpeningQty`);
        const openingQty = Number(openRes.recordset[0].OpeningQty) || 0;

        // 3. Period rows — union of arrivals and stock IO, sorted chronologically.
        const rowsRes = await pool.request()
            .input('id',   sql.Int,      itemId)
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT MoveDate, MoveType, SourceRef, SourceParty, Remarks,
                       QtyIn, QtyOut, Rate, LineValue
                FROM (
                    -- Stock arrivals (GRN / opening stock imports).
                    -- data_StockArrivalInfo has no PartyID; supplier for a GRN
                    -- lives on data_PurchaseInfo — chase it through RefID when
                    -- present so GRN rows still show the supplier name.
                    SELECT
                        si.ArrivalDate               AS MoveDate,
                        CASE WHEN si.ArrivalNo IS NULL THEN 'Opening' ELSE 'GRN' END AS MoveType,
                        ISNULL(CAST(si.ArrivalNo AS NVARCHAR(50)), 'Opening') AS SourceRef,
                        p.PartyName                  AS SourceParty,
                        si.Remarks                   AS Remarks,
                        sd.Quantity                  AS QtyIn,
                        CAST(0 AS DECIMAL(18,4))     AS QtyOut,
                        sd.StockRate                 AS Rate,
                        CAST(sd.Quantity * sd.StockRate AS DECIMAL(18,2)) AS LineValue
                    FROM   data_StockArrivalDetail sd
                    JOIN   data_StockArrivalInfo   si ON si.ArrivalID = sd.ArrivalID
                    LEFT   JOIN data_PurchaseInfo  pi ON pi.PurchaseID = si.RefID
                    LEFT   JOIN gen_PartiesInfo    p  ON p.PartyID    = pi.PartyID
                    WHERE  sd.ItemId = @id
                      AND  si.ArrivalDate BETWEEN @from AND @to
                    UNION ALL
                    -- Stock in/out (issues, sales, adjustments, purchase returns…)
                    -- JOIN to data_StockIssuetoJobCard via IssuanceID so JC parts
                    -- issues show the JobCardNo in the ref column instead of a
                    -- bare integer; owner clarification 2026-07-17.
                    SELECT
                        oi.StockIODate               AS MoveDate,
                        CASE
                            WHEN od.Quantity > 0 THEN COALESCE(oi.StockType, 'Adj +')
                            ELSE COALESCE(oi.StockType, 'Adj -')
                        END                          AS MoveType,
                        COALESCE(jc.JobCardNo,
                                 CAST(oi.StockIONo AS NVARCHAR(50)),
                                 '')                 AS SourceRef,
                        COALESCE(jc.VehicleRegNo, p.PartyName) AS SourceParty,
                        oi.Remarks                   AS Remarks,
                        CASE WHEN od.Quantity > 0 THEN od.Quantity        ELSE CAST(0 AS DECIMAL(18,4)) END AS QtyIn,
                        CASE WHEN od.Quantity < 0 THEN ABS(od.Quantity)   ELSE CAST(0 AS DECIMAL(18,4)) END AS QtyOut,
                        od.StockRate                 AS Rate,
                        CAST(ABS(od.Quantity) * od.StockRate AS DECIMAL(18,2)) AS LineValue
                    FROM   data_StockInOutDetail od
                    JOIN   data_StockInOutInfo   oi ON oi.StockIOID = od.StockIOID
                    LEFT   JOIN data_StockIssuetoJobCard sij ON sij.StockIssueID = oi.IssuanceID
                    LEFT   JOIN Addata_JobCardInfo       jc  ON jc.JobCardId    = sij.JobCardId
                    LEFT   JOIN gen_PartiesInfo          p   ON p.PartyID       = oi.PartyID
                    WHERE  od.ItemId = @id
                      AND  oi.StockIODate BETWEEN @from AND @to
                ) u
                ORDER BY MoveDate, MoveType, SourceRef`);

        // Running balance from opening + apply each row
        let running = openingQty;
        const rows = rowsRes.recordset.map(x => {
            const qtyIn  = Number(x.QtyIn)  || 0;
            const qtyOut = Number(x.QtyOut) || 0;
            running = running + qtyIn - qtyOut;
            return {
                Date:       x.MoveDate?.toISOString().slice(0, 10) || null,
                MoveType:   x.MoveType || '',
                SourceRef:  x.SourceRef || '',
                SourceParty: x.SourceParty || '',
                Remarks:    x.Remarks || '',
                QtyIn:      +qtyIn.toFixed(4),
                QtyOut:     +qtyOut.toFixed(4),
                Rate:       +Number(x.Rate || 0).toFixed(2),
                LineValue:  +Number(x.LineValue || 0).toFixed(2),
                Balance:    +running.toFixed(4),
            };
        });

        const totals = {
            openingQty: +openingQty.toFixed(4),
            qtyIn:      +rows.reduce((s, x) => s + x.QtyIn,  0).toFixed(4),
            qtyOut:     +rows.reduce((s, x) => s + x.QtyOut, 0).toFixed(4),
            closingQty: +running.toFixed(4),
            valueIn:    +rows.filter(x => x.QtyIn > 0).reduce((s, x) => s + x.LineValue, 0).toFixed(2),
            valueOut:   +rows.filter(x => x.QtyOut > 0).reduce((s, x) => s + x.LineValue, 0).toFixed(2),
            closingValue: +(running * Number(item.WeightedRate || 0)).toFixed(2),
            moves:      rows.length,
        };

        res.json({
            item,
            from: from.toISOString().slice(0, 10),
            to:   to.toISOString().slice(0, 10),
            rows,
            totals,
        });
    } catch (err) {
        console.error('itemLedger:', err);
        res.status(500).json({ error: err.message });
    }
};
