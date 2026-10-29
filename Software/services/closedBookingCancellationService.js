const { sql } = require('../config/db');

const isMainAdmin = user => user?.groupId === 1;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const requireMainAdmin = (req, res, next) => isMainAdmin(req.user)
    ? next() : res.status(403).json({ error: 'Only the main Administrator can cancel a closed booking.' });

// Administrative status correction. Financial, incentive, allocation and
// delivery records are deliberately outside this operation.
async function cancelClosedBooking(tx, { bookingId, reason, user }) {
    if (!isMainAdmin(user)) fail('Only the main Administrator can cancel a closed booking.', 403);
    if (!Number.isInteger(user.userId) || !user.userName) fail('An authenticated Administrator is required.', 401);
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || bookingId > 2147483647) fail('Invalid booking ID.');
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500)
        fail('Enter a cancellation reason of 5 to 500 characters.');
    reason = reason.trim();

    const booking = (await new sql.Request(tx).input('id', sql.Int, bookingId)
        .query(`SELECT BookingID,Status,CancelledAt,CancellationReason
                FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK) WHERE BookingID=@id`)).recordset[0];
    if (!booking) fail('Booking not found.', 404);
    if (booking.Status !== 'Closed') fail(`Only a closed booking can use this action (currently ${booking.Status}). Refresh the booking.`, 409);

    const changed = (await new sql.Request(tx).input('id', sql.Int, bookingId)
        .input('reason', sql.NVarChar(500), reason).input('emp', sql.Int, user.employeeId || null)
        .input('name', sql.NVarChar(100), user.userName)
        .query(`DECLARE @changed TABLE (CancelledAt DATETIME);
                UPDATE dms_SalesBookings SET Status='Cancelled',CancelledAt=GETDATE(),CancellationReason=@reason,
                    UpdatedAt=GETDATE(),UpdatedByEmployeeID=@emp,UpdatedByName=@name
                OUTPUT INSERTED.CancelledAt INTO @changed
                WHERE BookingID=@id AND Status='Closed';
                SELECT CancelledAt FROM @changed;`)).recordset[0];
    if (!changed) fail('The booking changed. Refresh it before cancelling.', 409);

    const oldValue = { Status: booking.Status, CancelledAt: booking.CancelledAt, CancellationReason: booking.CancellationReason };
    const newValue = { Status: 'Cancelled', CancelledAt: changed.CancelledAt, CancellationReason: reason };
    // Strict audit writes: a failed audit or timeline insert rolls back the status.
    await new sql.Request(tx).input('id', sql.Int, bookingId)
        .input('old', sql.NVarChar(sql.MAX), JSON.stringify(oldValue)).input('next', sql.NVarChar(sql.MAX), JSON.stringify(newValue))
        .input('emp', sql.Int, user.employeeId || null).input('uid', sql.Int, user.userId)
        .input('name', sql.NVarChar(100), user.userName).input('reason', sql.NVarChar(500), reason)
        .query(`INSERT INTO dms_SalesAuditLog
                    (BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorEmployeeID,ActorUserID,ActorName,Notes)
                VALUES(@id,'Booking',@id,'ClosedBookingCancelled',@old,@next,@emp,@uid,@name,@reason)`);
    await new sql.Request(tx).input('id', sql.Int, bookingId)
        .input('emp', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName)
        .input('role', sql.NVarChar(50), user.groupTitle || 'Administrator')
        .input('reason', sql.NVarChar(sql.MAX), `Administrator cancelled closed booking. Financial and delivery records retained. Reason: ${reason}`)
        .query(`INSERT INTO dms_BookingStateTransitions(BookingID,FromState,ToState,ActorEmployeeID,ActorName,ActorRole,Reason)
                VALUES(@id,'Closed','Cancelled',@emp,@name,@role,@reason)`);
    return { Status: 'Cancelled', message: 'Closed booking cancelled. Financial and delivery records are unchanged.' };
}

module.exports = { isMainAdmin, requireMainAdmin, cancelClosedBooking };
