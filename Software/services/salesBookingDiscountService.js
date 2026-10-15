const { sql } = require('../config/db');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const DISCOUNT_STATES = ['PendingBookingPayment', 'BookingConfirmed', 'PendingPayment', 'Allocated',
    'MasterInvoicePending', 'MasterInvoicePosted', 'ReadyForDelivery', 'DeliveryApproved'];

function cents(value) {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
        fail('Enter an amount with up to two decimal places.');
    }
    const result = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(result) || result <= 0) fail('Enter a positive, valid amount.');
    return result;
}

async function applyBookingDiscount(tx, { bookingId, amount, expectedPrice, reason, user }) {
    if (!user?.modules?.includes('sales_admin_pricing')) fail('Sales Pricing Admin permission is required.', 403);
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) fail('Invalid booking.');
    const reduction = cents(amount), expected = cents(expectedPrice);
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
        fail('Enter a discount reason between 5 and 500 characters.');
    }
    const result = await new sql.Request(tx).input('bid', sql.Int, bookingId)
        .query('SELECT * FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK) WHERE BookingID=@bid');
    const booking = result.recordset[0];
    if (!booking) fail('Booking not found.', 404);
    if (!DISCOUNT_STATES.includes(booking.Status) || booking.DeliveryVoucherID || booking.DeliveredAt ||
        booking.GatePassIssuedAt || booking.ClosedAt || booking.CancelledAt) {
        fail('Discounts can be applied only before delivery/gate pass. Pending discount requests use the approval queue.', 409);
    }
    const current = cents(booking.NegotiatedPrice);
    if (current !== expected) fail('The booking price changed. Refresh and review it before applying a discount.', 409);
    if (reduction >= current) fail('The discount must be less than the current vehicle price.');
    const pending = await new sql.Request(tx).input('bid', sql.Int, bookingId)
        .query("SELECT TOP (1) RequestID FROM dms_NegotiationRequests WHERE BookingID=@bid AND Status='Pending'");
    if (pending.recordset.length) fail('Resolve the existing pending discount request first.', 409);
    const delivery = await new sql.Request(tx).input('bid', sql.Int, bookingId)
        .query(`SELECT TOP (1) VoucherID FROM data_FinanceVoucherInfo
                WHERE SourceDocType='SALES_DELIVERY' AND SourceDocID=@bid
                  AND Status IN ('Draft','Posted') AND ReversesVoucherID IS NULL`);
    if (delivery.recordset.length) fail('A delivery voucher already exists. The booking price cannot be changed here.', 409);

    const newPrice = (current - reduction) / 100;
    await new sql.Request(tx).input('bid', sql.Int, bookingId).input('price', sql.Decimal(18, 2), newPrice)
        .input('by', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName || null)
        .query(`UPDATE dms_SalesBookings
                SET MasterPriceBeforeDiscount=COALESCE(MasterPriceBeforeDiscount,NegotiatedPrice),
                    NegotiatedPrice=@price, UpdatedAt=GETDATE(),UpdatedByEmployeeID=@by,UpdatedByName=@name
                WHERE BookingID=@bid`);
    const next = { NegotiatedPrice: newPrice, DiscountAmount: Number(booking.StandardPrice) - newPrice,
        AdditionalDiscount: reduction / 100, MasterPriceBeforeDiscount: booking.MasterPriceBeforeDiscount ?? current / 100 };
    await new sql.Request(tx).input('bid', sql.Int, bookingId)
        .input('old', sql.NVarChar(sql.MAX), JSON.stringify({ NegotiatedPrice: current / 100, StandardPrice: booking.StandardPrice }))
        .input('new', sql.NVarChar(sql.MAX), JSON.stringify(next))
        .input('emp', sql.Int, user.employeeId || null).input('uid', sql.Int, user.userId || null)
        .input('name', sql.NVarChar(100), user.userName || null).input('reason', sql.NVarChar(500), reason.trim())
        .query(`INSERT INTO dms_SalesAuditLog
            (BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorEmployeeID,ActorName,ActorUserID,Notes)
            VALUES (@bid,'Booking',@bid,'ApplyBookingDiscount',@old,@new,@emp,@name,@uid,@reason)`);
    await new sql.Request(tx).input('bid', sql.Int, bookingId).input('status', sql.NVarChar(30), booking.Status)
        .input('emp', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName || null)
        .input('role', sql.NVarChar(50), user.groupTitle || null)
        .input('reason', sql.NVarChar(sql.MAX), `Booking discount PKR ${reduction / 100}; vehicle price ${current / 100} -> ${newPrice}. No ledger posting. ${reason.trim()}`)
        .query(`INSERT INTO dms_BookingStateTransitions
            (BookingID,FromState,ToState,ActorEmployeeID,ActorName,ActorRole,Reason)
            VALUES (@bid,@status,@status,@emp,@name,@role,@reason)`);
    return { message: 'Discount applied to the booking. No ledger entry was created.', ...next };
}
module.exports = { applyBookingDiscount, DISCOUNT_STATES };
