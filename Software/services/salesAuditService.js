/**
 * Sales Module — canonical audit log writer.
 *
 * Every state transition, every approval, every cancellation, every override
 * should flow through this helper. Existing dms_BookingStateTransitions stays
 * as the booking-state-only narrow log; dms_SalesAuditLog captures the wider
 * universe (incentive overrides, recovery write-offs, etc.) per §23.
 *
 * Usage (inside an open transaction):
 *   await logAudit(tx, {
 *       bookingId, entityType: 'Booking', entityId: bookingId,
 *       action: 'AllocateVehicle', oldValue: 'BookingConfirmed', newValue: 'Allocated',
 *       actor: req.user, notes: 'Chassis X assigned',
 *   });
 *
 * Fire-and-forget safety: this never throws — failures log a console warning
 * so the parent business action doesn't fail because of a stale audit row.
 */
const { sql } = require('../config/db');

async function logAudit(tx, {
    bookingId = null, entityType, entityId, action,
    oldValue = null, newValue = null,
    actor = null, notes = null,
}) {
    if (!entityType || !entityId || !action) {
        console.warn('[salesAudit] missing required field — skipping');
        return;
    }
    try {
        await new sql.Request(tx)
            .input('bid',  sql.Int,            bookingId)
            .input('et',   sql.NVarChar(40),   entityType)
            .input('eid',  sql.Int,            Number(entityId))
            .input('act',  sql.NVarChar(60),   action)
            .input('ov',   sql.NVarChar(sql.MAX), normaliseValue(oldValue))
            .input('nv',   sql.NVarChar(sql.MAX), normaliseValue(newValue))
            .input('aeId', sql.Int,            actor?.employeeId || null)
            .input('aN',   sql.NVarChar(100),  actor?.userName || null)
            .input('aUId', sql.Int,            actor?.userId || null)
            .input('nts',  sql.NVarChar(500),  notes || null)
            .query(`INSERT INTO dms_SalesAuditLog
                        (BookingID, EntityType, EntityID, Action, OldValue, NewValue,
                         ActorEmployeeID, ActorName, ActorUserID, Notes)
                    VALUES (@bid, @et, @eid, @act, @ov, @nv, @aeId, @aN, @aUId, @nts)`);
    } catch (err) {
        console.warn('[salesAudit] insert failed:', err.message);
    }
}

function normaliseValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return String(v); }
}

module.exports = { logAudit };
