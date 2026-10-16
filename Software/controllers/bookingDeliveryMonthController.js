const { sql, getPool } = require('../config/db');
const { setDeliveryMonth } = require('../services/bookingDeliveryMonthService');
exports.update = async (req, res) => {
    if (!Object.hasOwn(req.body || {}, 'PromisedDeliveryMonth') || !Object.hasOwn(req.body || {}, 'ExpectedMonth'))
        return res.status(400).json({ error: 'PromisedDeliveryMonth and ExpectedMonth are required (use null when not set).' });
    let tx;
    try {
        tx = new sql.Transaction(await getPool());
        await tx.begin();
        const result = await setDeliveryMonth(tx, { bookingId: Number(req.params.id), month: req.body.PromisedDeliveryMonth,
            expectedMonth: req.body.ExpectedMonth, reason: req.body.Reason, user: req.user });
        await tx.commit();
        res.json(result);
    } catch (err) {
        if (tx) { try { await tx.rollback(); } catch (_) {} }
        res.status(err.status || 500).json({ error: err.message });
    }
};
