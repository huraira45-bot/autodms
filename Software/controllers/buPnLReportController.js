/**
 * Business-Unit P&L report.
 *
 * For each Job-Card business unit (GR / WR / B&P / PPM / SFS / FFS / CT / PDS),
 * shows revenue (labour + parts) and direct expenses (cost of spares, paint,
 * sublet) across finalized JCs in the period, split by Cash (walk-in) vs
 * Credit (named party OR JC type has its own receivable GL).
 *
 * Owner ask 2026-07-22.
 *
 * Dates
 *   All amounts are dated by the JC finalize voucher (data_FinanceVoucherInfo
 *   with SourceDocType IN ('JC','JOBCARD'), Status='Posted', not reversed).
 *   This aligns with the GL 401xxx revenue movement in the same period.
 *
 * Classification
 *   Cash   → JC has no PartyID AND the JC type has no ReceivableAccount set
 *   Credit → JC has a PartyID OR the JC type has a ReceivableAccount set
 *
 * Cost sources (all captured at issue time, no post-hoc re-cost)
 *   Cost of Spares  = SUM(IssueQuantity × ISNULL(UnitLandedCost, 0))
 *                     from data_StockIssuetoJobCardDetail
 *   Cost of Paint   = SUM(paint_IssueDetail.LineTotal)
 *                     via paint_Issue.JobCardID
 *   Sublet Cost     = SUM(Addata_JobCardInfoSubletJobDetail.InvoiceAmount)
 *
 * Revenue sources
 *   Labour Revenue = SUM(Price × Quantity − DiscAmt)
 *                    from Addata_JobCardInfoDetail
 *   Parts Revenue  = SUM(IssueQuantity × ItemRate)
 *                    from data_StockIssuetoJobCardDetail
 */
const { sql, getPool } = require('../config/db');

