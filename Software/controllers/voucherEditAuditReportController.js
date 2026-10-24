const { sql, getPool } = require('../config/db');
const { filters, like, reportQuery, formatEvent } = require('../services/voucherEditAuditReportService');

exports.report = async (req, res) => {
    let f;
    try { f = filters(req.query); } catch (error) { return res.status(400).json({ error: error.message }); }
    try {
        const pool = await getPool(), request = pool.request();
        for (const key of ['from', 'to', 'legacyFrom', 'legacyTo']) request.input(key, sql.DateTime2, f[key]);
        if (f.voucherNo) request.input('voucherNo', sql.NVarChar(102), like(f.voucherNo));
        if (f.changedBy) request.input('changedBy', sql.NVarChar(202), like(f.changedBy));
        if (f.action) request.input('action', sql.NVarChar(40), f.action);
        const result = await request.query(reportQuery(f)), rows = result.recordset.map(formatEvent);
        res.json({ rows, from: f.fromDay, to: f.toDay, totals: { edits: rows.length,
            vouchers: new Set(rows.map(row => row.VoucherID)).size,
            users: new Set(rows.filter(row => row.ChangedBy > 0).map(row => row.ChangedBy)).size,
            legacyDateOnly: rows.filter(row => row.Action === 'LEGACY_DATE_CHANGE').length },
            basis: 'Filters use the actual edit date in Pakistan time. Includes saved voucher edits and available earlier date-only records.' });
    } catch (error) {
        console.error('voucherEditAuditReport:', error);
        res.status(error.number === 208 ? 503 : 500).json({ error: error.number === 208
            ? 'Voucher edit history is not installed. Apply migration 158_voucher_edit_history.sql.' : error.message });
    }
};
