/**
 * Reports controller — read-only financial / operational reports.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.16.
 *
 * Conventions:
 *   - All reports query only Posted vouchers (Status='Posted'), never Drafts or Reversed.
 *   - Balances follow GL nature: Debit accounts (Assets, Expenses) → Debit − Credit;
 *     Credit accounts (Liabilities, Equity, Revenue) → Credit − Debit.
 *   - "As of <date>" reports include vouchers up to AND including the end date (23:59:59).
 *   - Period reports use inclusive bounds (>= from, <= to 23:59:59).
 */
const { getPool, sql } = require('../config/db');
const { resolveRole } = require('./systemAccountsController');

// Inclusive end-of-day for "asOf" / "to" filters
function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

/**
 * GET /reports/trial-balance?asOf=YYYY-MM-DD
 *
 * Returns one row per leaf account with non-zero balance.
 * Each row carries GLCode/GLTitle so the UI can group by parent prefix client-side.
 */
exports.getTrialBalance = async (req, res) => {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);

        const pool = await getPool();
        // Pull all leaf accounts + their net debit/credit from posted-only details.
        // Nature: 1 = Debit-natured, 2 = Credit-natured.
        const result = await pool.request()
            .input('asOf', sql.DateTime, asOf)
            .query(`
                WITH bal AS (
                    SELECT d.GLCAID,
                           SUM(ISNULL(d.Debit, 0))  AS TotalDr,
                           SUM(ISNULL(d.Credit, 0)) AS TotalCr
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                    WHERE v.Status = 'Posted' AND v.VoucherDate <= @asOf
                    GROUP BY d.GLCAID
                )
                SELECT c.GLCAID, c.GLCode, c.GLTitle, c.GLLevel,
                       CASE c.GLNature WHEN 1 THEN 'Debit' ELSE 'Credit' END AS Nature,
                       ISNULL(b.TotalDr, 0) AS TotalDebit,
                       ISNULL(b.TotalCr, 0) AS TotalCredit,
                       ISNULL(b.TotalDr, 0) - ISNULL(b.TotalCr, 0) AS NetDebit,
                       CASE c.GLNature
                            WHEN 1 THEN ISNULL(b.TotalDr, 0) - ISNULL(b.TotalCr, 0)
                            ELSE         ISNULL(b.TotalCr, 0) - ISNULL(b.TotalDr, 0)
                       END AS Balance,
                       LEFT(c.GLCode, 1) AS ClassRoot
                FROM GLChartOFAccount c
                LEFT JOIN bal b ON c.GLCAID = b.GLCAID
                WHERE c.Status = 1 AND c.isParent = 0
                  AND ISNULL(b.TotalDr, 0) + ISNULL(b.TotalCr, 0) > 0
                ORDER BY c.GLCode
            `);

        // Totals: TB must balance. Sum all debits and credits across leaves.
        const totalDr = result.recordset.reduce((s, r) => s + Number(r.TotalDebit), 0);
        const totalCr = result.recordset.reduce((s, r) => s + Number(r.TotalCredit), 0);

        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            rows: result.recordset,
            totals: {
                debit:  totalDr,
                credit: totalCr,
                diff:   +(totalDr - totalCr).toFixed(2)
            }
        });
    } catch (err) {
        console.error('Trial Balance error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/gl-detail?glcaid=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * One row per voucher-detail line on the chosen account, oldest first, with a
 * running balance. Opening balance = net (Dr − Cr) on all posted lines BEFORE
 * `from`. Closing balance = opening + period movement.
 */
exports.getGLDetail = async (req, res) => {
    try {
        const glcaid = parseInt(req.query.glcaid);
        if (!glcaid) return res.status(400).json({ error: 'glcaid is required.' });

        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0, 0, 0, 0);
        const to   = endOfDay(toRaw);

        const pool = await getPool();

        // Look up the account header (so the UI knows nature / title).
        const acctRes = await pool.request()
            .input('id', sql.Int, glcaid)
            .query(`SELECT GLCAID, GLCode, GLTitle,
                           CASE GLNature WHEN 1 THEN 'Debit' ELSE 'Credit' END AS Nature
                    FROM GLChartOFAccount WHERE GLCAID = @id`);
        if (!acctRes.recordset.length) return res.status(404).json({ error: 'Account not found.' });
        const account = acctRes.recordset[0];

        // Opening balance: net (Dr − Cr) BEFORE the from-date.
        const openRes = await pool.request()
            .input('id', sql.Int, glcaid)
            .input('from', sql.DateTime, from)
            .query(`
                SELECT ISNULL(SUM(d.Debit), 0) - ISNULL(SUM(d.Credit), 0) AS OpeningNetDr
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                WHERE d.GLCAID = @id AND v.Status = 'Posted' AND v.VoucherDate < @from
            `);
        const openingNetDr = Number(openRes.recordset[0].OpeningNetDr) || 0;

        // Period lines, oldest first.
        const linesRes = await pool.request()
            .input('id', sql.Int, glcaid)
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.Remarks AS VoucherRemarks, v.SourceDocType, v.SourceDocID,
                       d.Narration, ISNULL(d.Debit, 0) AS Debit, ISNULL(d.Credit, 0) AS Credit,
                       d.PartyID, p.PartyName, d.JobCardID, j.JobCardNo
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                LEFT JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                LEFT JOIN gen_PartiesInfo p ON d.PartyID = p.PartyID
                LEFT JOIN Addata_JobCardInfo j ON d.JobCardID = j.JobCardId
                WHERE d.GLCAID = @id AND v.Status = 'Posted'
                  AND v.VoucherDate BETWEEN @from AND @to
                ORDER BY v.VoucherDate, v.VoucherID, d.VoucherDetailID
            `);

        // Build running balance (in Debit-positive terms; UI flips for Credit nature).
        let running = openingNetDr;
        const lines = linesRes.recordset.map(l => {
            running += Number(l.Debit) - Number(l.Credit);
            return { ...l, RunningNetDr: +running.toFixed(2) };
        });

        const periodDr = lines.reduce((s, l) => s + Number(l.Debit),  0);
        const periodCr = lines.reduce((s, l) => s + Number(l.Credit), 0);
        const closingNetDr = openingNetDr + periodDr - periodCr;

        // Display balance per nature
        const sign = account.Nature === 'Debit' ? 1 : -1;
        const fmt = (x) => +(x * sign).toFixed(2);

        res.json({
            account,
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            openingBalance: fmt(openingNetDr),
            closingBalance: fmt(closingNetDr),
            totals: { debit: periodDr, credit: periodCr },
            lines
        });
    } catch (err) {
        console.error('GL Detail error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/party-statement?partyId=&from=&to=&type=customer|supplier
 *
 * One row per ledger line from dms_PartyLedger for the chosen party in the period.
 * Customer view: balance grows on debit (we owe / they owe us).
 * Supplier view: balance grows on credit (we owe them).
 */
async function getPartyStatement(req, res, isSupplier) {
    try {
        const partyId = parseInt(req.query.partyId);
        if (!partyId) return res.status(400).json({ error: 'partyId is required.' });

        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0, 0, 0, 0);
        const to   = endOfDay(toRaw);

        const pool = await getPool();

        const partyRes = await pool.request()
            .input('id', sql.Int, partyId)
            .query(`SELECT PartyID, PartyName, PhoneOne, CNIC FROM gen_PartiesInfo WHERE PartyID=@id`);
        if (!partyRes.recordset.length) return res.status(404).json({ error: 'Party not found.' });
        const party = partyRes.recordset[0];

        // Opening: net (Dr−Cr) before from-date.
        const openRes = await pool.request()
            .input('pid', sql.Int, partyId)
            .input('from', sql.DateTime, from)
            .query(`
                SELECT ISNULL(SUM(l.Debit),0) - ISNULL(SUM(l.Credit),0) AS OpeningNetDr
                FROM dms_PartyLedger l
                INNER JOIN data_FinanceVoucherInfo v ON l.VoucherID = v.VoucherID
                WHERE l.PartyID = @pid AND v.Status='Posted' AND v.VoucherDate < @from
            `);
        const openingNetDr = Number(openRes.recordset[0].OpeningNetDr) || 0;

        const linesRes = await pool.request()
            .input('pid', sql.Int, partyId)
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.SourceDocType, v.SourceDocID,
                       l.Narration, ISNULL(l.Debit,0) AS Debit, ISNULL(l.Credit,0) AS Credit,
                       l.JobCardID, j.JobCardNo,
                       c.GLCode, c.GLTitle
                FROM dms_PartyLedger l
                INNER JOIN data_FinanceVoucherInfo v ON l.VoucherID = v.VoucherID
                LEFT JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                LEFT JOIN Addata_JobCardInfo j ON l.JobCardID = j.JobCardId
                LEFT JOIN GLChartOFAccount c ON l.GLCAID = c.GLCAID
                WHERE l.PartyID = @pid AND v.Status='Posted'
                  AND v.VoucherDate BETWEEN @from AND @to
                ORDER BY v.VoucherDate, v.VoucherID, l.LedgerID
            `);

        // For supplier, flip sign so increases (we owe more) show as positive.
        const sign = isSupplier ? -1 : 1;
        let running = openingNetDr;
        const lines = linesRes.recordset.map(l => {
            running += Number(l.Debit) - Number(l.Credit);
            return { ...l, RunningBalance: +(running * sign).toFixed(2) };
        });

        const periodDr = lines.reduce((s, l) => s + Number(l.Debit), 0);
        const periodCr = lines.reduce((s, l) => s + Number(l.Credit), 0);

        res.json({
            party,
            type: isSupplier ? 'supplier' : 'customer',
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            openingBalance: +(openingNetDr * sign).toFixed(2),
            closingBalance: +((openingNetDr + periodDr - periodCr) * sign).toFixed(2),
            totals: { debit: periodDr, credit: periodCr },
            lines
        });
    } catch (err) {
        console.error('Party statement error:', err);
        res.status(500).json({ error: err.message });
    }
}

