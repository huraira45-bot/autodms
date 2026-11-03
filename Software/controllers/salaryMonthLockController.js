const { sql, getPool } = require('../config/db');
const { setMonthLock } = require('../services/salaryMonthLockService');
const salary = require('./hrSalaryController');

exports.update = async (req, res) => {
    let tx;
    try {
        tx = new sql.Transaction(await getPool());
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const result = await setMonthLock(tx, { monthId: req.params.monthId, locked: req.body?.Locked,
            reason: req.body?.Reason, expectedControlId: req.body?.ExpectedControlID,
            user: req.user, buildLiveSheet: salary._buildLiveSheet });
        await tx.commit();
        res.json(result);
    } catch (error) {
        if (tx) { try { await tx.rollback(); } catch {} }
        res.status(error.status || 500).json({ error: error.message });
    }
};
