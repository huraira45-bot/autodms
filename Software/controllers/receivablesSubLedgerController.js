/**
 * Trade Receivables Sub-Ledger.
 *
 * Owner ask 2026-09-10: give a manager the trial-balance extract of one
 * receivables parent (102008 TRADE RECEIVABLES - PARTS PARTIES) and let them
 * open each party's ledger.
 *
 * WHY THIS EXISTS RATHER THAN JUST GRANTING THE EXISTING REPORTS
 *   Trial Balance Extract already accepts a parentCode, and GL Detail already
 *   shows a ledger. But granting report:trial_balance_extract hands over the
 *   WHOLE trial balance, and report:gl_detail hands over EVERY ledger --
 *   102008's own siblings include 102002 CASH & BANK, and elsewhere in the
 *   COA sit payroll and owner equity. A parts manager who needs to chase
 *   parts debtors should not thereby see the salary bill.
 *
 *   So this is the same six-column extract and the same ledger, hard-scoped
 *   to the trade-receivables groups and nothing else. Granting it cannot leak
 *   anything outside them.
 *
 * SCOPE IS ENFORCED SERVER-SIDE, TWICE
 *   - the group list only ever returns ALLOWED_PARENTS
 *   - the ledger endpoint re-checks that the requested account really sits
 *     under one of them before returning a single line. Without that second
 *     check, passing any GLCAID would turn this into unrestricted GL Detail.
 */
const { sql, getPool } = require('../config/db');

// The three trade-receivable groups. Deliberately a fixed list rather than a
// pattern like '1020%' — that would also match CASH & BANK (102002) and
// STAFF RECEIVABLES (102004).
const ALLOWED_PARENTS = ['102007', '102008', '102009'];
const DEFAULT_PARENT  = '102008';   // Parts parties — the owner's ask

const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 997); return x; };

function parsePeriod(req) {
    const fromRaw = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
    const toRaw   = req.query.to   ? new Date(req.query.to)   : new Date();
    const from = new Date(fromRaw); from.setHours(0, 0, 0, 0);
    return { from, to: endOfDay(toRaw) };
}

/** Resolves the requested parent, refusing anything outside the allow-list. */
function resolveParent(req) {
    const asked = (req.query.parentCode || '').trim() || DEFAULT_PARENT;
    return ALLOWED_PARENTS.includes(asked) ? asked : DEFAULT_PARENT;
}

/**
 * GET /reports/receivables-subledger/groups
 * The receivable groups this report may show, with their titles.
 */
