const { sql, getPool } = require('../config/db');
const { setBookingDate } = require('../services/bookingDateService');
exports.update = async (req, res) => {
    if (!Object.hasOwn(req.body || {}, 'BookingDate') || !Object.hasOwn(req.body || {}, 'ExpectedDate'))
        return res.status(400).json({ error: 'BookingDate and ExpectedDate are required. Refresh the booking form before saving.' });
    let tx;
    try {
        tx = new sql.Transaction(await getPool()); await tx.begin();
        const result = await setBookingDate(tx, { bookingId: Number(req.params.id), date: req.body.BookingDate,
            expectedDate: req.body.ExpectedDate, reason: req.body.Reason, user: req.user });
        await tx.commit();
        res.json({ ...result, message: result.changed ? 'Booking date updated.' : 'Booking date is unchanged.' });
    } catch (error) {
        if (tx) { try { await tx.rollback(); } catch (_) {} }
        res.status(error.status || 500).json({ error: error.message });
    }
};
