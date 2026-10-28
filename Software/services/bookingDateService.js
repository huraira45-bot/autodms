const { sql } = require('../config/db');
const { canChangeBookingDate } = require('./bookingDatePermissionService');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const dayKey = value => value == null ? null : (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
function parseBookingDate(value) {
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) fail('Booking date must be YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || dayKey(date) !== value) fail('Choose a valid booking date.');
    if (value < '1753-01-01') fail('Booking date must be on or after 1753-01-01.');
    return date;
}
async function setBookingDate(tx, { bookingId, date, expectedDate, reason, user, now = new Date() }) {
    if (!canChangeBookingDate(user)) fail('Changing booking dates requires the Administrator role and Change Booking Date admin right.', 403);
    if (!Number.isInteger(user?.userId) || !user?.userName) fail('An authenticated user is required.', 401);
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || bookingId > 2147483647) fail('Invalid booking ID.');
    const next = parseBookingDate(date), expected = expectedDate === null ? null : dayKey(parseBookingDate(expectedDate));
    const today = new Date(now.getTime() + 300 * 60000).toISOString().slice(0, 10);
    if (date > today) fail('A booking cannot be dated in the future.');
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) fail('Enter a reason of 3 to 500 characters.');
    const result = await new sql.Request(tx).input('id', sql.Int, bookingId)
        .query('SELECT BookingID,Status,BookingDate,CreatedAt FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK) WHERE BookingID=@id');
    const booking = result.recordset[0];
    if (!booking) fail('Booking not found.', 404);
    const previous = dayKey(booking.BookingDate), effective = previous || dayKey(booking.CreatedAt);
    if (previous !== expected) fail('The booking date changed. Refresh the booking before saving.', 409);
    if (previous === date) return { changed: false, BookingDate: date };
    await new sql.Request(tx).input('id', sql.Int, bookingId).input('date', sql.Date, next)
        .input('emp', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName)
        .query(`UPDATE dms_SalesBookings SET BookingDate=@date,
            UpdatedAt=GETDATE(),UpdatedByEmployeeID=@emp,UpdatedByName=@name WHERE BookingID=@id`);
    await new sql.Request(tx).input('id', sql.Int, bookingId)
        .input('old', sql.NVarChar(sql.MAX), JSON.stringify({ BookingDate: previous, EffectiveBookingDate: effective }))
        .input('next', sql.NVarChar(sql.MAX), JSON.stringify({ BookingDate: date, EffectiveBookingDate: date }))
        .input('emp', sql.Int, user.employeeId || null).input('uid', sql.Int, user.userId)
        .input('name', sql.NVarChar(100), user.userName).input('reason', sql.NVarChar(500), reason.trim())
        .query(`INSERT INTO dms_SalesAuditLog (BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorEmployeeID,ActorUserID,ActorName,Notes)
            VALUES (@id,'Booking',@id,'BookingDateChanged',@old,@next,@emp,@uid,@name,@reason)`);
    await new sql.Request(tx).input('id', sql.Int, bookingId).input('state', sql.NVarChar(30), booking.Status)
        .input('emp', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName)
        .input('role', sql.NVarChar(50), user.groupTitle || null)
        .input('reason', sql.NVarChar(sql.MAX), `Booking date: ${effective || 'not set'} → ${date}. ${reason.trim()}`)
        .query(`INSERT INTO dms_BookingStateTransitions (BookingID,FromState,ToState,ActorEmployeeID,ActorName,ActorRole,Reason)
            VALUES (@id,@state,@state,@emp,@name,@role,@reason)`);
    return { changed: true, BookingDate: date };
}
module.exports = { parseBookingDate, dayKey, setBookingDate };
