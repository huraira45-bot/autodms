const { sql, getPool } = require('../config/db');
const { logBookingTransition } = require('./salesBookingController');
const { applyVoucherFilters } = require('../services/historicalVoucherSearchService');
const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
const id = (value, name) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) fail('Invalid ' + name + '.', 400);
    return parsed;
};
async function booking(executor, bookingId, lock = false) {
    const result = await new sql.Request(executor).input('bid', sql.Int, bookingId).query(`
        SELECT BookingID, BookingNo, Status, IsHistorical FROM dms_SalesBookings
        ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} WHERE BookingID=@bid`);
    const row = result.recordset[0];
    if (!row) fail('Booking not found.', 404);
    if (!row.IsHistorical) fail('Voucher references are available only on historical bookings.');
    return row;
}

exports.types = async (_req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`SELECT DISTINCT LTRIM(RTRIM(Title)) AS VoucherTypeCode
            FROM GLVoucherType WHERE NULLIF(LTRIM(RTRIM(Title)),'') IS NOT NULL ORDER BY VoucherTypeCode`);
        res.json(result.recordset);
    } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
};

// Any status, account or source is allowed here: these are document references.
exports.search = async (req, res) => {
    try {
        const bookingId = id(req.params.id, 'booking');
        if (!String(req.query.search || '').trim() && !String(req.query.voucherType || '').trim())
            fail('Enter a voucher number or select a voucher type.', 400);
        const pool = await getPool();
        await booking(pool, bookingId);
        const request = pool.request();
        const filters = applyVoucherFilters(request, req.query, true);
        request.input('exact', sql.NVarChar(100), String(req.query.search || '').trim());
        const result = await request.query(`SELECT TOP 50 v.VoucherID,v.VoucherNo,v.VoucherDate,
            v.TotalAmount,v.Status,v.Remarks,vt.Title AS VoucherType
            FROM data_FinanceVoucherInfo v LEFT JOIN GLVoucherType vt ON vt.Voucherid=v.VoucherTypeID
            WHERE 1=1 ${filters}
            ORDER BY CASE WHEN v.VoucherNo=@exact THEN 0 ELSE 1 END,v.VoucherDate DESC,v.VoucherID DESC`);
        res.json({ vouchers: result.recordset, limit: 50 });
    } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
};

exports.list = async (req, res) => {
    try {
        const bookingId = id(req.params.id, 'booking'), pool = await getPool();
        await booking(pool, bookingId);
        const result = await pool.request().input('bid', sql.Int, bookingId).query(`
            SELECT r.ReferenceID,r.ReferenceKind,r.PaymentID,r.LinkedAt,r.LinkedByName,
                v.VoucherID,v.VoucherNo,v.VoucherDate,v.TotalAmount,v.Status,vt.Title AS VoucherType
            FROM dms_HistoricalVoucherReferences r
            JOIN data_FinanceVoucherInfo v ON v.VoucherID=r.VoucherID
            LEFT JOIN GLVoucherType vt ON vt.Voucherid=v.VoucherTypeID
            WHERE r.BookingID=@bid ORDER BY r.LinkedAt DESC,r.ReferenceID DESC`);
        res.json(result.recordset);
    } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
};

exports.add = async (req, res) => {
    let tx;
    try {
        const bookingId = id(req.params.id, 'booking'), voucherId = id(req.body?.VoucherID, 'voucher');
        const kind = req.body?.ReferenceKind || 'BOOKING';
        if (!['BOOKING','CUSTOMER','MASTER'].includes(kind)) fail('Invalid reference kind.', 400);
        const paymentId = kind === 'CUSTOMER' ? id(req.body?.PaymentID, 'payment') : null;
        if (kind !== 'CUSTOMER' && req.body?.PaymentID != null) fail('Only a customer reference can specify a payment.', 400);
        const pool = await getPool();
        tx = new sql.Transaction(pool); await tx.begin();
        const row = await booking(tx, bookingId, true);
        if (paymentId) {
            const payment = await new sql.Request(tx).input('pid', sql.Int, paymentId).input('bid', sql.Int, bookingId)
                .query('SELECT PaymentID FROM dms_SalesPayments WHERE PaymentID=@pid AND BookingID=@bid');
            if (!payment.recordset.length) fail('That payment does not belong to this booking.', 404);
        }
        const source = await new sql.Request(tx).input('vid', sql.Int, voucherId)
            .query('SELECT VoucherNo FROM data_FinanceVoucherInfo WITH (UPDLOCK,HOLDLOCK) WHERE VoucherID=@vid');
        if (!source.recordset.length) fail('Voucher not found.', 404);
        const duplicate = await new sql.Request(tx).input('bid', sql.Int, bookingId).input('vid', sql.Int, voucherId)
            .input('kind', sql.NVarChar(10), kind).input('pid', sql.Int, paymentId).query(`
                SELECT ReferenceID FROM dms_HistoricalVoucherReferences
                WHERE BookingID=@bid AND VoucherID=@vid AND ReferenceKind=@kind
                    AND (PaymentID=@pid OR (PaymentID IS NULL AND @pid IS NULL))`);
        if (duplicate.recordset.length) fail('This voucher is already attached as a reference here.');
        const result = await new sql.Request(tx).input('bid', sql.Int, bookingId).input('vid', sql.Int, voucherId)
            .input('kind', sql.NVarChar(10), kind).input('pid', sql.Int, paymentId)
            .input('name', sql.NVarChar(100), req.user?.userName || null).query(`
                INSERT INTO dms_HistoricalVoucherReferences (BookingID,VoucherID,ReferenceKind,PaymentID,LinkedByName)
                OUTPUT INSERTED.ReferenceID VALUES (@bid,@vid,@kind,@pid,@name)`);
        await logBookingTransition(tx, bookingId, row.Status, row.Status, req.user,
            `Voucher ${source.recordset[0].VoucherNo} attached as ${kind.toLowerCase()} reference${paymentId ? ' for payment #' + paymentId : ''}. Payment and Master totals unchanged.`);
        await tx.commit();
        res.status(201).json({ ReferenceID: result.recordset[0].ReferenceID, message: 'Voucher attached as a reference. Payment totals unchanged.' });
    } catch (err) {
        if (tx) { try { await tx.rollback(); } catch {} }
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

exports.remove = async (req, res) => {
    let tx;
    try {
        const bookingId = id(req.params.id, 'booking'), referenceId = id(req.params.referenceId, 'reference');
        const pool = await getPool(); tx = new sql.Transaction(pool); await tx.begin();
        const row = await booking(tx, bookingId, true);
        const removed = await new sql.Request(tx).input('bid', sql.Int, bookingId).input('rid', sql.Int, referenceId)
            .query('DELETE FROM dms_HistoricalVoucherReferences OUTPUT DELETED.VoucherID WHERE BookingID=@bid AND ReferenceID=@rid');
        if (!removed.recordset.length) fail('Reference not found on this booking.', 404);
        await logBookingTransition(tx, bookingId, row.Status, row.Status, req.user,
            `Voucher reference #${referenceId} removed (voucher ${removed.recordset[0].VoucherID}). Payment and Master totals unchanged.`);
        await tx.commit(); res.json({ message: 'Reference removed. Payment totals unchanged.' });
    } catch (err) {
        if (tx) { try { await tx.rollback(); } catch {} }
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};
