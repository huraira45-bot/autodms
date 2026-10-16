const { sql } = require('../config/db');
const EDIT_ROLES = ['sales_executive', 'sales_agm', 'sales_gm', 'sales_admin_settings'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

function parseDeliveryMonth(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value))
        fail('Promised delivery month must be YYYY-MM, or blank if not set.');
    return new Date(`${value}-01T00:00:00.000Z`);
}
function deliveryMonthKey(value) {
    if (!value) return null;
    return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 7);
}

async function setDeliveryMonth(tx, { bookingId, month, expectedMonth, reason, user }) {
    if (!EDIT_ROLES.some(role => user?.modules?.includes(role))) fail('Sales booking edit permission is required.', 403);
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) fail('Invalid booking ID.');
    const next = parseDeliveryMonth(month), expected = parseDeliveryMonth(expectedMonth);
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500)
        fail('Enter a reason of 3 to 500 characters.');
    const result = await new sql.Request(tx).input('id', sql.Int, bookingId)
        .query(`SELECT BookingID,Status,PromisedDeliveryMonth FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK) WHERE BookingID=@id`);
    const booking = result.recordset[0];
    if (!booking) fail('Booking not found.', 404);
    const oldMonth = deliveryMonthKey(booking.PromisedDeliveryMonth), nextMonth = deliveryMonthKey(next);
    if (oldMonth !== deliveryMonthKey(expected)) fail('The promised month changed. Refresh the booking and try again.', 409);
    if (oldMonth === nextMonth) return { changed: false, PromisedDeliveryMonth: nextMonth };
    await new sql.Request(tx).input('id', sql.Int, bookingId).input('month', sql.Date, next)
        .input('emp', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName)
        .query(`UPDATE dms_SalesBookings SET PromisedDeliveryMonth=@month,
                UpdatedAt=GETDATE(),UpdatedByEmployeeID=@emp,UpdatedByName=@name WHERE BookingID=@id`);
    await new sql.Request(tx).input('id', sql.Int, bookingId)
        .input('old', sql.NVarChar(sql.MAX), JSON.stringify({ PromisedDeliveryMonth: oldMonth }))
        .input('next', sql.NVarChar(sql.MAX), JSON.stringify({ PromisedDeliveryMonth: nextMonth }))
        .input('emp', sql.Int, user.employeeId || null).input('uid', sql.Int, user.userId || null)
        .input('name', sql.NVarChar(100), user.userName).input('reason', sql.NVarChar(500), reason.trim())
        .query(`INSERT INTO dms_SalesAuditLog
                    (BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorEmployeeID,ActorUserID,ActorName,Notes)
                VALUES (@id,'Booking',@id,'PromisedDeliveryMonthChanged',@old,@next,@emp,@uid,@name,@reason)`);
    await new sql.Request(tx).input('id', sql.Int, bookingId).input('status', sql.NVarChar(30), booking.Status)
        .input('emp', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName)
        .input('role', sql.NVarChar(50), user.groupTitle || null)
        .input('reason', sql.NVarChar(sql.MAX), `Promised delivery month: ${oldMonth || 'not set'} → ${nextMonth || 'not set'}. ${reason.trim()}`)
        .query(`INSERT INTO dms_BookingStateTransitions
                    (BookingID,FromState,ToState,ActorEmployeeID,ActorName,ActorRole,Reason)
                VALUES (@id,@status,@status,@emp,@name,@role,@reason)`);
    return { changed: true, PromisedDeliveryMonth: nextMonth };
}
module.exports = { parseDeliveryMonth, deliveryMonthKey, setDeliveryMonth, EDIT_ROLES };
