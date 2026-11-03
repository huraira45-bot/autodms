const snapshots = require('./salarySheetSnapshotService');

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function requireAdmin(req, res, next) {
    if (Number(req.user?.groupId) === 1) return next();
    return res.status(403).json({ error: 'Only the main Administrator can lock or unlock salary months.' });
}

// Caller owns the transaction. Never modifies snapshots, vouchers or salary figures.
async function setMonthLock(tx, { monthId, locked, reason, user, expectedControlId, buildLiveSheet }) {
    if (Number(user?.groupId) !== 1) fail('Only the main Administrator can lock or unlock salary months.', 403);
    snapshots.validateMonth(monthId);
    if (monthId < snapshots.CONTROL_FROM_MONTH) fail('Salary lock controls apply from October 2026 onward. Earlier sheets remain protected.');
    if (typeof locked !== 'boolean') fail('Locked must be true or false.');
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) fail('Enter a reason between 5 and 500 characters.');
    if (expectedControlId === undefined) fail('Refresh the sheet before changing its lock.');
    await snapshots.lockMonth(tx, monthId);
    const current = await snapshots.getControl(tx, monthId);
    if (String(current?.ControlID ?? '') !== String(expectedControlId ?? '')) fail('This month changed. Refresh the sheet and try again.', 409);
    const saved = await snapshots.getSnapshot(tx, monthId);
    const postings = await snapshots.getPostings(tx, monthId);
    if (!locked && postings.some(p => p.VoucherStatus !== 'Reversed')) {
        fail('Reverse all active salary accrual and payment vouchers for this month before unlocking it. A missing voucher also blocks unlocking.', 409);
    }
    if ((locked && saved) || (!locked && current?.Action === 'UNLOCK')) return { monthId, locked, changed: false };
    if (locked) {
        const sheet = await buildLiveSheet(tx, monthId);
        await snapshots.appendControl(tx, monthId, 'LOCK', sheet, user, 'MANUAL', null, reason.trim());
    } else {
        await snapshots.appendControl(tx, monthId, 'UNLOCK', null, user, null, null, reason.trim());
    }
    return { monthId, locked, changed: true, message: locked ? 'Salary month locked. Saved figures are preserved.' : 'Salary month unlocked. Original saved sheets remain in history.' };
}

module.exports = { requireAdmin, setMonthLock };