exports.getCustomerStatement = (req, res) => getPartyStatement(req, res, false);
exports.getSupplierStatement = (req, res) => getPartyStatement(req, res, true);

/**
 * GET /reports/parties?type=customer|supplier&search=
 *
 * Helper for the statement screens — returns parties who have any movement on the
 * relevant control account in the last 24 months, plus any name match.
 */
exports.searchParties = async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const pool = await getPool();
        const r = await pool.request()
            .input('q', sql.NVarChar(200), `%${search}%`)
            .query(`
                SELECT TOP 50 PartyID, PartyName, PhoneOne, CNIC
                FROM gen_PartiesInfo
                WHERE (@q='%%' OR PartyName LIKE @q OR CNIC LIKE @q OR PhoneOne LIKE @q)
                ORDER BY PartyName
            `);
        res.json(r.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/daily-cash-book?date=YYYY-MM-DD
 *
 * All Cash Book movements for a single day, with running balance and totals.
 * Cash Book is resolved from system role CASH_BOOK.
 */
exports.getDailyCashBook = async (req, res) => {
    try {
        const dateRaw = req.query.date ? new Date(req.query.date) : new Date();
        const dayStart = new Date(dateRaw); dayStart.setHours(0,0,0,0);
        const dayEnd = endOfDay(dateRaw);

        const cashGLCAID = await resolveRole('CASH_BOOK');
        const pool = await getPool();

        // Opening cash balance: net debit before day start
        const openRes = await pool.request()
            .input('id', sql.Int, cashGLCAID)
            .input('from', sql.DateTime, dayStart)
            .query(`
                SELECT ISNULL(SUM(d.Debit),0) - ISNULL(SUM(d.Credit),0) AS OpeningNetDr
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                WHERE d.GLCAID=@id AND v.Status='Posted' AND v.VoucherDate < @from
            `);
        const opening = Number(openRes.recordset[0].OpeningNetDr) || 0;

        const linesRes = await pool.request()
            .input('id', sql.Int, cashGLCAID)
            .input('from', sql.DateTime, dayStart)
            .input('to',   sql.DateTime, dayEnd)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.SourceDocType, v.SourceDocID, v.Remarks AS VoucherRemarks,
                       d.Narration, ISNULL(d.Debit,0) AS Debit, ISNULL(d.Credit,0) AS Credit,
                       d.PartyID, p.PartyName, d.JobCardID, j.JobCardNo
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                LEFT JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                LEFT JOIN gen_PartiesInfo p ON d.PartyID = p.PartyID
                LEFT JOIN Addata_JobCardInfo j ON d.JobCardID = j.JobCardId
                WHERE d.GLCAID=@id AND v.Status='Posted'
                  AND v.VoucherDate BETWEEN @from AND @to
                ORDER BY v.VoucherDate, v.VoucherID, d.VoucherDetailID
            `);

        let running = opening;
        const lines = linesRes.recordset.map(l => {
            running += Number(l.Debit) - Number(l.Credit);
            return { ...l, RunningBalance: +running.toFixed(2) };
        });

        const totalIn  = lines.reduce((s, l) => s + Number(l.Debit), 0);   // cash in = Dr to Cash Book
        const totalOut = lines.reduce((s, l) => s + Number(l.Credit), 0);  // cash out = Cr to Cash Book

        res.json({
            date: dateRaw.toISOString().slice(0, 10),
            cashAccount: { GLCAID: cashGLCAID },
            opening:  +opening.toFixed(2),
            totalIn:  +totalIn.toFixed(2),
            totalOut: +totalOut.toFixed(2),
            closing:  +(opening + totalIn - totalOut).toFixed(2),
            lines
        });
    } catch (err) {
        console.error('Daily Cash Book error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Helper — returns per-class balances for posted vouchers up to a given date.
 * Used by P&L and Balance Sheet. Result keyed by class root (1..5).
 *
 * Each entry includes leaf rows so the UI can render expandable detail.
 */
async function getClassBalances(pool, asOf, classes) {
    const r = await pool.request()
        .input('asOf', sql.DateTime, asOf)
        .query(`
            WITH bal AS (
                SELECT d.GLCAID,
                       SUM(ISNULL(d.Debit,0))  AS TotalDr,
                       SUM(ISNULL(d.Credit,0)) AS TotalCr
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                WHERE v.Status='Posted' AND v.VoucherDate <= @asOf
                GROUP BY d.GLCAID
            )
            SELECT c.GLCAID, c.GLCode, c.GLTitle, c.GLLevel,
                   CASE c.GLNature WHEN 1 THEN 'Debit' ELSE 'Credit' END AS Nature,
                   LEFT(c.GLCode, 1) AS ClassRoot,
                   ISNULL(b.TotalDr,0) AS TotalDr,
                   ISNULL(b.TotalCr,0) AS TotalCr,
                   CASE c.GLNature
                        WHEN 1 THEN ISNULL(b.TotalDr,0) - ISNULL(b.TotalCr,0)
                        ELSE         ISNULL(b.TotalCr,0) - ISNULL(b.TotalDr,0)
                   END AS Balance
            FROM GLChartOFAccount c
            LEFT JOIN bal b ON c.GLCAID = b.GLCAID
            WHERE c.Status=1 AND c.isParent=0
              AND LEFT(c.GLCode,1) IN (${classes.map((_,i)=>`'${classes[i]}'`).join(',')})
              AND ISNULL(b.TotalDr,0) + ISNULL(b.TotalCr,0) > 0
            ORDER BY c.GLCode
        `);
    // Class-level totals use the CLASS direction (Assets/Expense are Dr; Liab/
    // Equity/Revenue are Cr), not each account's individual GLNature. This way
    // contra accounts — e.g. drawings under equity flagged as Dr-natured —
    // reduce the class total instead of inflating it, and the balance sheet
    // ties back to the trial balance even when accounts are misclassified.
    const isDrClass = (cls) => cls === '1' || cls === '5';
    const grouped = {};
    for (const row of r.recordset) {
        const cls = row.ClassRoot;
        if (!grouped[cls]) grouped[cls] = { rows: [], total: 0 };
        grouped[cls].rows.push(row);
        const dr = Number(row.TotalDr) || 0;
        const cr = Number(row.TotalCr) || 0;
        grouped[cls].total += isDrClass(cls) ? (dr - cr) : (cr - dr);
    }
    return grouped;
}

/**
 * GET /reports/pnl?from=&to=
 * Profit & Loss for a period — Revenue (class 4) − Expenses (class 5) = Net Profit.
 */
exports.getPnL = async (req, res) => {
    try {
        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0,0,0,0);
        const to   = endOfDay(toRaw);

        const pool = await getPool();
        // P&L = period activity only — so we compute (balance at TO) − (balance at FROM-1day).
        const fromMinus = new Date(from); fromMinus.setSeconds(fromMinus.getSeconds() - 1);

        const atTo   = await getClassBalances(pool, to, ['4','5']);
        const atFrom = await getClassBalances(pool, fromMinus, ['4','5']);

        const buildSection = (cls) => {
            const t = atTo[cls]?.rows || [];
            const f = atFrom[cls]?.rows || [];
            const map = new Map();
            for (const r of f) map.set(r.GLCAID, Number(r.Balance));
            const rows = t.map(r => {
                const prior = map.get(r.GLCAID) || 0;
                return { ...r, PeriodAmount: +(Number(r.Balance) - prior).toFixed(2) };
            }).filter(r => Math.abs(r.PeriodAmount) > 0.005);
            // Include accounts that had activity but went to zero
            for (const r of f) {
                if (!t.find(x => x.GLCAID === r.GLCAID)) {
                    rows.push({ ...r, PeriodAmount: -Number(r.Balance) });
                }
            }
            const total = rows.reduce((s, r) => s + r.PeriodAmount, 0);
            return { rows, total: +total.toFixed(2) };
        };

        const revenue  = buildSection('4');
        const expenses = buildSection('5');
        const netProfit = +(revenue.total - expenses.total).toFixed(2);

        res.json({
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            revenue, expenses, netProfit
        });
    } catch (err) {
        console.error('P&L error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/balance-sheet?asOf=
 * Assets (1) = Liabilities (2) + Equity (3) + Retained Earnings (Revenue − Expenses up to date).
 */
exports.getBalanceSheet = async (req, res) => {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);

        const pool = await getPool();
        const balances = await getClassBalances(pool, asOf, ['1','2','3','4','5']);

        const assets      = balances['1'] || { rows: [], total: 0 };
        const liabilities = balances['2'] || { rows: [], total: 0 };
        const equity      = balances['3'] || { rows: [], total: 0 };
        const revenue     = balances['4'] || { rows: [], total: 0 };
        const expenses    = balances['5'] || { rows: [], total: 0 };

        const retained = +(revenue.total - expenses.total).toFixed(2);
        const liabilitiesAndEquity = +(liabilities.total + equity.total + retained).toFixed(2);
        const diff = +(assets.total - liabilitiesAndEquity).toFixed(2);

        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            assets:      { rows: assets.rows,      total: +assets.total.toFixed(2) },
            liabilities: { rows: liabilities.rows, total: +liabilities.total.toFixed(2) },
            equity:      { rows: equity.rows,      total: +equity.total.toFixed(2) },
            retainedEarnings: retained,
            liabilitiesAndEquity,
            diff
        });
    } catch (err) {
        console.error('Balance Sheet error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/day-book?date=YYYY-MM-DD
 * All posted vouchers (any type) on a given day, with detail count and total.
 */
exports.getDayBook = async (req, res) => {
    try {
        const dateRaw = req.query.date ? new Date(req.query.date) : new Date();
        const dayStart = new Date(dateRaw); dayStart.setHours(0,0,0,0);
        const dayEnd = endOfDay(dateRaw);

        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, dayStart)
            .input('to',   sql.DateTime, dayEnd)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.Remarks, v.TotalAmount, v.SourceDocType, v.SourceDocID,
                       v.CreatedByName, v.PostedAt,
                       (SELECT COUNT(*) FROM data_FinanceVoucherDetail d WHERE d.VoucherID = v.VoucherID) AS LineCount
                FROM data_FinanceVoucherInfo v
                LEFT JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                WHERE v.Status='Posted' AND v.VoucherDate BETWEEN @from AND @to
                ORDER BY v.VoucherDate, v.VoucherID
            `);

        const total = r.recordset.reduce((s, v) => s + Number(v.TotalAmount || 0), 0);
        const byType = {};
        for (const v of r.recordset) {
            byType[v.VoucherType] = (byType[v.VoucherType] || 0) + Number(v.TotalAmount || 0);
        }

        res.json({
            date: dateRaw.toISOString().slice(0, 10),
            vouchers: r.recordset,
            total: +total.toFixed(2),
            byType
        });
    } catch (err) {
        console.error('Day Book error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Helper for aging. Given a list of party-tagged ledger lines on a control account,
 * bucket the *unallocated* outstanding amounts by age.
 * Buckets: Current (0-30), 31-60, 61-90, 90+.
 */
function bucketAging(lines, asOfDate, isReceivable) {
    // Group ledger rows by party. For each party we keep:
    //   - a list of "charge" rows (Dr for receivable / Cr for payable) with their dates
    //   - a single net "payment" pool (Cr for receivable / Dr for payable)
    // Payments are applied FIFO against the oldest open charges, so a payment
    // received today properly clears the original invoice from the older bucket.
    const partyMap = new Map();
    for (const l of lines) {
        const key = l.PartyID;
        if (!partyMap.has(key)) partyMap.set(key, { PartyName: l.PartyName, charges: [], paid: 0 });
        const p = partyMap.get(key);
        const dr = Number(l.Debit) || 0;
        const cr = Number(l.Credit) || 0;
        if (isReceivable) {
            if (dr > 0) p.charges.push({ amt: dr, date: new Date(l.VoucherDate) });
            if (cr > 0) p.paid += cr;
        } else {
            if (cr > 0) p.charges.push({ amt: cr, date: new Date(l.VoucherDate) });
            if (dr > 0) p.paid += dr;
        }
    }

    const out = [];
    for (const [PartyID, p] of partyMap) {
        // Apply payments FIFO against oldest charges first
        let pool = p.paid;
        const sorted = p.charges.slice().sort((a, b) => a.date - b.date);
        const buckets = { current: 0, b31_60: 0, b61_90: 0, b90plus: 0 };
        for (const c of sorted) {
            let remaining = c.amt;
            if (pool > 0) {
                const settled = Math.min(pool, remaining);
                remaining -= settled;
                pool -= settled;
            }
            if (remaining <= 0.005) continue;
            const days = Math.floor((asOfDate - c.date) / (1000 * 60 * 60 * 24));
            if      (days <= 30) buckets.current += remaining;
            else if (days <= 60) buckets.b31_60  += remaining;
            else if (days <= 90) buckets.b61_90  += remaining;
            else                 buckets.b90plus += remaining;
        }
        const total = buckets.current + buckets.b31_60 + buckets.b61_90 + buckets.b90plus;
        if (total > 0.005) {
            out.push({
                PartyID, PartyName: p.PartyName,
                current: +buckets.current.toFixed(2),
                b31_60:  +buckets.b31_60.toFixed(2),
                b61_90:  +buckets.b61_90.toFixed(2),
                b90plus: +buckets.b90plus.toFixed(2),
                total:   +total.toFixed(2),
            });
        }
    }
    return out.sort((a, b) => b.total - a.total);
}

async function agingReport(req, res, isReceivable) {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);

        const pool = await getPool();

        // Standard party-based aging (from the subsidiary ledger)
        const r = await pool.request()
            .input('asOf', sql.DateTime, asOf)
            .query(`
                SELECT l.PartyID, p.PartyName, v.VoucherDate,
                       ISNULL(l.Debit,0) AS Debit, ISNULL(l.Credit,0) AS Credit
                FROM dms_PartyLedger l
                INNER JOIN data_FinanceVoucherInfo v ON l.VoucherID = v.VoucherID
                INNER JOIN gen_PartiesInfo p ON l.PartyID = p.PartyID
                WHERE v.Status='Posted' AND v.VoucherDate <= @asOf
            `);
        const rows = bucketAging(r.recordset, asOf, isReceivable);

        // Receivables-only: also include MCML campaign claim balances that have
        // NO matching party (e.g. auto-created "CAMPAIGN: Free car wash" leaves).
        // Party-linked 102006xxx claims are already counted in the subsidiary
        // ledger above; including them here would double-count.
        if (isReceivable) {
            const cmp = await pool.request()
                .input('asOf', sql.DateTime, asOf)
                .query(`
                    SELECT g.GLCAID, g.GLCode, g.GLTitle, v.VoucherDate,
                           ISNULL(d.Debit,0) AS Debit, ISNULL(d.Credit,0) AS Credit
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                    INNER JOIN GLChartOFAccount g ON d.GLCAID = g.GLCAID
                    WHERE v.Status='Posted' AND v.VoucherDate <= @asOf
                      AND LEFT(g.GLCode, 6) = '102006'
                      AND LEN(g.GLCode) > 6
                      AND NOT EXISTS (SELECT 1 FROM gen_PartiesInfo p WHERE p.PartyGLID = g.GLCAID)
                `);
            // Re-use bucketAging by mapping GLCAID into the PartyID slot —
            // PartyID is set to negative GLCAID to avoid collision with real parties.
            const synthetic = cmp.recordset.map(x => ({
                PartyID:   -x.GLCAID,
                PartyName: `${x.GLCode} ${x.GLTitle}`,
                VoucherDate: x.VoucherDate,
                Debit:  x.Debit,
                Credit: x.Credit,
            }));
            const campaignRows = bucketAging(synthetic, asOf, true);
            // Flag them so the frontend can label them differently
            campaignRows.forEach(r => { r.Kind = 'campaign'; });
            rows.push(...campaignRows);
            rows.sort((a, b) => b.total - a.total);
        }

        const totals = rows.reduce((t, r) => ({
            current: t.current + r.current,
            b31_60:  t.b31_60  + r.b31_60,
            b61_90:  t.b61_90  + r.b61_90,
            b90plus: t.b90plus + r.b90plus,
            total:   t.total   + r.total
        }), { current: 0, b31_60: 0, b61_90: 0, b90plus: 0, total: 0 });

        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            kind: isReceivable ? 'receivable' : 'payable',
            rows,
            totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +v.toFixed(2)]))
        });
    } catch (err) {
        console.error('Aging error:', err);
        res.status(500).json({ error: err.message });
    }
}

