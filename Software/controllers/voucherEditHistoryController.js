const { sql, getPool } = require('../config/db');

function historyDay(value) {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use dates in YYYY-MM-DD format.');
    const calendar = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value)
        throw new Error('Invalid history date.');
    return new Date(`${value}T00:00:00+05:00`);
}

exports.getVoucherEditHistory = async (req, res) => {
    try {
        const id = req.params.id == null ? null : Number(req.params.id);
        const offset = Number(req.query.offset || 0);
        const limit = Number(req.query.limit || 10);
        if ((id !== null && (!Number.isSafeInteger(id) || id <= 0))
            || !Number.isSafeInteger(offset) || offset < 0
            || !Number.isInteger(limit) || limit < 1 || limit > 25) {
            return res.status(400).json({ error: 'Invalid voucher ID or pagination.' });
        }
        let from, to;
        try {
            from = historyDay(req.query.from);
            to = historyDay(req.query.to);
        } catch (err) { return res.status(400).json({ error: err.message }); }
        if (from && to && from > to) return res.status(400).json({ error: 'From date must not be after To date.' });
        const voucherNo = String(req.query.voucherNo || '').trim().slice(0, 50);
        const changedBy = String(req.query.changedBy || '').trim().slice(0, 100);
        const pool = await getPool();
        const request = pool.request();
        const where = [];
        if (id !== null) { request.input('id', sql.Int, id); where.push('VoucherID=@id'); }
        if (voucherNo) { request.input('no', sql.NVarChar(102), `%${voucherNo}%`); where.push('VoucherNo LIKE @no'); }
        if (changedBy) { request.input('by', sql.NVarChar(202), `%${changedBy}%`); where.push('ChangedByName LIKE @by'); }
        if (from) { request.input('from', sql.DateTime2, from); where.push('ChangedAt>=@from'); }
        if (to) { request.input('to', sql.DateTime2, new Date(to.getTime() + 86400000)); where.push('ChangedAt<@to'); }
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const count = await request.query(`SELECT COUNT(*) AS Total FROM dms_VoucherEditHistory ${clause}`);
        request.input('offset', sql.Int, offset).input('limit', sql.Int, limit);
        const data = await request.query(`SELECT EditID, VoucherID, VoucherNo, Action, Reason,
            ChangedBy, ChangedByName, ChangedAt, BeforeJSON, AfterJSON
            FROM dms_VoucherEditHistory ${clause}
            ORDER BY EditID DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
        res.json({ total: count.recordset[0].Total, offset, limit, rows: data.recordset.map(row => {
            const { BeforeJSON, AfterJSON, ...metadata } = row;
            return { ...metadata, Before: JSON.parse(BeforeJSON), After: JSON.parse(AfterJSON) };
        }) });
    } catch (err) {
        console.error('getVoucherEditHistory:', err);
        res.status(err.number === 208 ? 503 : 500).json({ error: err.number === 208
            ? 'Voucher edit history is not installed. Apply migration 158_voucher_edit_history.sql.' : err.message });
    }
};
