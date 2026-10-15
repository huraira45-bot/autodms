const { sql } = require('../config/db');
const { DISCOUNT_STATES } = require('./salesBookingDiscountService');
const { masterAmountDue } = require('./salesMasterAmount');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function cents(value) {
    const result = Math.round(Number(value) * 100);
    if (!['string', 'number'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) ||
        !Number.isSafeInteger(result) || result <= 0) fail('Enter a positive amount with up to two decimal places.');
    return result;
}
async function setMasterAgreedAmount(tx, { bookingId, amount, expectedAmount, reason, user }) {
    if (!user?.modules?.includes('sales_admin_pricing')) fail('Sales Pricing Admin permission is required.', 403);
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) fail('Invalid booking.');
    const accepted = cents(amount), expected = cents(expectedAmount);
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) fail('Enter a reason between 5 and 500 characters.');
    const result = await new sql.Request(tx).input('bid', sql.Int, bookingId).query(`
        SELECT b.*,v.WholesalePrice FROM dms_SalesBookings b WITH (UPDLOCK,HOLDLOCK)
        LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID WHERE b.BookingID=@bid`);
    const b = result.recordset[0];
    if (!b) fail('Booking not found.', 404);
    if (!DISCOUNT_STATES.includes(b.Status) || b.DeliveryVoucherID || b.DeliveredAt || b.GatePassIssuedAt || b.ClosedAt || b.CancelledAt) {
        fail('Master amount can be agreed only on an active booking before delivery or gate pass.', 409);
    }
    const current = cents(masterAmountDue(b));
    if (expected !== current) fail('The Master amount changed. Refresh and review it before saving.', 409);
    const original = cents(masterAmountDue({ ...b, MasterAgreedAmount: null }));
    if (accepted > original) fail('The accepted amount cannot exceed the original Master amount.');
    const delivery = await new sql.Request(tx).input('bid', sql.Int, bookingId).query(`
        SELECT TOP (1) VoucherID FROM data_FinanceVoucherInfo WHERE SourceDocType='SALES_DELIVERY'
          AND SourceDocID=@bid AND Status IN ('Draft','Posted') AND ReversesVoucherID IS NULL`);
    if (delivery.recordset.length) fail('A delivery voucher already exists. The Master amount cannot be changed here.', 409);
    await new sql.Request(tx).input('bid', sql.Int, bookingId).input('amount', sql.Decimal(18,2), accepted / 100)
        .input('uid', sql.Int, user.userId || null).input('name', sql.NVarChar(100), user.userName || null)
        .input('reason', sql.NVarChar(500), reason.trim()).input('emp', sql.Int, user.employeeId || null)
        .query(`UPDATE dms_SalesBookings SET MasterAgreedAmount=@amount,MasterAgreedAt=GETDATE(),
            MasterAgreedByUserID=@uid,MasterAgreedByName=@name,MasterAgreedReason=@reason,
            UpdatedAt=GETDATE(),UpdatedByEmployeeID=@emp,UpdatedByName=@name WHERE BookingID=@bid`);
    await new sql.Request(tx).input('bid', sql.Int, bookingId)
        .input('old', sql.NVarChar(sql.MAX), JSON.stringify({ MasterAmountDue: current / 100, MasterAgreedAmount: b.MasterAgreedAmount ?? null }))
        .input('new', sql.NVarChar(sql.MAX), JSON.stringify({ MasterAmountDue: accepted / 100, MasterAgreedAmount: accepted / 100 }))
        .input('uid', sql.Int, user.userId || null).input('name', sql.NVarChar(100), user.userName || null)
        .input('emp', sql.Int, user.employeeId || null).input('reason', sql.NVarChar(500), reason.trim())
        .query(`INSERT INTO dms_SalesAuditLog
            (BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorEmployeeID,ActorName,ActorUserID,Notes)
            VALUES (@bid,'Booking',@bid,'SetMasterAgreedAmount',@old,@new,@emp,@name,@uid,@reason)`);
    await new sql.Request(tx).input('bid', sql.Int, bookingId).input('status', sql.NVarChar(30), b.Status)
        .input('emp', sql.Int, user.employeeId || null).input('name', sql.NVarChar(100), user.userName || null)
        .input('role', sql.NVarChar(50), user.groupTitle || null)
        .input('reason', sql.NVarChar(sql.MAX), `Master accepted PKR ${accepted / 100} as the full amount for this booking (previously ${current / 100}). No ledger posting. ${reason.trim()}`)
        .query(`INSERT INTO dms_BookingStateTransitions (BookingID,FromState,ToState,ActorEmployeeID,ActorName,ActorRole,Reason)
            VALUES (@bid,@status,@status,@emp,@name,@role,@reason)`);
    return { message: 'Master agreed amount saved. No ledger entry was created.', MasterAgreedAmount: accepted / 100 };
}
module.exports = { setMasterAgreedAmount };
