// Charity tracker — side ledger of every 1% accrual.
// Owner ask 2026-07-18. Read-only endpoints; writes happen implicitly from
// paymentController (on receive) and accountController (voucher checkbox).
// Both are gated in the route layer on `charity_view`.
const { sql, getPool } = require('../config/db');

// GET /api/charity/entries?from&to&source
//   from / to : YYYY-MM-DD (inclusive)
//   source    : RECEIVE_PAYMENT_1PCT | MANUAL_VOUCHER_1PCT | ALL (default)
// Returns { rows, total } — payload shape matches what ReportShell's
// client-side pagination expects.
exports.listEntries = async (req, res) => {
    try {
        const { from, to, source } = req.query;
        const pool = await getPool();
        const request = pool.request();
        const where = [];
        if (from) { request.input('from', sql.DateTime, new Date(from));            where.push('ct.CreatedAt >= @from'); }
        if (to)   { request.input('to',   sql.DateTime, new Date(to + ' 23:59:59')); where.push('ct.CreatedAt <= @to'); }
        if (source && source !== 'ALL') {
            request.input('src', sql.NVarChar(40), source);
            where.push('ct.SourceType = @src');
        }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

        // Party name is looked up from the FIRST detail line that carries a
        // PartyID — receive-payment writes the customer PartyID on the credit
        // leg, manual JVs may or may not tag one.
        const r = await request.query(`
            SELECT ct.CharityID,
                   ct.CreatedAt,
                   ct.SourceType,
                   ct.VoucherAmount,
                   ct.CharityAmount,
                   ct.Note,
                   ct.CreatedByName,
                   v.VoucherID,
                   v.VoucherNo,
                   v.VoucherDate,
                   v.Remarks,
                   vt.Title AS VoucherTypeCode,
                   (
                       SELECT TOP 1 p.PartyName
                       FROM   data_FinanceVoucherDetail d
                       JOIN   gen_PartiesInfo           p ON p.PartyID = d.PartyID
                       WHERE  d.VoucherID = v.VoucherID AND d.PartyID IS NOT NULL
                   ) AS PartyName
            FROM   dms_CharityTracking ct
            LEFT   JOIN data_FinanceVoucherInfo v  ON v.VoucherID     = ct.VoucherID
            LEFT   JOIN GLVoucherType           vt ON vt.Voucherid    = v.VoucherTypeID
            ${whereSql}
            ORDER  BY ct.CreatedAt DESC, ct.CharityID DESC
        `);
        const rows = r.recordset;
        // KPI summary in the same payload so ReportShell's single fetch feeds
        // both the summary strip and the paginated table.
        const totalOwed    = rows.reduce((s, x) => s + (Number(x.CharityAmount) || 0), 0);
        const receiveCount = rows.filter(x => x.SourceType === 'RECEIVE_PAYMENT_1PCT').length;
        const manualCount  = rows.filter(x => x.SourceType === 'MANUAL_VOUCHER_1PCT').length;
        res.json({
            rows,
            total: rows.length,
            summary: {
                totalOwed:    +totalOwed.toFixed(2),
                entryCount:   rows.length,
                receiveCount,
                manualCount,
            },
        });
    } catch (err) {
        console.error('charity.listEntries:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/charity/summary?from&to
// KPI strip: totalOwed, entryCount, receiveCount, manualCount.
exports.summary = async (req, res) => {
    try {
        const { from, to } = req.query;
        const pool = await getPool();
        const request = pool.request();
        const where = [];
        if (from) { request.input('from', sql.DateTime, new Date(from));            where.push('CreatedAt >= @from'); }
        if (to)   { request.input('to',   sql.DateTime, new Date(to + ' 23:59:59')); where.push('CreatedAt <= @to'); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const r = await request.query(`
            SELECT ISNULL(SUM(CharityAmount), 0) AS totalOwed,
                   COUNT(*)                      AS entryCount,
                   SUM(CASE WHEN SourceType = 'RECEIVE_PAYMENT_1PCT' THEN 1 ELSE 0 END) AS receiveCount,
                   SUM(CASE WHEN SourceType = 'MANUAL_VOUCHER_1PCT'  THEN 1 ELSE 0 END) AS manualCount
            FROM   dms_CharityTracking
            ${whereSql}
        `);
        res.json(r.recordset[0]);
    } catch (err) {
        console.error('charity.summary:', err);
        res.status(500).json({ error: err.message });
    }
};
