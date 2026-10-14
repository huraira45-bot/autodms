const { sql } = require('../config/db');
function approvedMasterSql(booking) {
    return `(SELECT CASE WHEN confirmed.IsHistorical=1 THEN ISNULL(confirmed.HistoricalMasterApprovedAmount,0) ELSE 0 END
        FROM dms_SalesBookings confirmed WHERE confirmed.BookingID=${booking})`;
}
function effectiveMasterPaidSql(booking, ledgerExpression) {
    const approved=approvedMasterSql(booking);
    return `(SELECT MAX(paid.Amount) FROM (VALUES (${ledgerExpression}),(${approved})) paid(Amount))`;
}
function effectiveMasterPaid(booking, ledgerPaid) {
    const approved=booking.IsHistorical ? Number(booking.HistoricalMasterApprovedAmount||0) : 0;
    return Math.max(Number(ledgerPaid)||0,approved);
}
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const CLOSED=['Closed','Delivered','GatePassIssued','Cancelled'];
async function load(tx,id) {
    const r=await new sql.Request(tx).input('bid',sql.Int,id).query(`
        SELECT b.BookingID,b.BookingNo,b.Status,b.IsHistorical,b.HistoricalMasterApprovedAmount,
            b.NegotiatedPrice,v.WholesalePrice
        FROM dms_SalesBookings b WITH (UPDLOCK,HOLDLOCK)
        LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID WHERE b.BookingID=@bid`);
    const booking=r.recordset[0];
    if(!booking)fail('Booking not found.',404);
    if(!booking.IsHistorical)fail('Approval without a voucher is only available for historical bookings.');
    if(CLOSED.includes(booking.Status))fail('Master approval cannot change after gate pass, delivery or cancellation.');
    return booking;
}
async function approveHistoricalMaster(tx,id,amount,notes,user) {
    if(!Number.isSafeInteger(id)||id<=0)fail('Invalid booking.',400);
    const cents=Math.round(Number(amount)*100);
    if(!Number.isFinite(Number(amount))||!Number.isSafeInteger(cents)||cents<=0||Math.abs(Number(amount)*100-cents)>0.000001)
        fail('Enter a positive amount with up to two decimal places.',400);
    const booking=await load(tx,id);
    const target=Number(booking.WholesalePrice)>0?Number(booking.WholesalePrice):Number(booking.NegotiatedPrice);
    if(cents>Math.round(target*100))fail('The approved total cannot exceed the vehicle amount due to Master.',400);
    if(String(notes||'').length>1000)fail('Notes must be no more than 1000 characters.',400);
    await new sql.Request(tx).input('bid',sql.Int,id).input('amt',sql.Decimal(18,2),cents/100)
        .input('by',sql.Int,user?.userId||null).input('name',sql.NVarChar(100),user?.userName||null)
        .input('notes',sql.NVarChar(1000),String(notes||'').trim()||null)
        .query(`UPDATE dms_SalesBookings SET HistoricalMasterApprovedAmount=@amt,
            HistoricalMasterApprovedAt=GETDATE(),HistoricalMasterApprovedByUserID=@by,
            HistoricalMasterApprovedByName=@name,HistoricalMasterApprovalNotes=@notes WHERE BookingID=@bid`);
    return {booking,Amount:cents/100};
}
async function revokeHistoricalMaster(tx,id) {
    if(!Number.isSafeInteger(id)||id<=0)fail('Invalid booking.',400);
    const booking=await load(tx,id);
    if(!booking.HistoricalMasterApprovedAmount)fail('This booking has no Master approval to remove.');
    await new sql.Request(tx).input('bid',sql.Int,id).query(`UPDATE dms_SalesBookings SET
        HistoricalMasterApprovedAmount=NULL,HistoricalMasterApprovedAt=NULL,
        HistoricalMasterApprovedByUserID=NULL,HistoricalMasterApprovedByName=NULL,HistoricalMasterApprovalNotes=NULL
        WHERE BookingID=@bid`);
    return booking;
}
module.exports={approvedMasterSql,effectiveMasterPaidSql,effectiveMasterPaid,approveHistoricalMaster,revokeHistoricalMaster};
