const { sql } = require('../config/db');

const DELIVERY_LOCK_MESSAGE = 'This vehicle has been delivered. Editing, deletion and reallocation are locked.';
// SQL arguments are application-owned expressions, never request text.
function vehicleDeliveryLockedSql(alias = 'v') {
    return `(${alias}.Status IN ('Delivered','Sold') OR ${alias}.SoldDeliveredAt IS NOT NULL OR EXISTS (
        SELECT 1 FROM dms_SalesBookings deliveredBooking
        WHERE deliveredBooking.AllocatedVehicleID=${alias}.VehicleID
          AND (deliveredBooking.GatePassIssuedAt IS NOT NULL OR EXISTS (
              SELECT 1 FROM dms_GatePasses pass WHERE pass.DocType='BOOKING' AND pass.DocID=deliveredBooking.BookingID))))`;
}
const fail = (message, statusCode = 423) => { throw Object.assign(new Error(message), { statusCode }); };

async function markVehicleDelivered(tx, { vehicleId, bookingId, user }) {
    const row = (await new sql.Request(tx).input('vid', sql.Int, vehicleId)
        .query('SELECT VehicleID,Status,CurrentBookingID,SoldDeliveredAt FROM dms_Vehicle WITH (UPDLOCK,HOLDLOCK) WHERE VehicleID=@vid')).recordset[0];
    if (!row) fail('Allocated vehicle not found.', 409);
    if (row.CurrentBookingID && row.CurrentBookingID !== bookingId) fail('The vehicle now belongs to another booking.', 409);
    if (row.Status === 'Delivered' && row.CurrentBookingID === bookingId) return;
    if (['Delivered','Sold'].includes(row.Status) || row.SoldDeliveredAt) fail(DELIVERY_LOCK_MESSAGE);
    if (row.Status === 'Returned') fail('A returned vehicle cannot be delivered.', 409);
    await new sql.Request(tx).input('vid', sql.Int, vehicleId).input('bid', sql.Int, bookingId)
        .input('by', sql.Int, user?.employeeId || null).input('name', sql.NVarChar(100), user?.userName || 'system')
        .query(`IF NOT EXISTS (SELECT 1 FROM dms_GatePasses WHERE DocType='BOOKING' AND DocID=@bid)
                    THROW 51063,'A gate pass must exist before the vehicle is delivered.',1;
                UPDATE dms_Vehicle SET Status='Delivered',SoldDeliveredAt=COALESCE(SoldDeliveredAt,GETDATE()),
                    CurrentBookingID=@bid,UpdatedAt=GETDATE(),UpdatedByEmployeeID=@by,UpdatedByName=@name
                WHERE VehicleID=@vid;
                UPDATE dms_OpenAllocationLedger SET Status='Sold',SoldAt=COALESCE(SoldAt,GETDATE()),SoldToBookingID=@bid
                WHERE VehicleID=@vid AND Status='AtDealer';`);
}
module.exports = { vehicleDeliveryLockedSql, markVehicleDelivered, DELIVERY_LOCK_MESSAGE };