exports.getReceivablesAging = (req, res) => agingReport(req, res, true);
exports.getPayablesAging    = (req, res) => agingReport(req, res, false);

/**
 * GET /reports/tax-rate-history
 * Full change history of tax rates from dms_TaxRates.
 */
exports.getTaxRateHistory = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT TaxRateID, TaxType, Rate, EffectiveFrom, EffectiveTo,
                   ChangedBy, ChangedByName, ChangedAt
            FROM dms_TaxRates
            ORDER BY TaxType, EffectiveFrom DESC
        `);
        res.json({ rows: r.recordset });
    } catch (err) {
        console.error('Tax History error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * Helper — GL Detail for a role account over a period (used by POS Pending,
 * Cheques on Hand, Gen-Customer Reconciliation).
 */
async function roleAccountLines(roleKey, pool, from, to) {
    const glcaid = await resolveRole(roleKey);
    const r = await pool.request()
        .input('id', sql.Int, glcaid)
        .input('from', sql.DateTime, from)
        .input('to',   sql.DateTime, to)
        .query(`
            SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                   v.SourceDocType, v.SourceDocID,
                   d.Narration, ISNULL(d.Debit,0) AS Debit, ISNULL(d.Credit,0) AS Credit,
                   d.PartyID, p.PartyName, d.JobCardID, j.JobCardNo,
                   d.AllocatedToVoucherID
            FROM data_FinanceVoucherDetail d
            INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
            LEFT JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            LEFT JOIN gen_PartiesInfo p ON d.PartyID = p.PartyID
            LEFT JOIN Addata_JobCardInfo j ON d.JobCardID = j.JobCardId
            WHERE d.GLCAID=@id AND v.Status='Posted'
              AND v.VoucherDate BETWEEN @from AND @to
            ORDER BY v.VoucherDate, v.VoucherID, d.VoucherDetailID
        `);
    return { glcaid, lines: r.recordset };
}

/**
 * GET /reports/pos-pending?asOf=
 * POS Clearing balance lines that are unsettled (no AllocatedToVoucherID).
 */
exports.getPOSPending = async (req, res) => {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);
        const pool = await getPool();
        const epoch = new Date('1900-01-01');
        const { glcaid, lines } = await roleAccountLines('POS_CLEARING', pool, epoch, asOf);
        // Pending = debit lines (POS receipts) not yet allocated to a settlement voucher.
        const pending = lines.filter(l => Number(l.Debit) > 0 && !l.AllocatedToVoucherID);
        const total = pending.reduce((s, l) => s + Number(l.Debit), 0);
        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            glcaid,
            rows: pending,
            total: +total.toFixed(2)
        });
    } catch (err) {
        console.error('POS Pending error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/cheques-on-hand?asOf=
 * Pending cheques (received and issued) joined with dms_PendingCheques for rich
 * metadata: cheque #, drawer/deposit bank, payer/payee, source voucher, age.
 */
exports.getChequesOnHand = async (req, res) => {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);
        const pool = await getPool();
        const glcaid = await resolveRole('CHEQUES_ON_HAND');
        const r = await pool.request()
            .input('asOf', sql.DateTime, asOf)
            .query(`
                SELECT pc.ChequeID, pc.Direction,
                       pc.ChequeNo, pc.ChequeDate, pc.Amount, pc.DrawerBank,
                       db.GLCode AS BankCode, db.GLTitle AS BankTitle,
                       pc.PartyID, pt.PartyName,
                       pc.JobCardID, jc.JobCardNo,
                       rv.VoucherNo AS SourceVoucherNo, rv.VoucherDate AS SourceDate,
                       DATEDIFF(day, pc.ChequeDate, @asOf) AS AgeDays,
                       CASE WHEN pc.ChequeDate > CAST(@asOf AS DATE) THEN 1 ELSE 0 END AS PostDated
                FROM dms_PendingCheques pc
                LEFT JOIN GLChartOFAccount        db ON db.GLCAID    = pc.DepositBankGLCAID
                LEFT JOIN gen_PartiesInfo         pt ON pt.PartyID   = pc.PartyID
                LEFT JOIN Addata_JobCardInfo      jc ON jc.JobCardId = pc.JobCardID
                LEFT JOIN data_FinanceVoucherInfo rv ON rv.VoucherID = pc.ReceiptVoucherID
                WHERE pc.Status = 'Pending'
                ORDER BY pc.Direction, pc.ChequeDate ASC, pc.ChequeID ASC`);
        const rows = r.recordset;
        const totals = rows.reduce((t, x) => {
            if (x.Direction === 'Received') t.received += Number(x.Amount);
            else                            t.issued   += Number(x.Amount);
            return t;
        }, { received: 0, issued: 0 });
        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            glcaid,
            rows,
            totals: {
                received: +totals.received.toFixed(2),
                issued:   +totals.issued.toFixed(2),
                net:      +(totals.received - totals.issued).toFixed(2),
            },
            total: +totals.received.toFixed(2)  // backward compat for existing callers
        });
    } catch (err) {
        console.error('Cheques error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/bank-balances?asOf=
 * Balance per configured bank account.
 */
exports.getBankBalances = async (req, res) => {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);
        const pool = await getPool();
        const r = await pool.request()
            .input('asOf', sql.DateTime, asOf)
            .query(`
                SELECT b.GLCAID, c.GLCode, c.GLTitle, b.IsActive,
                       ISNULL(SUM(d.Debit),0)  AS TotalIn,
                       ISNULL(SUM(d.Credit),0) AS TotalOut,
                       ISNULL(SUM(d.Debit),0) - ISNULL(SUM(d.Credit),0) AS Balance
                FROM dms_BankAccounts b
                JOIN GLChartOFAccount c ON b.GLCAID = c.GLCAID
                LEFT JOIN data_FinanceVoucherDetail d ON d.GLCAID = b.GLCAID
                LEFT JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                    AND v.Status='Posted' AND v.VoucherDate <= @asOf
                GROUP BY b.GLCAID, c.GLCode, c.GLTitle, b.IsActive
                ORDER BY c.GLCode
            `);
        const total = r.recordset.reduce((s, b) => s + Number(b.Balance), 0);
        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            rows: r.recordset,
            total: +total.toFixed(2)
        });
    } catch (err) {
        console.error('Bank Balances error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/discount-given?from=&to=
 * Care-Off discount events from dms_CareOffAudit, joined to Job Card.
 */
exports.getDiscountGiven = async (req, res) => {
    try {
        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0,0,0,0);
        const to   = endOfDay(toRaw);

        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT a.AuditID, a.ChangedAt, a.ChangedBy, a.ChangedByName, a.Action,
                       a.JobCardID, j.JobCardNo, j.JobCardDate,
                       a.OldValue, a.NewValue,
                       co.EmployeeID, e.EmployeeName AS Authoriser
                FROM dms_CareOffAudit a
                LEFT JOIN Addata_JobCardInfo j ON a.JobCardID = j.JobCardId
                LEFT JOIN dms_CareOff co ON a.CareOffID = co.CareOffID
                LEFT JOIN gen_EmployeeInfo e ON co.EmployeeID = e.EmployeeID
                WHERE a.ChangedAt BETWEEN @from AND @to
                ORDER BY a.ChangedAt DESC
            `);

        // Group by authoriser for the summary
        const byAuth = {};
        for (const row of r.recordset) {
            const k = row.Authoriser || '(none)';
            byAuth[k] = (byAuth[k] || 0) + 1;
        }
        res.json({
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            rows: r.recordset,
            byAuthoriser: byAuth
        });
    } catch (err) {
        console.error('Discount Given error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/sales-register?from=&to=
 * All posted sales-side vouchers: SI (Job Card invoice) + SS (Store Sale).
 */
exports.getSalesRegister = async (req, res) => {
    try {
        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0,0,0,0);
        const to   = endOfDay(toRaw);

        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.Remarks, v.TotalAmount, v.SourceDocType, v.SourceDocID,
                       v.CreatedByName
                FROM data_FinanceVoucherInfo v
                JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                WHERE v.Status='Posted'
                  AND v.VoucherDate BETWEEN @from AND @to
                  AND vt.Title IN ('SI','SS','SSR')
                ORDER BY v.VoucherDate, v.VoucherID
            `);
        const summary = {};
        let grandTotal = 0;
        for (const v of r.recordset) {
            summary[v.VoucherType] = (summary[v.VoucherType] || 0) + Number(v.TotalAmount || 0);
            grandTotal += Number(v.TotalAmount || 0);
        }
        res.json({
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            rows: r.recordset,
            byType: summary,
            grandTotal: +grandTotal.toFixed(2)
        });
    } catch (err) {
        console.error('Sales Register error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/insurance-aging?asOf=
 * Placeholder until §14.10 Insurance split-receivable is built.
 */
exports.getInsuranceAging = async (req, res) => {
    res.json({
        asOf: (req.query.asOf || new Date().toISOString().slice(0, 10)),
        rows: [],
        totals: { current: 0, b31_60: 0, b61_90: 0, b90plus: 0, total: 0 },
        note: 'Insurance split-receivable (§14.10) is deferred. Until built, no insurance-tagged ledger entries exist.'
    });
};

/**
 * GET /reports/gross-margin?from=&to=
 * Per Job Card: Revenue − Discount − COGS − Sublet Cost for posted SI vouchers in period.
 */
exports.getGrossMargin = async (req, res) => {
    try {
        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0,0,0,0);
        const to   = endOfDay(toRaw);

        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT v.VoucherID, v.VoucherDate, v.SourceDocID AS JobCardID, j.JobCardNo,
                       j.PartyID, p.PartyName,
                       d.GLCAID, c.GLCode, ISNULL(d.Debit,0) AS Debit, ISNULL(d.Credit,0) AS Credit
                FROM data_FinanceVoucherInfo v
                JOIN data_FinanceVoucherDetail d ON v.VoucherID = d.VoucherID
                JOIN GLChartOFAccount c ON d.GLCAID = c.GLCAID
                JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                LEFT JOIN Addata_JobCardInfo j ON v.SourceDocID = j.JobCardId
                LEFT JOIN gen_PartiesInfo p ON j.PartyID = p.PartyID
                WHERE v.Status='Posted'
                  AND v.VoucherDate BETWEEN @from AND @to
                  AND vt.Title='SI'
            `);

        // Bucket by JobCardID
        const map = new Map();
        for (const l of r.recordset) {
            const k = l.JobCardID;
            if (!map.has(k)) map.set(k, {
                JobCardID: k, JobCardNo: l.JobCardNo, JobCardDate: l.VoucherDate,
                PartyName: l.PartyName,
                revenue: 0, discount: 0, cogs: 0, subletCost: 0
            });
            const g = map.get(k);
            const code = l.GLCode || '';
            // Revenue lines (401*) → use credit
            if (code.startsWith('401')) g.revenue += Number(l.Credit) - Number(l.Debit);
            // Discount given (debit-natured expense at 5xxxx OR special discount account)
            if (code === '401099' || code === '50101' /* placeholder */) {/* not used */}
            // COGS (501*)
            if (code.startsWith('501')) g.cogs += Number(l.Debit) - Number(l.Credit);
            // Sublet cost (502*)
            if (code.startsWith('502')) g.subletCost += Number(l.Debit) - Number(l.Credit);
        }
        const rows = Array.from(map.values()).map(g => {
            const margin = g.revenue - g.discount - g.cogs - g.subletCost;
            return {
                ...g,
                revenue:    +g.revenue.toFixed(2),
                discount:   +g.discount.toFixed(2),
                cogs:       +g.cogs.toFixed(2),
                subletCost: +g.subletCost.toFixed(2),
                margin:     +margin.toFixed(2),
                marginPct:  g.revenue > 0 ? +((margin / g.revenue) * 100).toFixed(2) : 0
            };
        }).sort((a, b) => new Date(b.JobCardDate) - new Date(a.JobCardDate));

        const totals = rows.reduce((t, r) => ({
            revenue: t.revenue + r.revenue,
            cogs:    t.cogs    + r.cogs,
            subletCost: t.subletCost + r.subletCost,
            margin:  t.margin  + r.margin
        }), { revenue: 0, cogs: 0, subletCost: 0, margin: 0 });

        res.json({
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            rows,
            totals: {
                revenue:    +totals.revenue.toFixed(2),
                cogs:       +totals.cogs.toFixed(2),
                subletCost: +totals.subletCost.toFixed(2),
                margin:     +totals.margin.toFixed(2),
                marginPct:  totals.revenue > 0 ? +((totals.margin / totals.revenue) * 100).toFixed(2) : 0
            }
        });
    } catch (err) {
        console.error('Gross Margin error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/inventory-valuation?asOf=
 * On-hand quantity × Weighted Average Rate per item.
 * On-hand = Σ(StockArrival quantities) − Σ(StockInOut "Issue" quantities) up to asOf.
 */
exports.getInventoryValuation = async (req, res) => {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);

        const includeZero = req.query.includeZero === '1';
        const whId        = req.query.whId    ? parseInt(req.query.whId)    : null;
        const categoryId  = req.query.catId   ? parseInt(req.query.catId)   : null;
        const search      = (req.query.search || '').trim();

        const pool = await getPool();

        // We've learned the hard way: a single CTE query joining all the lookups
        // pathologically slow under msnodesqlv8 (25s for 1k items). Splitting
        // into 3 simple queries — items master, inflow agg, outflow agg — and
        // merging in JS runs in <100ms.
        const itemsReq = pool.request();
        const conds = [];
        if (whId)       { itemsReq.input('wh',  sql.Int, whId);  conds.push('i.WHID = @wh'); }
        if (categoryId) { itemsReq.input('cat', sql.Int, categoryId); conds.push('i.CategoryID = @cat'); }
        if (search)     { itemsReq.input('q', sql.NVarChar(200), `%${search}%`);
                          conds.push('(i.ItenName LIKE @q OR i.ManualNumber LIKE @q OR CAST(i.ItemNumber AS NVARCHAR(50)) LIKE @q)'); }
        const itemsWhere = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const [items, inflow, outflow] = await Promise.all([
            itemsReq.query(`
                SELECT i.ItemId, i.ItemNumber, i.ItenName, i.ManualNumber, i.BinLocation,
                       i.WeightedRate, i.ReOrderLevel,
                       w.WHDesc, c.CategoryName, b.BrandName, u.UOMName
                FROM InventItems i
                LEFT JOIN InventWareHouse  w ON i.WHID        = w.WHID
                LEFT JOIN InventCategory   c ON i.CategoryID  = c.CategoryID
                LEFT JOIN InventItemBrands b ON i.ItemBrandId = b.ItemBrandId
                LEFT JOIN InventUOM        u ON i.UOMId       = u.UOMId
                ${itemsWhere}`),
            pool.request().input('asOf', sql.DateTime, asOf).query(`
                SELECT sd.ItemId, SUM(ISNULL(sd.Quantity,0)) AS QtyIn
                FROM data_StockArrivalDetail sd
                INNER JOIN data_StockArrivalInfo si ON sd.ArrivalID = si.ArrivalID
                WHERE si.ArrivalDate <= @asOf
                GROUP BY sd.ItemId`),
            pool.request().input('asOf', sql.DateTime, asOf).query(`
                SELECT od.ItemId, SUM(ISNULL(od.Quantity,0)) AS QtyOut
                FROM data_StockInOutDetail od
                INNER JOIN data_StockInOutInfo oi ON od.StockIOID = oi.StockIOID
                WHERE oi.StockIODate <= @asOf
                GROUP BY od.ItemId`),
        ]);

        const inMap = new Map(inflow.recordset.map(r => [r.ItemId, Number(r.QtyIn)]));
        const outMap = new Map(outflow.recordset.map(r => [r.ItemId, Number(r.QtyOut)]));

        let rows = items.recordset.map(x => {
            // data_StockInOutDetail.Quantity is signed (purchase +, issue/sale -)
            // so it's added, not subtracted. data_StockArrival is opening stock + manual arrivals.
            const onHand = (inMap.get(x.ItemId) || 0) + (outMap.get(x.ItemId) || 0);
            const rate = Number(x.WeightedRate || 0);
            return {
                ItemId:      x.ItemId,
                ItemCode:    x.ItemNumber != null ? String(x.ItemNumber) : '',
                ItemName:    x.ItenName || '',
                PartNumber:  x.ManualNumber || '',
                BinLocation: x.BinLocation || '',
                Warehouse:   x.WHDesc || '',
                Category:    x.CategoryName || '',
                Brand:       x.BrandName || '',
                UOM:         x.UOMName || '',
                ReOrderLevel: x.ReOrderLevel || 0,
                OnHand:      +onHand.toFixed(2),
                Rate:        +rate.toFixed(2),
                Value:       +(onHand * rate).toFixed(2),
            };
        });
        if (!includeZero) rows = rows.filter(r => r.OnHand > 0);
        rows.sort((a, b) => b.Value - a.Value);
        const totalQty   = rows.reduce((s, x) => s + x.OnHand, 0);
        const totalValue = rows.reduce((s, x) => s + x.Value,  0);
        const belowReorder = rows.filter(x => x.ReOrderLevel > 0 && x.OnHand <= x.ReOrderLevel).length;

        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            rows,
            totals: {
                items:        rows.length,
                totalQty:     +totalQty.toFixed(2),
                totalValue:   +totalValue.toFixed(2),
                belowReorder,
            },
        });
    } catch (err) {
        console.error('Inventory Valuation error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/walkin-outstanding?asOf=
 * Walk-in (no-party) JCs whose SI voucher still has a GENERAL_CUSTOMER Debit
 * net of any settlement Cr (allocated by VoucherID). One row per pending JC,
 * with payment type as a hint to the cashier.
 */
exports.getWalkInOutstanding = async (req, res) => {
    try {
        const asOfRaw = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const asOf = endOfDay(asOfRaw);

        const pool = await getPool();
        const gcGL = await resolveRole('GENERAL_CUSTOMER');

        const r = await pool.request()
            .input('gl',   sql.Int,      gcGL)
            .input('asOf', sql.DateTime, asOf)
            .query(`
                WITH InvoiceLines AS (
                    SELECT d.VoucherID, d.JobCardID, SUM(d.Debit) AS Invoiced, MIN(v.VoucherDate) AS InvDate
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                    WHERE d.GLCAID = @gl AND d.Debit > 0
                      AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
                      AND v.SourceDocType='JOBCARD' AND v.VoucherDate <= @asOf
                    GROUP BY d.VoucherID, d.JobCardID
                ),
                Settled AS (
                    SELECT d.AllocatedToVoucherID, SUM(d.Credit) AS Paid
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                    WHERE d.GLCAID = @gl AND d.Credit > 0 AND d.AllocatedToVoucherID IS NOT NULL
                      AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
                      AND v.VoucherDate <= @asOf
                    GROUP BY d.AllocatedToVoucherID
                )
                SELECT i.VoucherID, vi.VoucherNo,
                       jc.JobCardId, jc.JobCardNo, jc.JobCardDate,
                       jc.[Status] AS PaymentType, jc.PaymentBankID,
                       i.Invoiced,
                       ISNULL(s.Paid, 0) AS Paid,
                       i.Invoiced - ISNULL(s.Paid, 0) AS Outstanding,
                       DATEDIFF(day, jc.JobCardDate, @asOf) AS AgeDays
                FROM InvoiceLines i
                LEFT JOIN Settled s ON s.AllocatedToVoucherID = i.VoucherID
                INNER JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = i.VoucherID
                INNER JOIN Addata_JobCardInfo jc ON jc.JobCardId = i.JobCardID
                WHERE i.Invoiced - ISNULL(s.Paid, 0) > 0.005
                ORDER BY jc.JobCardDate ASC
            `);

        const totals = r.recordset.reduce((t, x) => {
            t.invoiced += Number(x.Invoiced);
            t.paid     += Number(x.Paid);
            t.outstanding += Number(x.Outstanding);
            return t;
        }, { invoiced: 0, paid: 0, outstanding: 0 });

        res.json({
            asOf: asOfRaw.toISOString().slice(0, 10),
            rows: r.recordset,
            totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, +v.toFixed(2)])),
        });
    } catch (err) {
        console.error('Walk-in Outstanding error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/gencust-reconciliation?date=
 * General-Customer transit lines for a day. Net should be 0 at close-of-day.
 */
exports.getGenCustReconciliation = async (req, res) => {
    try {
        const dateRaw = req.query.date ? new Date(req.query.date) : new Date();
        const dayStart = new Date(dateRaw); dayStart.setHours(0,0,0,0);
        const dayEnd = endOfDay(dateRaw);

        const pool = await getPool();
        const { glcaid, lines } = await roleAccountLines('GENERAL_CUSTOMER', pool, dayStart, dayEnd);

        const totalDr = lines.reduce((s, l) => s + Number(l.Debit), 0);
        const totalCr = lines.reduce((s, l) => s + Number(l.Credit), 0);
        const net = totalDr - totalCr;

        res.json({
            date: dateRaw.toISOString().slice(0, 10),
            glcaid,
            rows: lines,
            totalDr: +totalDr.toFixed(2),
            totalCr: +totalCr.toFixed(2),
            net: +net.toFixed(2),
            balanced: Math.abs(net) < 0.01
        });
    } catch (err) {
        console.error('Gen-Cust Reconciliation error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/voucher-audit?from=&to=&status=
 * All vouchers in a period regardless of status (Posted, Reversed, Draft).
 */
exports.getVoucherAudit = async (req, res) => {
    try {
        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0,0,0,0);
        const to   = endOfDay(toRaw);
        const status = req.query.status; // optional filter

        const pool = await getPool();
        const req2 = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);
        let where = `v.VoucherDate BETWEEN @from AND @to`;
        if (status && ['Draft','Posted','Reversed'].includes(status)) {
            req2.input('s', sql.NVarChar(20), status);
            where += ` AND v.Status = @s`;
        }
        const r = await req2.query(`
            SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                   v.Status, v.TotalAmount, v.SourceDocType, v.SourceDocID,
                   v.CreatedBy, v.CreatedByName, v.EntryUserDateTime AS CreatedAt,
                   v.PostedBy, v.PostedAt, v.ReversedBy, v.ReversedByName, v.ReversedAt,
                   v.ReversesVoucherID
            FROM data_FinanceVoucherInfo v
            LEFT JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            WHERE ${where}
            ORDER BY v.VoucherDate DESC, v.VoucherID DESC
        `);
        const counts = { Draft: 0, Posted: 0, Reversed: 0 };
        for (const v of r.recordset) counts[v.Status] = (counts[v.Status] || 0) + 1;
        res.json({
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            rows: r.recordset,
            counts
        });
    } catch (err) {
        console.error('Voucher Audit error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/system-account-audit
 * Full history of system role reassignments.
 */
exports.getSystemAccountAudit = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT a.AuditID, a.RoleKey, a.OldGLCAID, a.NewGLCAID,
                   oc.GLCode AS OldGLCode, oc.GLTitle AS OldGLTitle,
                   nc.GLCode AS NewGLCode, nc.GLTitle AS NewGLTitle,
                   a.ChangedBy, a.ChangedByName, a.ChangedAt, a.Reason
            FROM dms_SystemAccountAudit a
            LEFT JOIN GLChartOFAccount oc ON a.OldGLCAID = oc.GLCAID
            LEFT JOIN GLChartOFAccount nc ON a.NewGLCAID = nc.GLCAID
            ORDER BY a.ChangedAt DESC
        `);
        res.json({ rows: r.recordset });
    } catch (err) {
        console.error('System Account Audit error:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/tax-summary?type=GST_OUTPUT|GST_INPUT|PST_OUTPUT&from=&to=
 *
 * Lists all posted lines hitting a tax control account in the period, grouped
 * by voucher. Output taxes (GST_PAYABLE, PST_PAYABLE) → sum Credit − Debit.
 * Input taxes (INPUT_GST) → sum Debit − Credit.
 */
exports.getTaxSummary = async (req, res) => {
    try {
        const type = (req.query.type || 'GST_OUTPUT').toUpperCase();
        const ROLE_MAP = {
            GST_OUTPUT: { role: 'GST_PAYABLE', natureDr: false, label: 'GST Output (Collected)' },
            GST_INPUT:  { role: 'INPUT_GST',   natureDr: true,  label: 'GST Input (Paid)' },
            PST_OUTPUT: { role: 'PST_PAYABLE', natureDr: false, label: 'PST Output (Collected)' }
        };
        const cfg = ROLE_MAP[type];
        if (!cfg) return res.status(400).json({ error: 'Invalid type. Expected GST_OUTPUT, GST_INPUT, or PST_OUTPUT.' });

        const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
        const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
        const from = new Date(fromRaw); from.setHours(0,0,0,0);
        const to   = endOfDay(toRaw);

        const taxGLCAID = await resolveRole(cfg.role);
        const pool = await getPool();

        // Account header for display
        const acctRes = await pool.request()
            .input('id', sql.Int, taxGLCAID)
            .query(`SELECT GLCode, GLTitle FROM GLChartOFAccount WHERE GLCAID=@id`);
        const acct = acctRes.recordset[0] || {};

        const linesRes = await pool.request()
            .input('id', sql.Int, taxGLCAID)
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.SourceDocType, v.SourceDocID,
                       d.Narration, ISNULL(d.Debit,0) AS Debit, ISNULL(d.Credit,0) AS Credit,
                       d.PartyID, p.PartyName, d.JobCardID, j.JobCardNo
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                LEFT JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                LEFT JOIN gen_PartiesInfo p ON d.PartyID = p.PartyID
                LEFT JOIN Addata_JobCardInfo j ON d.JobCardID = j.JobCardId
                WHERE d.GLCAID=@id AND v.Status='Posted'
                  AND v.VoucherDate BETWEEN @from AND @to
                ORDER BY v.VoucherDate, v.VoucherID, d.VoucherDetailID
            `);

        const totalDr = linesRes.recordset.reduce((s, l) => s + Number(l.Debit), 0);
        const totalCr = linesRes.recordset.reduce((s, l) => s + Number(l.Credit), 0);
        const netLiability = cfg.natureDr ? (totalDr - totalCr) : (totalCr - totalDr);

        res.json({
            type, label: cfg.label,
            account: { GLCAID: taxGLCAID, GLCode: acct.GLCode, GLTitle: acct.GLTitle },
            from: fromRaw.toISOString().slice(0, 10),
            to:   toRaw.toISOString().slice(0, 10),
            totals: {
                debit:  +totalDr.toFixed(2),
                credit: +totalCr.toFixed(2),
                net:    +netLiability.toFixed(2)
            },
            lines: linesRes.recordset
        });
    } catch (err) {
        console.error('Tax Summary error:', err);
        res.status(500).json({ error: err.message });
    }
};