exports.getBuPnL = async (req, res) => {
    try {
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const from = req.query.from ? new Date(req.query.from) : firstOfMonth;
        const to   = req.query.to   ? new Date(req.query.to)   : today;
        to.setHours(23, 59, 59, 999);

        const mode = (req.query.mode || '').toUpperCase();
        const businessType = req.query.businessType ? parseInt(req.query.businessType) : null;

        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);

        const jcWhere = ['j.IsFinalized = 1'];
        if (businessType) { rq.input('bt', sql.Int, businessType); jcWhere.push('j.JobTypeId = @bt'); }
        if (mode === 'CASH')   jcWhere.push('j.PartyID IS NULL AND t.ReceivableAccount IS NULL');
        if (mode === 'CREDIT') jcWhere.push('(j.PartyID IS NOT NULL OR t.ReceivableAccount IS NOT NULL)');

        const jcQuery = `
            SELECT t.JobCardTypeId, t.CardCode, t.Title,
                   CASE
                       WHEN j.PartyID IS NOT NULL           THEN 'CREDIT'
                       WHEN t.ReceivableAccount IS NOT NULL THEN 'CREDIT'
                       ELSE 'CASH'
                   END AS Mode,
                   -- one-JC aggregates
                   ISNULL((SELECT SUM(ISNULL(d.Price,0) * ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0))
                           FROM   Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId), 0) AS LabourRevenue,
                   ISNULL((SELECT SUM(ISNULL(s.IssueQuantity,0) * ISNULL(s.ItemRate,0))
                           FROM   data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0) AS PartsRevenue,
                   ISNULL((SELECT SUM(ISNULL(s.IssueQuantity,0) * ISNULL(s.UnitLandedCost,0))
                           FROM   data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0) AS PartsCost,
                   ISNULL((SELECT SUM(ISNULL(pd.LineTotal,0))
                           FROM   paint_Issue pi
                           JOIN   paint_IssueDetail pd ON pd.PaintIssueID = pi.PaintIssueID
                           WHERE  pi.JobCardID = j.JobCardId), 0) AS PaintCost,
                   ISNULL((SELECT SUM(ISNULL(b.InvoiceAmount,0))
                           FROM   Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId), 0) AS SubletCost
            FROM   Addata_JobCardInfo j
            JOIN   gen_JobCardType t ON t.JobCardTypeId = j.JobTypeId
            CROSS  APPLY (
                SELECT TOP 1 fv.VoucherDate
                FROM   data_FinanceVoucherInfo fv
                WHERE  fv.SourceDocType IN ('JC','JOBCARD')
                  AND  fv.SourceDocID   = j.JobCardId
                  AND  fv.Status = 'Posted'
                  AND  fv.ReversesVoucherID IS NULL
                ORDER  BY fv.VoucherID
            ) jcv
            WHERE  jcv.VoucherDate BETWEEN @from AND @to
              AND  ${jcWhere.join(' AND ')}`;

        const jcRes = await rq.query(jcQuery);

        // Pivot: group by BU, then by Mode (Cash / Credit). Compute a Total
        // per BU on top so the frontend gets three columns per metric.
        const buMap = new Map();
        const zeroCell = () => ({
            Cards: 0, LabourRevenue: 0, PartsRevenue: 0,
            PartsCost: 0, PaintCost: 0, SubletCost: 0,
        });
        for (const row of jcRes.recordset) {
            const key = row.CardCode || '—';
            let b = buMap.get(key);
            if (!b) {
                b = {
                    Code: row.CardCode || '—',
                    Name: row.Title || '',
                    JobCardTypeId: row.JobCardTypeId,
                    CASH: zeroCell(), CREDIT: zeroCell(),
                };
                buMap.set(key, b);
            }
            const cell = b[row.Mode];
            cell.Cards         += 1;
            cell.LabourRevenue += Number(row.LabourRevenue) || 0;
            cell.PartsRevenue  += Number(row.PartsRevenue)  || 0;
            cell.PartsCost     += Number(row.PartsCost)     || 0;
            cell.PaintCost     += Number(row.PaintCost)     || 0;
            cell.SubletCost    += Number(row.SubletCost)    || 0;
        }

        const finalizeCell = (c) => {
            const revenue = c.LabourRevenue + c.PartsRevenue;
            const cost    = c.PartsCost + c.PaintCost + c.SubletCost;
            const margin  = revenue - cost;
            return {
                Cards:         c.Cards,
                LabourRevenue: +c.LabourRevenue.toFixed(2),
                PartsRevenue:  +c.PartsRevenue.toFixed(2),
                Revenue:       +revenue.toFixed(2),
                PartsCost:     +c.PartsCost.toFixed(2),
                PaintCost:     +c.PaintCost.toFixed(2),
                SubletCost:    +c.SubletCost.toFixed(2),
                Cost:          +cost.toFixed(2),
                Margin:        +margin.toFixed(2),
                MarginPct:     revenue > 0 ? +((margin / revenue) * 100).toFixed(2) : 0,
            };
        };
        const combineCells = (a, b) => ({
            Cards:         a.Cards + b.Cards,
            LabourRevenue: a.LabourRevenue + b.LabourRevenue,
            PartsRevenue:  a.PartsRevenue  + b.PartsRevenue,
            PartsCost:     a.PartsCost     + b.PartsCost,
            PaintCost:     a.PaintCost     + b.PaintCost,
            SubletCost:    a.SubletCost    + b.SubletCost,
        });

        const rows = Array.from(buMap.values())
            .map(b => ({
                Code:  b.Code,
                Name:  b.Name,
                JobCardTypeId: b.JobCardTypeId,
                Cash:   finalizeCell(b.CASH),
                Credit: finalizeCell(b.CREDIT),
                Total:  finalizeCell(combineCells(b.CASH, b.CREDIT)),
            }))
            .sort((a, b) => b.Total.Revenue - a.Total.Revenue);

        // Grand totals across all BUs
        const grandCash   = zeroCell();
        const grandCredit = zeroCell();
        for (const b of buMap.values()) {
            Object.assign(grandCash,   combineCells(grandCash,   b.CASH));
            Object.assign(grandCredit, combineCells(grandCredit, b.CREDIT));
        }
        const totals = {
            Cash:   finalizeCell(grandCash),
            Credit: finalizeCell(grandCredit),
            Total:  finalizeCell(combineCells(grandCash, grandCredit)),
        };

        res.json({
            from: from.toISOString().slice(0, 10),
            to:   to.toISOString().slice(0, 10),
            rows,
            totals,
        });
    } catch (err) {
        console.error('getBuPnL:', err);
        res.status(500).json({ error: err.message });
    }
};
