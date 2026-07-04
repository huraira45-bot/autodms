/**
 * Paint Lab — reports + dashboard controller (Phase 4).
 *
 * All endpoints are read-only. Filters are optional; endpoints without
 * a date range return "all time". Dashboard is a bundle of five KPIs
 * used by pages/paint/PaintDashboard.jsx.
 */
const { sql, getPool } = require('../config/db');

// Small helper — bind common date filters onto a request.
function bindDates(rq, from, to, col) {
    const conds = [];
    if (from) { rq.input('df', sql.Date, from); conds.push(`${col} >= @df`); }
    if (to)   { rq.input('dt', sql.Date, to);   conds.push(`${col} <= @dt`); }
    return conds;
}

// 1. Stock Balance — snapshot of every active paint item + last movement.
exports.stockBalance = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['pi.IsActive=1'];
        if (req.query.categoryId) { rq.input('c', sql.Int, parseInt(req.query.categoryId)); conds.push('pi.PaintCategoryID = @c'); }
        if (req.query.brandId)    { rq.input('b', sql.Int, parseInt(req.query.brandId));    conds.push('pi.PaintBrandID    = @b'); }
        const r = await rq.query(`
            SELECT pi.PaintItemID, pi.PaintCode, pi.PaintName,
                   cat.CategoryName, br.BrandName, u.UOMName,
                   pi.ReorderLevel, pi.StockQty, pi.AvgCost, pi.StockValue,
                   CASE WHEN pi.ReorderLevel IS NOT NULL AND pi.StockQty <= pi.ReorderLevel THEN 1 ELSE 0 END AS BelowReorder,
                   (SELECT MAX(sl.MovementAt) FROM paint_StockLedger sl WHERE sl.PaintItemID = pi.PaintItemID) AS LastMovementAt
            FROM paint_Item pi
            LEFT JOIN paint_Category cat ON pi.PaintCategoryID = cat.PaintCategoryID
            LEFT JOIN paint_Brand    br  ON pi.PaintBrandID    = br.PaintBrandID
            LEFT JOIN paint_UOM      u   ON pi.PaintUOMID      = u.PaintUOMID
            WHERE ${conds.join(' AND ')}
            ORDER BY pi.PaintName
        `);
        res.json({
            rows: r.recordset,
            totals: {
                items: r.recordset.length,
                stockValue: r.recordset.reduce((a, x) => a + Number(x.StockValue || 0), 0),
                belowReorder: r.recordset.filter(x => x.BelowReorder).length,
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 2. Stock Ledger — one item's history.
exports.stockLedger = async (req, res) => {
    try {
        if (!req.query.paintItemId) return res.status(400).json({ error: 'paintItemId required' });
        const pool = await getPool();
        const rq = pool.request().input('id', sql.Int, parseInt(req.query.paintItemId));
        const conds = ['sl.PaintItemID = @id'];
        conds.push(...bindDates(rq, req.query.from, req.query.to, 'CAST(sl.MovementAt AS DATE)'));
        const r = await rq.query(`
            SELECT sl.LedgerID, sl.MovementAt, sl.SourceType, sl.SourceDocID, sl.SourceDetailID,
                   sl.QuantityDelta, sl.UnitCost, sl.ValueDelta,
                   sl.RunningQty, sl.RunningAvgCost, sl.RunningValue,
                   sl.Note, sl.CreatedByName,
                   w.WHDesc,
                   CASE sl.SourceType
                        WHEN 'GRN'       THEN g1.GRNNo
                        WHEN 'GRTN'      THEN g2.GRTNNo
                        WHEN 'ISSUE'     THEN pi.IssueNo
                        WHEN 'ISSUE_ADJ' THEN pi.IssueNo
                        WHEN 'ISSUE_DEL' THEN pi.IssueNo
                        WHEN 'JC_UNFIN'  THEN pi.IssueNo
                        ELSE NULL END AS SourceRef
            FROM paint_StockLedger sl
            LEFT JOIN paint_Warehouse w ON sl.PaintWHID = w.PaintWHID
            LEFT JOIN paint_GRN  g1 ON sl.SourceType='GRN'  AND sl.SourceDocID = g1.PaintGRNID
            LEFT JOIN paint_GRTN g2 ON sl.SourceType='GRTN' AND sl.SourceDocID = g2.PaintGRTNID
            LEFT JOIN paint_Issue pi ON sl.SourceType IN ('ISSUE','ISSUE_ADJ','ISSUE_DEL','JC_UNFIN')
                                    AND sl.SourceDocID = pi.PaintIssueID
            WHERE ${conds.join(' AND ')}
            ORDER BY sl.LedgerID
        `);
        // Include item header for the report title.
        const hdr = await pool.request().input('id', sql.Int, parseInt(req.query.paintItemId))
            .query(`SELECT pi.PaintCode, pi.PaintName, u.UOMName, pi.StockQty, pi.AvgCost, pi.StockValue
                    FROM paint_Item pi LEFT JOIN paint_UOM u ON pi.PaintUOMID = u.PaintUOMID
                    WHERE pi.PaintItemID=@id`);
        res.json({ item: hdr.recordset[0] || null, rows: r.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 3. Purchase register — Paint GRN (Posted).
exports.purchase = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ["g.Status = 'Posted'"];
        conds.push(...bindDates(rq, req.query.from, req.query.to, 'g.GRNDate'));
        if (req.query.partyId) { rq.input('p', sql.Int, parseInt(req.query.partyId)); conds.push('g.PartyID = @p'); }
        const r = await rq.query(`
            SELECT g.PaintGRNID, g.GRNNo, g.GRNDate, g.SupplierBillNo,
                   p.PartyName, w.WHDesc,
                   g.SubTotal, g.DiscountTotal, g.GSTTotal, g.GrandTotal,
                   g.VoucherID, v.VoucherNo
            FROM paint_GRN g
            INNER JOIN gen_PartiesInfo p ON g.PartyID = p.PartyID
            LEFT JOIN paint_Warehouse w  ON g.PaintWHID = w.PaintWHID
            LEFT JOIN data_FinanceVoucherInfo v ON g.VoucherID = v.VoucherID
            WHERE ${conds.join(' AND ')}
            ORDER BY g.GRNDate DESC, g.PaintGRNID DESC
        `);
        res.json({
            rows: r.recordset,
            totals: {
                count: r.recordset.length,
                subTotal:      r.recordset.reduce((a, x) => a + Number(x.SubTotal      || 0), 0),
                discountTotal: r.recordset.reduce((a, x) => a + Number(x.DiscountTotal || 0), 0),
                gstTotal:      r.recordset.reduce((a, x) => a + Number(x.GSTTotal      || 0), 0),
                grandTotal:    r.recordset.reduce((a, x) => a + Number(x.GrandTotal    || 0), 0),
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 4. GRTN register — supplier returns (Posted).
exports.grtn = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ["g.Status = 'Posted'"];
        conds.push(...bindDates(rq, req.query.from, req.query.to, 'g.GRTNDate'));
        if (req.query.partyId) { rq.input('p', sql.Int, parseInt(req.query.partyId)); conds.push('g.PartyID = @p'); }
        const r = await rq.query(`
            SELECT g.PaintGRTNID, g.GRTNNo, g.GRTNDate,
                   p.PartyName, src.GRNNo AS SourceGRNNo, w.WHDesc,
                   g.GrandTotal, g.VoucherID, v.VoucherNo
            FROM paint_GRTN g
            INNER JOIN gen_PartiesInfo p ON g.PartyID = p.PartyID
            INNER JOIN paint_GRN src     ON g.SourcePaintGRNID = src.PaintGRNID
            LEFT JOIN paint_Warehouse w  ON g.PaintWHID = w.PaintWHID
            LEFT JOIN data_FinanceVoucherInfo v ON g.VoucherID = v.VoucherID
            WHERE ${conds.join(' AND ')}
            ORDER BY g.GRTNDate DESC, g.PaintGRTNID DESC
        `);
        res.json({
            rows: r.recordset,
            totals: {
                count: r.recordset.length,
                grandTotal: r.recordset.reduce((a, x) => a + Number(x.GrandTotal || 0), 0),
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 5. Issue to JC — every Paint Issue in the period.
exports.issueToJC = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['1=1'];
        conds.push(...bindDates(rq, req.query.from, req.query.to, 'pi.IssueDate'));
        if (req.query.jobCardId) { rq.input('jc', sql.Int, parseInt(req.query.jobCardId)); conds.push('pi.JobCardID = @jc'); }
        const r = await rq.query(`
            SELECT pi.PaintIssueID, pi.IssueNo, pi.IssueDate, pi.Locked,
                   pi.JobCardID, jc.JobCardNo, jc.VehicleRegNo,
                   cust.endUserName AS CustomerName,
                   jt.CardCode, jt.Title AS JobTypeTitle,
                   w.WHDesc, pi.TotalCost,
                   (SELECT COUNT(*) FROM paint_IssueDetail d WHERE d.PaintIssueID = pi.PaintIssueID) AS LineCount
            FROM paint_Issue pi
            INNER JOIN Addata_JobCardInfo jc  ON pi.JobCardID = jc.JobCardId
            INNER JOIN gen_JobCardType jt     ON jc.JobCardTypeId = jt.JobCardTypeId
            LEFT JOIN addata_CustomerInfo cust ON jc.EndUserID = cust.ProfileID
            LEFT JOIN paint_Warehouse w       ON pi.PaintWHID = w.PaintWHID
            WHERE ${conds.join(' AND ')}
            ORDER BY pi.IssueDate DESC, pi.PaintIssueID DESC
        `);
        res.json({
            rows: r.recordset,
            totals: {
                count: r.recordset.length,
                totalCost: r.recordset.reduce((a, x) => a + Number(x.TotalCost || 0), 0),
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 6. Consumption by JC — one row per Job Card, summing all its Paint Issues.
exports.consumptionByJC = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['1=1'];
        conds.push(...bindDates(rq, req.query.from, req.query.to, 'pi.IssueDate'));
        // "Only finalized JCs" toggle so ops can filter to what actually hit GL.
        if (req.query.jcFinalized === '1') conds.push('jc.IsFinalized = 1');
        const r = await rq.query(`
            SELECT jc.JobCardId, jc.JobCardNo, jc.VehicleRegNo, jc.IsFinalized,
                   cust.endUserName AS CustomerName,
                   jt.CardCode, jt.Title AS JobTypeTitle,
                   COUNT(pi.PaintIssueID) AS IssueCount,
                   SUM(pi.TotalCost) AS TotalConsumption,
                   MIN(pi.IssueDate) AS FirstIssueDate,
                   MAX(pi.IssueDate) AS LastIssueDate
            FROM paint_Issue pi
            INNER JOIN Addata_JobCardInfo jc  ON pi.JobCardID = jc.JobCardId
            INNER JOIN gen_JobCardType jt     ON jc.JobCardTypeId = jt.JobCardTypeId
            LEFT JOIN addata_CustomerInfo cust ON jc.EndUserID = cust.ProfileID
            WHERE ${conds.join(' AND ')}
            GROUP BY jc.JobCardId, jc.JobCardNo, jc.VehicleRegNo, jc.IsFinalized,
                     cust.endUserName, jt.CardCode, jt.Title
            ORDER BY SUM(pi.TotalCost) DESC
        `);
        res.json({
            rows: r.recordset,
            totals: {
                jobCount: r.recordset.length,
                totalConsumption: r.recordset.reduce((a, x) => a + Number(x.TotalConsumption || 0), 0),
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 7. Consumption by business type — roll-up per gen_JobCardType.
exports.consumptionByBusinessType = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['1=1'];
        conds.push(...bindDates(rq, req.query.from, req.query.to, 'pi.IssueDate'));
        const r = await rq.query(`
            SELECT jt.JobCardTypeId, jt.CardCode, jt.Title,
                   COUNT(DISTINCT jc.JobCardId) AS JCCount,
                   COUNT(pi.PaintIssueID)       AS IssueCount,
                   SUM(pi.TotalCost)            AS TotalConsumption
            FROM paint_Issue pi
            INNER JOIN Addata_JobCardInfo jc ON pi.JobCardID = jc.JobCardId
            INNER JOIN gen_JobCardType jt    ON jc.JobCardTypeId = jt.JobCardTypeId
            WHERE ${conds.join(' AND ')}
            GROUP BY jt.JobCardTypeId, jt.CardCode, jt.Title
            ORDER BY SUM(pi.TotalCost) DESC
        `);
        res.json({
            rows: r.recordset,
            totals: {
                totalConsumption: r.recordset.reduce((a, x) => a + Number(x.TotalConsumption || 0), 0),
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 8. Low Stock — items at or below reorder level.
exports.lowStock = async (_req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT pi.PaintItemID, pi.PaintCode, pi.PaintName,
                   cat.CategoryName, br.BrandName, u.UOMName,
                   pi.ReorderLevel, pi.StockQty, pi.AvgCost, pi.StockValue,
                   (pi.ReorderLevel - pi.StockQty) AS ShortBy
            FROM paint_Item pi
            LEFT JOIN paint_Category cat ON pi.PaintCategoryID = cat.PaintCategoryID
            LEFT JOIN paint_Brand    br  ON pi.PaintBrandID    = br.PaintBrandID
            LEFT JOIN paint_UOM      u   ON pi.PaintUOMID      = u.PaintUOMID
            WHERE pi.IsActive = 1 AND pi.ReorderLevel IS NOT NULL AND pi.StockQty <= pi.ReorderLevel
            ORDER BY (pi.ReorderLevel - pi.StockQty) DESC
        `);
        res.json({ rows: r.recordset, totals: { count: r.recordset.length } });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ────────────────────────────────────────────────────────────────
// Dashboard — five KPI blocks for the landing screen.
// ────────────────────────────────────────────────────────────────
exports.dashboard = async (_req, res) => {
    try {
        const pool = await getPool();

        // Stock KPI + low-stock count (single scan)
        const stockRes = await pool.request().query(`
            SELECT COUNT(*) AS itemCount,
                   ISNULL(SUM(StockValue), 0) AS stockValue,
                   SUM(CASE WHEN ReorderLevel IS NOT NULL AND StockQty <= ReorderLevel THEN 1 ELSE 0 END) AS lowStockCount
            FROM paint_Item WHERE IsActive=1`);

        // Draft counts (things sitting open in each subsystem)
        const draftsRes = await pool.request().query(`
            SELECT (SELECT COUNT(*) FROM paint_GRN  WHERE Status='Draft') AS draftGRNs,
                   (SELECT COUNT(*) FROM paint_GRTN WHERE Status='Draft') AS draftGRTNs,
                   (SELECT COUNT(*) FROM paint_Issue WHERE Locked=0)     AS openIssues`);

        // This-month rollups
        const monthRes = await pool.request().query(`
            DECLARE @from DATE = DATEADD(day, 1, EOMONTH(GETDATE(), -1));
            SELECT
                (SELECT ISNULL(SUM(GrandTotal), 0) FROM paint_GRN
                    WHERE Status='Posted' AND GRNDate >= @from)  AS monthPurchase,
                (SELECT ISNULL(SUM(GrandTotal), 0) FROM paint_GRTN
                    WHERE Status='Posted' AND GRTNDate >= @from) AS monthReturns,
                (SELECT ISNULL(SUM(TotalCost), 0) FROM paint_Issue
                    WHERE IssueDate >= @from)                    AS monthConsumption`);

        // Recent issues — 5 most recent Paint Issues
        const recentRes = await pool.request().query(`
            SELECT TOP 5 pi.PaintIssueID, pi.IssueNo, pi.IssueDate, pi.TotalCost, pi.Locked,
                         jc.JobCardNo, jc.VehicleRegNo
            FROM paint_Issue pi
            INNER JOIN Addata_JobCardInfo jc ON pi.JobCardID = jc.JobCardId
            ORDER BY pi.PaintIssueID DESC`);

        // Top 5 low-stock items
        const lowStockList = await pool.request().query(`
            SELECT TOP 5 PaintItemID, PaintCode, PaintName, ReorderLevel, StockQty,
                         (ReorderLevel - StockQty) AS ShortBy
            FROM paint_Item
            WHERE IsActive=1 AND ReorderLevel IS NOT NULL AND StockQty <= ReorderLevel
            ORDER BY (ReorderLevel - StockQty) DESC`);

        res.json({
            stock:   stockRes.recordset[0],
            drafts:  draftsRes.recordset[0],
            month:   monthRes.recordset[0],
            recent:  recentRes.recordset,
            lowStock: lowStockList.recordset,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
