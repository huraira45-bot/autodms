/**
 * Store Sale P&L report.
 *
 * Per finalized Store Sale invoice in the period, aggregated:
 *   Revenue    = SUM(Quantity × SaleRate − DiscountAmount) — matches GL 401003001 Cr
 *   Cost       = SUM(Quantity × UnitLandedCost)            — matches GL 5011 COGS Dr
 *   Margin     = Revenue − Cost
 *
 * Cash = Party-less walk-in (PartyID IS NULL).
 * Credit = Named party (rolled up by PartyID so the report shows which
 *          corporate accounts drove the credit sales and their margin).
 *
 * All amounts anchor to the finalize voucher date (SourceDocType='STORE_SALE')
 * so numbers reconcile against the ledger for the same period.
 *
 * Owner ask 2026-07-22.
 */
const { sql, getPool } = require('../config/db');

exports.getStoreSalePnL = async (req, res) => {
    try {
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const from = req.query.from ? new Date(req.query.from) : firstOfMonth;
        const to   = req.query.to   ? new Date(req.query.to)   : today;
        to.setHours(23, 59, 59, 999);

        const mode = (req.query.mode || '').toUpperCase();
        const partyId = req.query.partyId ? parseInt(req.query.partyId) : null;

        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);

        const where = ['si.IsFinalized = 1'];
        if (mode === 'CASH')   where.push('si.PartyID IS NULL');
        if (mode === 'CREDIT') where.push('si.PartyID IS NOT NULL');
        if (partyId) { rq.input('pid', sql.Int, partyId); where.push('si.PartyID = @pid'); }

        // One row per SaleDetail line — revenue, cost, party. The finalize
        // voucher's VoucherDate is the date anchor so this ties to the
        // 401003001 GL movement in the same period.
        const r = await rq.query(`
            SELECT si.SaleID,
                   si.InvoiceNo,
                   ssv.VoucherDate       AS DocDate,
                   si.CustomerName,
                   si.PartyID,
                   p.PartyName,
                   CASE WHEN si.PartyID IS NULL THEN 'CASH' ELSE 'CREDIT' END AS Mode,
                   sd.SaleDetailID,
                   sd.ItemID,
                   ii.ItenName AS ItemName,
                   COALESCE(ii.ManualNumber, CAST(ii.ItemNumber AS NVARCHAR(50))) AS ItemCode,
                   sd.Quantity,
                   sd.SaleRate,
                   ISNULL(sd.DiscountAmount, 0) AS DiscountAmount,
                   ISNULL(sd.TaxAmount, 0)      AS TaxAmount,
                   ISNULL(sd.UnitLandedCost, 0) AS UnitLandedCost,
                   (sd.Quantity * sd.SaleRate)                                AS LineRevenue,
                   ISNULL(sd.DiscountAmount, 0)                               AS LineDiscount,
                   (sd.Quantity * ISNULL(sd.UnitLandedCost, 0))               AS LineCost
            FROM   data_StoreSaleInfo si
            JOIN   data_StoreSaleDetail sd ON sd.SaleID = si.SaleID
            JOIN   InventItems ii ON ii.ItemId = sd.ItemID
            LEFT   JOIN gen_PartiesInfo p ON p.PartyID = si.PartyID
            CROSS  APPLY (
                SELECT TOP 1 fv.VoucherDate
                FROM   data_FinanceVoucherInfo fv
                WHERE  fv.SourceDocType IN ('STORE_SALE','SI','SS')
                  AND  fv.SourceDocID   = si.SaleID
                  AND  fv.Status = 'Posted'
                  AND  fv.ReversesVoucherID IS NULL
                ORDER  BY fv.VoucherID
            ) ssv
            WHERE  ssv.VoucherDate BETWEEN @from AND @to
              AND  ${where.join(' AND ')}
            ORDER  BY ssv.VoucherDate DESC, si.SaleID DESC, sd.SaleDetailID
        `);
        const raw = r.recordset;

        // ── Invoice-level rollup (used for the detail table) ──────────
        const invMap = new Map();
        for (const line of raw) {
            const key = line.SaleID;
            let inv = invMap.get(key);
            if (!inv) {
                inv = {
                    SaleID:      line.SaleID,
                    InvoiceNo:   line.InvoiceNo,
                    DocDate:     line.DocDate?.toISOString().slice(0, 10),
                    PartyID:     line.PartyID,
                    PartyName:   line.PartyName,
                    Customer:    line.CustomerName || line.PartyName || 'Walk-in',
                    Mode:        line.Mode,
                    Lines:       0,
                    Revenue:     0,
                    Discount:    0,
                    Cost:        0,
                };
                invMap.set(key, inv);
            }
            inv.Lines    += 1;
            inv.Revenue  += Number(line.LineRevenue)  || 0;
            inv.Discount += Number(line.LineDiscount) || 0;
            inv.Cost     += Number(line.LineCost)     || 0;
        }
        const invoices = Array.from(invMap.values())
            .map(inv => {
                // Margin = Gross Revenue - Discount given - Cost of goods.
                // Revenue itself stays gross so it ties to 401003001 Cr
                // (which is also gross of discount).
                const netRevenue = inv.Revenue - inv.Discount;
                const margin = netRevenue - inv.Cost;
                return {
                    ...inv,
                    Revenue:    +inv.Revenue.toFixed(2),
                    Discount:   +inv.Discount.toFixed(2),
                    NetRevenue: +netRevenue.toFixed(2),
                    Cost:       +inv.Cost.toFixed(2),
                    Margin:     +margin.toFixed(2),
                    MarginPct:  inv.Revenue > 0 ? +((margin / inv.Revenue) * 100).toFixed(2) : 0,
                };
            });

        // ── Per-Party rollup (Cash bucket is a single Walk-in row) ────
        const partyMap = new Map();
        const bumpKey = (key, label, mode, inv) => {
            let b = partyMap.get(key);
            if (!b) {
                b = {
                    Key: key,
                    Label: label,
                    Mode: mode,
                    Invoices: 0,
                    Lines:    0,
                    Revenue:  0,
                    Discount: 0,
                    Cost:     0,
                };
                partyMap.set(key, b);
            }
            b.Invoices += 1;
            b.Lines    += inv.Lines;
            b.Revenue  += inv.Revenue;
            b.Discount += inv.Discount;
            b.Cost     += inv.Cost;
        };
        for (const inv of invoices) {
            if (inv.Mode === 'CASH') {
                bumpKey('WALKIN', 'Walk-in customers', 'CASH', inv);
            } else {
                const key = inv.PartyID ? `P-${inv.PartyID}` : 'UNKNOWN';
                const label = inv.PartyName || inv.Customer || 'Unknown party';
                bumpKey(key, label, 'CREDIT', inv);
            }
        }
        const byParty = Array.from(partyMap.values())
            .map(b => {
                const netRevenue = b.Revenue - b.Discount;
                const margin = netRevenue - b.Cost;
                return {
                    Key:        b.Key,
                    Label:      b.Label,
                    Mode:       b.Mode,
                    Invoices:   b.Invoices,
                    Lines:      b.Lines,
                    Revenue:    +b.Revenue.toFixed(2),
                    Discount:   +b.Discount.toFixed(2),
                    NetRevenue: +netRevenue.toFixed(2),
                    Cost:       +b.Cost.toFixed(2),
                    Margin:     +margin.toFixed(2),
                    MarginPct:  b.Revenue > 0 ? +((margin / b.Revenue) * 100).toFixed(2) : 0,
                };
            })
            .sort((a, b) => b.Revenue - a.Revenue);

        // ── Grand totals split by mode ────────────────────────────────
        const modeAgg = (m) => {
            const filtered = invoices.filter(x => x.Mode === m);
            const rev  = filtered.reduce((s, x) => s + x.Revenue, 0);
            const disc = filtered.reduce((s, x) => s + x.Discount, 0);
            const cost = filtered.reduce((s, x) => s + x.Cost, 0);
            const netRev = rev - disc;
            const margin = netRev - cost;
            return {
                Invoices:   filtered.length,
                Revenue:    +rev.toFixed(2),
                Discount:   +disc.toFixed(2),
                NetRevenue: +netRev.toFixed(2),
                Cost:       +cost.toFixed(2),
                Margin:     +margin.toFixed(2),
                MarginPct:  rev > 0 ? +((margin / rev) * 100).toFixed(2) : 0,
            };
        };
        const totals = {
            Cash:   modeAgg('CASH'),
            Credit: modeAgg('CREDIT'),
            Total: (() => {
                const cash = modeAgg('CASH'), credit = modeAgg('CREDIT');
                const rev  = cash.Revenue  + credit.Revenue;
                const disc = cash.Discount + credit.Discount;
                const cost = cash.Cost     + credit.Cost;
                const netRev = rev - disc;
                const margin = netRev - cost;
                return {
                    Invoices:   cash.Invoices + credit.Invoices,
                    Revenue:    +rev.toFixed(2),
                    Discount:   +disc.toFixed(2),
                    NetRevenue: +netRev.toFixed(2),
                    Cost:       +cost.toFixed(2),
                    Margin:     +margin.toFixed(2),
                    MarginPct:  rev > 0 ? +((margin / rev) * 100).toFixed(2) : 0,
                };
            })(),
        };

        res.json({
            from: from.toISOString().slice(0, 10),
            to:   to.toISOString().slice(0, 10),
            byParty,
            invoices,
            totals,
        });
    } catch (err) {
        console.error('getStoreSalePnL:', err);
        res.status(500).json({ error: err.message });
    }
};