exports.getGroups = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT GLCAID, GLCode, GLTitle
            FROM   GLChartOFAccount
            WHERE  GLCode IN ('${ALLOWED_PARENTS.join("','")}')
            ORDER  BY GLCode`);
        res.json({ groups: r.recordset, defaultParent: DEFAULT_PARENT });
    } catch (err) {
        console.error('receivablesSubLedger.getGroups:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/receivables-subledger?parentCode=&from=&to=&includeZero=
 * Six-column extract (Opening / Period / Closing, each Dr and Cr) for every
 * party account under the chosen receivables group.
 */
exports.getExtract = async (req, res) => {
    try {
        const { from, to } = parsePeriod(req);
        const parentCode = resolveParent(req);
        const includeZero = String(req.query.includeZero || '') === '1';

        const pool = await getPool();

        const head = await pool.request()
            .input('pc', sql.NVarChar(50), parentCode)
            .query('SELECT GLCAID, GLCode, GLTitle FROM GLChartOFAccount WHERE GLCode = @pc');

        const r = await pool.request()
            .input('from',   sql.DateTime,     from)
            .input('to',     sql.DateTime,     to)
            .input('parent', sql.NVarChar(50), parentCode + '%')
            .query(`
                WITH opening AS (
                    SELECT d.GLCAID,
                           ISNULL(SUM(d.Debit), 0) - ISNULL(SUM(d.Credit), 0) AS OpeningNetDr
                    FROM   data_FinanceVoucherDetail d
                    JOIN   data_FinanceVoucherInfo   v ON v.VoucherID = d.VoucherID
                    WHERE  v.Status = 'Posted' AND v.ReversesVoucherID IS NULL
                      AND  v.VoucherDate < @from
                    GROUP  BY d.GLCAID
                ),
                period AS (
                    SELECT d.GLCAID,
                           ISNULL(SUM(d.Debit), 0)  AS PeriodDr,
                           ISNULL(SUM(d.Credit), 0) AS PeriodCr,
                           COUNT(*)                 AS Entries,
                           MAX(v.VoucherDate)       AS LastActivity
                    FROM   data_FinanceVoucherDetail d
                    JOIN   data_FinanceVoucherInfo   v ON v.VoucherID = d.VoucherID
                    WHERE  v.Status = 'Posted' AND v.ReversesVoucherID IS NULL
                      AND  v.VoucherDate BETWEEN @from AND @to
                    GROUP  BY d.GLCAID
                )
                SELECT c.GLCAID, c.GLCode, c.GLTitle,
                       ISNULL(o.OpeningNetDr, 0) AS OpeningNetDr,
                       ISNULL(p.PeriodDr, 0)     AS PeriodDr,
                       ISNULL(p.PeriodCr, 0)     AS PeriodCr,
                       ISNULL(p.Entries, 0)      AS Entries,
                       p.LastActivity,
                       ISNULL(o.OpeningNetDr, 0) + ISNULL(p.PeriodDr, 0) - ISNULL(p.PeriodCr, 0)
                                                 AS ClosingNetDr
                FROM   GLChartOFAccount c
                LEFT   JOIN opening o ON o.GLCAID = c.GLCAID
                LEFT   JOIN period  p ON p.GLCAID = c.GLCAID
                WHERE  c.Status = 1 AND c.isParent = 0
                  AND  c.GLCode LIKE @parent
                ORDER  BY c.GLCode`);

        let rows = r.recordset.map(x => {
            const open  = Number(x.OpeningNetDr) || 0;
            const close = Number(x.ClosingNetDr) || 0;
            return {
                GLCAID:  x.GLCAID,
                GLCode:  x.GLCode,
                GLTitle: x.GLTitle,
                OpeningDr: +Math.max(open,  0).toFixed(2),
                OpeningCr: +Math.max(-open, 0).toFixed(2),
                PeriodDr:  +Number(x.PeriodDr).toFixed(2),
                PeriodCr:  +Number(x.PeriodCr).toFixed(2),
                ClosingDr: +Math.max(close,  0).toFixed(2),
                ClosingCr: +Math.max(-close, 0).toFixed(2),
                Outstanding: +close.toFixed(2),      // +ve = party owes us
                Entries:  Number(x.Entries) || 0,
                LastActivity: x.LastActivity ? x.LastActivity.toISOString().slice(0, 10) : null,
            };
        });

        // A party with no opening balance and no movement is noise on a
        // receivables chase-list, so it is hidden unless explicitly asked for.
        const allCount = rows.length;
        if (!includeZero) {
            rows = rows.filter(x => x.Entries > 0
                                 || Math.abs(x.OpeningDr - x.OpeningCr) > 0.005
                                 || Math.abs(x.Outstanding) > 0.005);
        }

        const sum = (f) => +rows.reduce((s, x) => s + f(x), 0).toFixed(2);
        res.json({
            parent: head.recordset[0] || { GLCode: parentCode, GLTitle: '' },
            from: from.toISOString().slice(0, 10),
            to:   to.toISOString().slice(0, 10),
            rows,
            totals: {
                parties: rows.length,
                hiddenZeroParties: allCount - rows.length,
                openingDr: sum(x => x.OpeningDr), openingCr: sum(x => x.OpeningCr),
                periodDr:  sum(x => x.PeriodDr),  periodCr:  sum(x => x.PeriodCr),
                closingDr: sum(x => x.ClosingDr), closingCr: sum(x => x.ClosingCr),
                // Net receivable = what the group is actually owed.
                outstanding: sum(x => x.Outstanding),
            },
        });
    } catch (err) {
        console.error('receivablesSubLedger.getExtract:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /reports/receivables-subledger/ledger?glcaid=&from=&to=
 * One party's ledger with a running balance.
 *
 * The GLCAID is verified to sit under an allowed receivables group BEFORE any
 * ledger data is read — this endpoint must never become a way to read an
 * arbitrary account.
 */
exports.getPartyLedger = async (req, res) => {
    try {
        const glcaid = parseInt(req.query.glcaid);
        if (!glcaid) return res.status(400).json({ error: 'glcaid is required.' });
        const { from, to } = parsePeriod(req);

        const pool = await getPool();

        const acct = await pool.request()
            .input('id', sql.Int, glcaid)
            .query(`SELECT GLCAID, GLCode, GLTitle, isParent,
                           CASE GLNature WHEN 1 THEN 'Debit' ELSE 'Credit' END AS Nature
                    FROM GLChartOFAccount WHERE GLCAID = @id`);
        if (!acct.recordset.length) return res.status(404).json({ error: 'Account not found.' });
        const account = acct.recordset[0];

        const inScope = ALLOWED_PARENTS.some(p => String(account.GLCode || '').startsWith(p));
        if (!inScope) {
            return res.status(403).json({
                error: 'This report only covers trade-receivable party accounts.',
            });
        }

        const openRes = await pool.request()
            .input('id', sql.Int, glcaid)
            .input('from', sql.DateTime, from)
            .query(`SELECT ISNULL(SUM(d.Debit), 0) - ISNULL(SUM(d.Credit), 0) AS OpeningNetDr
                    FROM   data_FinanceVoucherDetail d
                    JOIN   data_FinanceVoucherInfo   v ON v.VoucherID = d.VoucherID
                    WHERE  d.GLCAID = @id AND v.Status = 'Posted'
                      AND  v.ReversesVoucherID IS NULL AND v.VoucherDate < @from`);
        const openingNetDr = Number(openRes.recordset[0].OpeningNetDr) || 0;

        const linesRes = await pool.request()
            .input('id', sql.Int, glcaid)
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, vt.Title AS VoucherType,
                       v.Remarks AS VoucherRemarks, v.SourceDocType,
                       d.Narration, ISNULL(d.Debit, 0) AS Debit, ISNULL(d.Credit, 0) AS Credit,
                       p.PartyName, j.JobCardNo
                FROM   data_FinanceVoucherDetail d
                JOIN   data_FinanceVoucherInfo   v ON v.VoucherID = d.VoucherID
                LEFT   JOIN GLVoucherType      vt ON vt.Voucherid = v.VoucherTypeID
                LEFT   JOIN gen_PartiesInfo     p ON p.PartyID    = d.PartyID
                LEFT   JOIN Addata_JobCardInfo  j ON j.JobCardId  = d.JobCardID
                WHERE  d.GLCAID = @id AND v.Status = 'Posted'
                  AND  v.ReversesVoucherID IS NULL
                  AND  v.VoucherDate BETWEEN @from AND @to
                ORDER  BY v.VoucherDate, v.VoucherID, d.VoucherDetailID`);

        let running = openingNetDr;
        const lines = linesRes.recordset.map(x => {
            const dr = Number(x.Debit) || 0, cr = Number(x.Credit) || 0;
            running += dr - cr;
            return {
                VoucherID:   x.VoucherID,
                VoucherNo:   x.VoucherNo,
                VoucherDate: x.VoucherDate ? x.VoucherDate.toISOString().slice(0, 10) : null,
                VoucherType: x.VoucherType || '',
                Narration:   x.Narration || x.VoucherRemarks || '',
                SourceDocType: x.SourceDocType || '',
                PartyName:   x.PartyName || '',
                JobCardNo:   x.JobCardNo || '',
                Debit:  +dr.toFixed(2),
                Credit: +cr.toFixed(2),
                Balance: +running.toFixed(2),
            };
        });

        res.json({
            account,
            from: from.toISOString().slice(0, 10),
            to:   to.toISOString().slice(0, 10),
            openingBalance: +openingNetDr.toFixed(2),
            closingBalance: +running.toFixed(2),
            lines,
            totals: {
                debit:  +lines.reduce((s, x) => s + x.Debit,  0).toFixed(2),
                credit: +lines.reduce((s, x) => s + x.Credit, 0).toFixed(2),
                entries: lines.length,
            },
        });
    } catch (err) {
        console.error('receivablesSubLedger.getPartyLedger:', err);
        res.status(500).json({ error: err.message });
    }
};
