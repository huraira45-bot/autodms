const { sql, getPool } = require('../config/db');
const { isMainAdmin, cancelClosedBooking } = require('../services/closedBookingCancellationService');

exports.cancel = async (req, res) => {
    if (!isMainAdmin(req.user)) return res.status(403).json({ error: 'Only the main Administrator can cancel a closed booking.' });
    let tx;
    try {
        tx = new sql.Transaction(await getPool());
        await tx.begin();
        const result = await cancelClosedBooking(tx, {
            bookingId: Number(req.params.id), reason: req.body?.Reason, user: req.user,
        });
        await tx.commit();
        res.json(result);
    } catch (error) {
        if (tx) { try { await tx.rollback(); } catch (_) {} }
        res.status(error.status || 500).json({ error: error.message });
    }
};
