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
        const businessType = req.query.businessType ? parseInt(req.query.businessType) : null;
        const mode = (req.query.mode || '').toUpperCase();   // 'CASH' | 'CREDIT' | ''
        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);
        let where = 'v.IssueDate BETWEEN @from AND @to';
        if (businessType) { rq.input('bt', sql.Int, businessType); where += ' AND j.JobTypeId = @bt'; }
        if (mode === 'CASH')   where += ' AND j.PartyID IS NULL';
        if (mode === 'CREDIT') where += ' AND j.PartyID IS NOT NULL';
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            where += ` AND (
                v.JobCardNo LIKE @s
                OR v.ItemName LIKE @s
                OR v.ManualNumber LIKE @s
                OR CAST(v.ItemNumber AS NVARCHAR(50)) LIKE @s
                OR ISNULL(c.endUserName, '') LIKE @s
                OR ISNULL(p.PartyName, '')   LIKE @s
            )`;
        }
        const r = await rq.query(`
            SELECT v.StockIssueDetailID, v.IssueNo, v.IssueDate,
                   v.JobCardId, v.JobCardNo,
                   c.endUserName AS CustomerName,
                   p.PartyName,
                   j.VehicleRegNo,
                   j.JobTypeId,
                   ISNULL(t.CardCode, '—') AS BusinessUnitCode,
                   ISNULL(t.Title,    '—') AS BusinessUnitName,
                   CASE WHEN j.PartyID IS NULL THEN 'CASH' ELSE 'CREDIT' END AS Mode,
                   v.ItemId, v.ItemName, v.ItemNumber, v.ManualNumber,
                   v.IssueQuantity, v.ItemRate, v.Discount, v.DiscAmt,
                   v.TaxRate, v.TaxAmount, v.LineNet
            FROM vw_PartsIssueToJobCard v
            LEFT JOIN Addata_JobCardInfo  j ON v.JobCardId = j.JobCardId
            LEFT JOIN gen_JobCardType     t ON t.JobCardTypeId = j.JobTypeId
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            LEFT JOIN gen_PartiesInfo     p ON p.PartyID   = j.PartyID
            WHERE ${where}
            ORDER BY v.IssueDate DESC, v.StockIssueID DESC, v.StockIssueDetailID DESC
        `);
        const rows = r.recordset.map(x => ({
            SlipNo:           'PI-' + String(x.IssueNo || 0).padStart(4, '0'),
            IssueDate:        x.IssueDate?.toISOString().slice(0, 10),
            JobCardNo:        x.JobCardNo || '',
            Customer:         x.CustomerName || x.PartyName || '',
            PartyName:        x.PartyName || '',
            VehicleRegNo:     x.VehicleRegNo || '',
            BusinessUnitCode: x.BusinessUnitCode || '—',
            BusinessUnitName: x.BusinessUnitName || '—',
            Mode:             x.Mode || 'CASH',
            ItemCode:         x.ManualNumber || (x.ItemNumber != null ? String(x.ItemNumber) : ''),
            ItemName:         x.ItemName || '',
            Quantity:         +Number(x.IssueQuantity || 0).toFixed(2),
            Rate:             +Number(x.ItemRate || 0).toFixed(2),
            Discount:         +Number(x.DiscAmt || 0).toFixed(2),
            Tax:              +Number(x.TaxAmount || 0).toFixed(2),
            LineNet:          +Number(x.LineNet || 0).toFixed(2),
        }));

        // Per-Business-Unit rollup, split by Mode (Cash / Credit). Each row
        // is (Code, Name) with Cash + Credit + Total sub-totals so the
        // frontend can render one BU × Mode grid.
        const buMap = new Map();
        const bumpCell = (bucket, mode, row) => {
            const cell = bucket[mode];
            cell.Lines += 1;
            cell.Slips.add(row.SlipNo);
            cell.Quantity += row.Quantity;
            cell.Discount += row.Discount;
            cell.Tax      += row.Tax;
            cell.Net      += row.LineNet;
        };
        for (const row of rows) {
            const key = row.BusinessUnitCode;
            let b = buMap.get(key);
            if (!b) {
                b = {
                    Code: row.BusinessUnitCode, Name: row.BusinessUnitName,
                    CASH:   { Lines: 0, Slips: new Set(), Quantity: 0, Discount: 0, Tax: 0, Net: 0 },
                    CREDIT: { Lines: 0, Slips: new Set(), Quantity: 0, Discount: 0, Tax: 0, Net: 0 },
                };
                buMap.set(key, b);
            }
            bumpCell(b, row.Mode, row);
        }
        const finalizeCell = (c) => ({
            Lines:    c.Lines,
            Slips:    c.Slips.size,
            Quantity: +c.Quantity.toFixed(2),
            Discount: +c.Discount.toFixed(2),
            Tax:      +c.Tax.toFixed(2),
            Net:      +c.Net.toFixed(2),
        });
        const byBusinessUnit = Array.from(buMap.values())
            .map(b => {
                const cash   = finalizeCell(b.CASH);
                const credit = finalizeCell(b.CREDIT);
                return {
                    Code:     b.Code,
                    Name:     b.Name,
                    Cash:     cash,
                    Credit:   credit,
                    Total: {
                        Lines:    cash.Lines + credit.Lines,
                        Slips:    (new Set([...Array.from(b.CASH.Slips), ...Array.from(b.CREDIT.Slips)])).size,
                        Quantity: +(cash.Quantity + credit.Quantity).toFixed(2),
                        Discount: +(cash.Discount + credit.Discount).toFixed(2),
                        Tax:      +(cash.Tax      + credit.Tax).toFixed(2),
                        Net:      +(cash.Net      + credit.Net).toFixed(2),
                    },
                };
            })
            .sort((a, b) => b.Total.Net - a.Total.Net);

        const modeSum = (m) => {
            const filtered = rows.filter(r => r.Mode === m);
            return {
                lines:    filtered.length,
                slips:    new Set(filtered.map(r => r.SlipNo)).size,
                quantity: +filtered.reduce((s, x) => s + x.Quantity, 0).toFixed(2),
                discount: +filtered.reduce((s, x) => s + x.Discount, 0).toFixed(2),
                tax:      +filtered.reduce((s, x) => s + x.Tax, 0).toFixed(2),
                net:      +filtered.reduce((s, x) => s + x.LineNet, 0).toFixed(2),
            };
        };

        const totals = {
            lines:    rows.length,
            slips:    new Set(rows.map(r => r.SlipNo)).size,
            quantity: +rows.reduce((s, x) => s + x.Quantity, 0).toFixed(2),
            discount: +rows.reduce((s, x) => s + x.Discount, 0).toFixed(2),
            tax:      +rows.reduce((s, x) => s + x.Tax, 0).toFixed(2),
            net:      +rows.reduce((s, x) => s + x.LineNet, 0).toFixed(2),
            byBusinessUnit,
            byMode: { cash: modeSum('CASH'), credit: modeSum('CREDIT') },
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
/**
 * GET /reports/parts/sold-finalized?from&to&businessType&mode&search&includeStoreSale
 *
 * All parts SOLD (with the underlying document finalized) in the period,
 * across two channels:
 *   1. Parts issued to Job Cards where the JC IsFinalized = 1
 *   2. Store Sale detail lines where the sale IsFinalized = 1 (only when
 *      includeStoreSale=1)
 *
 * Same BU × Cash/Credit segregation as partsIssuedToJc:
 *   Cash   = PartyID IS NULL   (walk-in)
 *   Credit = PartyID IS NOT NULL (named party — corporate / HPA / insurance)
 * Store Sale entries carry a synthetic BusinessUnitCode of "SS" so they can
 * be told apart from workshop JC codes (GR/WR/B&P/PPM/…).
 *
 * Owner ask 2026-07-22.
 */
exports.partsSoldFinalized = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const search = (req.query.search || '').trim();
        const businessType = req.query.businessType ? parseInt(req.query.businessType) : null;
        const mode = (req.query.mode || '').toUpperCase();
        const includeStoreSale = String(req.query.includeStoreSale || '1') !== '0';

        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);

        // ── JC side ────────────────────────────────────────────────────
        // Date filter is on the JC finalize voucher's date so the report
        // aligns to the GL revenue account 401003001. Only Posted, non-
        // reversed vouchers count. Parts issue lines are then joined via
        // JobCardId. A JC's finalize voucher is unique per JC, so we pick
        // the first one via CROSS APPLY TOP 1.
        let jcWhere = `jcv.VoucherDate BETWEEN @from AND @to AND j.IsFinalized = 1`;
        if (businessType) { rq.input('bt', sql.Int, businessType); jcWhere += ' AND j.JobTypeId = @bt'; }
        if (mode === 'CASH')   jcWhere += ' AND j.PartyID IS NULL';
        if (mode === 'CREDIT') jcWhere += ' AND j.PartyID IS NOT NULL';
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            jcWhere += ` AND (
                v.JobCardNo LIKE @s
                OR v.ItemName LIKE @s
                OR v.ManualNumber LIKE @s
                OR CAST(v.ItemNumber AS NVARCHAR(50)) LIKE @s
                OR ISNULL(c.endUserName, '') LIKE @s
                OR ISNULL(p.PartyName, '')   LIKE @s
            )`;
        }
        const jcQuery = `
            SELECT 'JC' AS Channel,
                   jcv.VoucherDate   AS DocDate,
                   v.IssueNo         AS DocNo,
                   v.JobCardNo       AS RefNo,
                   j.VehicleRegNo,
                   ISNULL(t.CardCode, '—') AS BusinessUnitCode,
                   ISNULL(t.Title,    '—') AS BusinessUnitName,
                   c.endUserName     AS CustomerName,
                   p.PartyName,
                   CASE WHEN j.PartyID IS NULL THEN 'CASH' ELSE 'CREDIT' END AS Mode,
                   v.ItemName, v.ItemNumber, v.ManualNumber,
                   v.IssueQuantity   AS Quantity,
                   v.ItemRate        AS Rate,
                   v.DiscAmt         AS Discount,
                   v.TaxAmount       AS Tax,
                   v.LineNet         AS LineNet
            FROM   vw_PartsIssueToJobCard v
            LEFT   JOIN Addata_JobCardInfo  j ON v.JobCardId = j.JobCardId
            CROSS  APPLY (
                SELECT TOP 1 fv.VoucherDate
                FROM   data_FinanceVoucherInfo fv
                WHERE  fv.SourceDocType IN ('JC','JOBCARD')
                  AND  fv.SourceDocID   = j.JobCardId
                  AND  fv.Status = 'Posted'
                  AND  fv.ReversesVoucherID IS NULL
                ORDER  BY fv.VoucherID
            ) jcv
            LEFT   JOIN gen_JobCardType     t ON t.JobCardTypeId = j.JobTypeId
            LEFT   JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            LEFT   JOIN gen_PartiesInfo     p ON p.PartyID   = j.PartyID
            WHERE  ${jcWhere}`;

        // ── Store Sale side ────────────────────────────────────────────
        let ssQuery = '';
        if (includeStoreSale && !businessType) {
            // Only include Store Sales when the BU filter is empty — Store Sale
            // has no workshop JC type, so any BU filter naturally excludes it.
            // Date filter runs on the SS finalize voucher date so this matches
            // the GL 401003001 credits for store-sale-originated revenue.
            let ssWhere = `ssv.VoucherDate BETWEEN @from AND @to AND si.IsFinalized = 1`;
            if (mode === 'CASH')   ssWhere += ' AND si.PartyID IS NULL';
            if (mode === 'CREDIT') ssWhere += ' AND si.PartyID IS NOT NULL';
            if (search) {
                ssWhere += ` AND (
                    si.InvoiceNo LIKE @s
                    OR ii.ItenName LIKE @s
                    OR ISNULL(ii.ManualNumber, '') LIKE @s
                    OR CAST(ii.ItemNumber AS NVARCHAR(50)) LIKE @s
                    OR ISNULL(si.CustomerName, '') LIKE @s
                    OR ISNULL(sp.PartyName, '')    LIKE @s
                )`;
            }
            ssQuery = `
            UNION ALL
            SELECT 'SS' AS Channel,
                   ssv.VoucherDate   AS DocDate,
                   si.SaleID         AS DocNo,
                   si.InvoiceNo      AS RefNo,
                   NULL              AS VehicleRegNo,
                   'SS'              AS BusinessUnitCode,
                   'Store Sale'      AS BusinessUnitName,
                   si.CustomerName   AS CustomerName,
                   sp.PartyName,
                   CASE WHEN si.PartyID IS NULL THEN 'CASH' ELSE 'CREDIT' END AS Mode,
                   ii.ItenName       AS ItemName,
                   ii.ItemNumber,
                   ii.ManualNumber,
                   sd.Quantity,
                   sd.SaleRate       AS Rate,
                   ISNULL(sd.DiscountAmount, 0) AS Discount,
                   ISNULL(sd.TaxAmount, 0)      AS Tax,
                   (sd.Quantity * sd.SaleRate) - ISNULL(sd.DiscountAmount, 0) + ISNULL(sd.TaxAmount, 0) AS LineNet
            FROM   data_StoreSaleDetail sd
            JOIN   data_StoreSaleInfo   si ON si.SaleID = sd.SaleID
            CROSS  APPLY (
                SELECT TOP 1 fv.VoucherDate
                FROM   data_FinanceVoucherInfo fv
                WHERE  fv.SourceDocType = 'SI'
                  AND  fv.SourceDocID   = si.SaleID
                  AND  fv.Status = 'Posted'
                  AND  fv.ReversesVoucherID IS NULL
                ORDER  BY fv.VoucherID
            ) ssv
            JOIN   InventItems          ii ON ii.ItemId = sd.ItemID
            LEFT   JOIN gen_PartiesInfo sp ON sp.PartyID = si.PartyID
            WHERE  ${ssWhere}`;
        }

        const r = await rq.query(`${jcQuery} ${ssQuery} ORDER BY DocDate DESC, RefNo DESC`);

        const rows = r.recordset.map(x => {
            const lineNet = +Number(x.LineNet || 0).toFixed(2);
            const tax     = +Number(x.Tax || 0).toFixed(2);
            // Revenue is the GL-side Cr on 401xxx: net of discount but
            // BEFORE output GST (which lands on a separate GST Payable GL).
            const revenue = +(lineNet - tax).toFixed(2);
            return {
                Channel:          x.Channel,
                DocDate:          x.DocDate?.toISOString().slice(0, 10),
                DocRef:           x.Channel === 'JC'
                                    ? 'PI-' + String(x.DocNo || 0).padStart(4, '0')
                                    : (x.RefNo || `SS-${x.DocNo}`),
                RefNo:            x.RefNo || '',
                VehicleRegNo:     x.VehicleRegNo || '',
                BusinessUnitCode: x.BusinessUnitCode,
                BusinessUnitName: x.BusinessUnitName,
                Mode:             x.Mode,
                Customer:         x.CustomerName || x.PartyName || '',
                PartyName:        x.PartyName || '',
                ItemCode:         x.ManualNumber || (x.ItemNumber != null ? String(x.ItemNumber) : ''),
                ItemName:         x.ItemName || '',
                Quantity:         +Number(x.Quantity || 0).toFixed(2),
                Rate:             +Number(x.Rate || 0).toFixed(2),
                Discount:         +Number(x.Discount || 0).toFixed(2),
                Tax:              tax,
                Revenue:          revenue,   // matches GL 401003001 Cr
                LineNet:          lineNet,   // Revenue + Tax (what customer paid)
            };
        });

        // BU × Mode rollup — same shape as partsIssuedToJc
        const buMap = new Map();
        const bumpCell = (bucket, m, row) => {
            const cell = bucket[m];
            cell.Lines += 1;
            cell.Docs.add(row.DocRef);
            cell.Quantity += row.Quantity;
            cell.Discount += row.Discount;
            cell.Tax      += row.Tax;
            cell.Revenue  += row.Revenue;
            cell.Net      += row.LineNet;
        };
        for (const row of rows) {
            const key = row.BusinessUnitCode;
            let b = buMap.get(key);
            if (!b) {
                b = {
                    Code: row.BusinessUnitCode, Name: row.BusinessUnitName,
                    CASH:   { Lines: 0, Docs: new Set(), Quantity: 0, Discount: 0, Tax: 0, Revenue: 0, Net: 0 },
                    CREDIT: { Lines: 0, Docs: new Set(), Quantity: 0, Discount: 0, Tax: 0, Revenue: 0, Net: 0 },
                };
                buMap.set(key, b);
            }
            bumpCell(b, row.Mode, row);
        }
        const finalizeCell = (c) => ({
            Lines:    c.Lines,
            Docs:     c.Docs.size,
            Quantity: +c.Quantity.toFixed(2),
            Discount: +c.Discount.toFixed(2),
            Tax:      +c.Tax.toFixed(2),
            Revenue:  +c.Revenue.toFixed(2),
            Net:      +c.Net.toFixed(2),
        });
        const byBusinessUnit = Array.from(buMap.values())
            .map(b => {
                const cash   = finalizeCell(b.CASH);
                const credit = finalizeCell(b.CREDIT);
                return {
                    Code:  b.Code, Name: b.Name,
                    Cash:  cash, Credit: credit,
                    Total: {
                        Lines:    cash.Lines + credit.Lines,
                        Docs:     (new Set([...Array.from(b.CASH.Docs), ...Array.from(b.CREDIT.Docs)])).size,
                        Quantity: +(cash.Quantity + credit.Quantity).toFixed(2),
                        Discount: +(cash.Discount + credit.Discount).toFixed(2),
                        Tax:      +(cash.Tax      + credit.Tax).toFixed(2),
                        Revenue:  +(cash.Revenue  + credit.Revenue).toFixed(2),
                        Net:      +(cash.Net      + credit.Net).toFixed(2),
                    },
                };
            })
            .sort((a, b) => b.Total.Revenue - a.Total.Revenue);

        const modeSum = (m) => {
            const filtered = rows.filter(r => r.Mode === m);
            return {
                lines:    filtered.length,
                docs:     new Set(filtered.map(r => r.DocRef)).size,
                quantity: +filtered.reduce((s, x) => s + x.Quantity, 0).toFixed(2),
                discount: +filtered.reduce((s, x) => s + x.Discount, 0).toFixed(2),
                tax:      +filtered.reduce((s, x) => s + x.Tax, 0).toFixed(2),
                revenue:  +filtered.reduce((s, x) => s + x.Revenue, 0).toFixed(2),
                net:      +filtered.reduce((s, x) => s + x.LineNet, 0).toFixed(2),
            };
        };

        const totals = {
            lines:    rows.length,
            docs:     new Set(rows.map(r => r.DocRef)).size,
            quantity: +rows.reduce((s, x) => s + x.Quantity, 0).toFixed(2),
            discount: +rows.reduce((s, x) => s + x.Discount, 0).toFixed(2),
            tax:      +rows.reduce((s, x) => s + x.Tax, 0).toFixed(2),
            revenue:  +rows.reduce((s, x) => s + x.Revenue, 0).toFixed(2),  // matches GL 401003001
            net:      +rows.reduce((s, x) => s + x.LineNet, 0).toFixed(2),
            byBusinessUnit,
            byMode: { cash: modeSum('CASH'), credit: modeSum('CREDIT') },
        };
        res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), rows, totals });
    } catch (err) { console.error('partsSoldFinalized:', err); res.status(500).json({ error: err.message }); }
};

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
                  AND i.ItemType = 'Part'  -- exclude labour/services from the ledger picker
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
                WHERE i.ItemId = @id AND i.ItemType = 'Part'`);
        if (!itmRes.recordset.length) return res.status(404).json({ error: 'Item not found or not a stock part.' });
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
