const { sql, getPool } = require('../config/db');
const { applyBookingDiscount } = require('../services/salesBookingDiscountService');
const { setMasterAgreedAmount } = require('../services/salesMasterAgreementService');
exports.apply = async (req, res) => {
    let tx;
    try {
        tx = new sql.Transaction(await getPool());
        await tx.begin();
        const result = await applyBookingDiscount(tx, { bookingId: Number(req.params.id),
            amount: req.body?.DiscountAmount, expectedPrice: req.body?.ExpectedNegotiatedPrice,
            reason: req.body?.Reason, user: req.user });
        await tx.commit(); res.json(result);
    } catch (err) {
        if (tx) { try { await tx.rollback(); } catch (_) {} }
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};
exports.setMasterAmount = async (req, res) => {
    let tx;
    try {
        tx = new sql.Transaction(await getPool()); await tx.begin();
        const result = await setMasterAgreedAmount(tx, { bookingId: Number(req.params.id),
            amount: req.body?.Amount, expectedAmount: req.body?.ExpectedMasterAmount, reason: req.body?.Reason, user: req.user });
        await tx.commit(); res.json(result);
    } catch (err) {
        if (tx) { try { await tx.rollback(); } catch (_) {} }
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};
