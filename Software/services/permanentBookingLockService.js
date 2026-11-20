const { sql } = require('../config/db');
const { masterNetSql } = require('./masterPaymentPositionService');
const { effectiveMasterPaidSql } = require('./historicalMasterApprovalService');
const { masterAmountDue } = require('./salesMasterAmount');
const REQUIRED_TRIGGERS=["trg_dms_BookingDeliveryReopens_PermanentBookingLock", "trg_dms_BookingMasterInvoices_PermanentBookingLock", "trg_dms_DeliveredChassisCorrections_PermanentBookingLock", "trg_dms_HistoricalMasterAllocations_PermanentBookingLock", "trg_dms_HistoricalVoucherReferences_PermanentBookingLock", "trg_dms_NegotiationRequests_PermanentBookingLock", "trg_dms_PartyLedger_PermanentBookingLock", "trg_dms_SalesBookingCancellations_PermanentBookingLock", "trg_dms_SalesBookings_PermanentBookingLock", "trg_dms_SalesDocuments_PermanentBookingLock", "trg_dms_SalesIncentiveAccruals_PermanentBookingLock", "trg_dms_SalesPayments_PermanentBookingLock", "trg_dms_SalesPaymentVoidRequests_PermanentBookingLock", "trg_dms_SalesRecoveryInstallments_PermanentBookingLock", "trg_dms_SalesRecoveryPlans_PermanentBookingLock", "trg_dms_VehicleInventoryLedger_PermanentBookingLock", "trg_data_FinanceVoucherDetail_PermanentBookingLock", "trg_data_FinanceVoucherInfo_PermanentBookingLock", "trg_dms_GatePasses_PermanentBookingLock", "trg_dms_Vehicle_PermanentBookingLock", "trg_dms_PendingCheques_PermanentBookingLock", "trg_dms_SalesAuditLog_PermanentBookingLock", "trg_dms_BookingStateTransitions_PermanentBookingLock", "trg_dms_PermanentBookingLocks_Immutable", "trg_dms_PermanentBookingVoucherLocks_Immutable"];
const fail = message => { throw new Error(message); };
function validatePermanentLock({booking,payments,headers,sharedLines,masterPaid,expectedVoucherNo,user,reason}) {
    if(Number(user?.groupId)!==1 || !user.userId) fail('Only the main Administrator can install a permanent booking lock.');
    if(typeof reason!=='string' || reason.trim().length<10 || reason.length>500) fail('Enter a lock reason of 10 to 500 characters.');
    if(!booking || booking.Status!=='Closed') fail('Only a closed booking can be permanently locked.');
    if(!expectedVoucherNo || !payments.some(p=>p.Status==='Posted' && p.VoucherNo===expectedVoucherNo && headers.some(h=>h.VoucherID===p.VoucherID && h.VoucherNo===expectedVoucherNo && h.Status==='Posted' && !h.ReversesVoucherID))) fail('The expected payment voucher must still be posted and linked to this booking.');
    if(sharedLines.length) fail('A linked voucher belongs to another booking; a permanent lock would affect that booking.');
    if(headers.some(h=>!['Posted','Reversed'].includes(h.Status))) fail('Finalize or remove outstanding draft vouchers before locking.');
    if(Math.round(Number(masterPaid)*100)<Math.round(masterAmountDue(booking)*100)) fail('Master payment is not fully settled; lock refused.');
    const customerDue=Number(booking.NegotiatedPrice||0)+Number(booking.PremiumAmount||0);
    if(Number(booking.AmountPaidToDate||0)+0.005<customerDue) fail('Customer payment is not fully settled; lock refused.');
    return [...new Set(headers.map(h=>h.VoucherID))].sort((a,b)=>a-b);
}
async function permanentlyLockBooking(tx,{bookingNo,expectedVoucherNo,reason,user,apply=false}) {
    if(Number(user?.groupId)!==1 || !user.userId) fail('Only the main Administrator can install a permanent booking lock.');
    const rq=()=>new sql.Request(tx);
    const setup=await rq().query("SELECT OBJECT_ID('dbo.dms_PermanentBookingLocks','U') Id");
    if(!setup.recordset[0].Id) fail('Run migration 175_permanent_booking_lock.sql first.');
    const booking=(await rq().input('no',sql.NVarChar(50),bookingNo).query('SELECT b.*,v.WholesalePrice FROM dms_SalesBookings b WITH(UPDLOCK,HOLDLOCK) LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID WHERE b.BookingNo=@no')).recordset[0];
    if(!booking) fail('Booking not found.');
    const guards=(await rq().input('names',sql.NVarChar(sql.MAX),JSON.stringify(REQUIRED_TRIGGERS)).query('SELECT name FROM sys.triggers WHERE is_disabled=0 AND name IN(SELECT value FROM OPENJSON(@names))')).recordset;
    if(guards.length!==REQUIRED_TRIGGERS.length)fail('Permanent lock triggers are missing or disabled; run migration 175.');
    const oldLock=(await rq().input('id',sql.Int,booking.BookingID).query('SELECT * FROM dms_PermanentBookingLocks WITH(UPDLOCK,HOLDLOCK) WHERE BookingID=@id')).recordset[0];
    if(oldLock) return {alreadyLocked:true,BookingNo:bookingNo,lock:oldLock};
    const bid=booking.BookingID;
    const data=await rq().input('id',sql.Int,bid).query(`
        SELECT * FROM dms_SalesPayments WITH(UPDLOCK,HOLDLOCK) WHERE BookingID=@id;
        ;WITH roots AS (
            SELECT VoucherID FROM data_FinanceVoucherDetail WHERE BookingID=@id
            UNION SELECT VoucherID FROM dms_SalesPayments WHERE BookingID=@id AND VoucherID IS NOT NULL
            UNION SELECT DeliveryVoucherID FROM dms_SalesBookings WHERE BookingID=@id AND DeliveryVoucherID IS NOT NULL
            UNION SELECT VoucherID FROM dms_HistoricalMasterAllocations WHERE BookingID=@id
            UNION SELECT VoucherID FROM dms_HistoricalVoucherReferences WHERE BookingID=@id
            UNION SELECT VoucherID FROM data_FinanceVoucherInfo WHERE SourceDocType IN ('PAY_MASTER','MASTER_INVOICE','SALES_DELIVERY') AND SourceDocID=@id
        ), chain AS (
            SELECT h.* FROM data_FinanceVoucherInfo h JOIN roots r ON r.VoucherID=h.VoucherID
            UNION ALL SELECT h.* FROM data_FinanceVoucherInfo h JOIN chain c ON h.ReversesVoucherID=c.VoucherID
        ) SELECT DISTINCT * FROM chain OPTION(MAXRECURSION 100);
        SELECT ${effectiveMasterPaidSql('@id',masterNetSql('@id',"(SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='BOOKING_VARIANT_RECEIVABLE')",{excludeDelivery:true}))} AS MasterPaid;
    `);
    const payments=data.recordsets[0],headers=data.recordsets[1],ids=headers.map(h=>h.VoucherID);
    const details=(await rq().input('ids',sql.NVarChar(sql.MAX),JSON.stringify(ids)).query('SELECT * FROM data_FinanceVoucherDetail WITH(UPDLOCK,HOLDLOCK) WHERE VoucherID IN(SELECT CONVERT(INT,value) FROM OPENJSON(@ids)) ORDER BY VoucherDetailID')).recordset;
    const sharedLines=details.filter(d=>d.BookingID!=null && d.BookingID!==bid);
    const voucherIDs=validatePermanentLock({booking,payments,headers,sharedLines,masterPaid:data.recordsets[2][0].MasterPaid,expectedVoucherNo,user,reason});
    const summary={BookingNo:bookingNo,BookingID:bid,VehicleID:booking.AllocatedVehicleID,MasterPaid:Number(data.recordsets[2][0].MasterPaid),protectedVoucherCount:voucherIDs.length,protectedVouchers:headers.map(h=>h.VoucherNo),permanent:true};
    if(!apply)return {...summary,committed:false};
    await rq().input('id',sql.Int,bid).input('vehicle',sql.Int,booking.AllocatedVehicleID||null).input('reason',sql.NVarChar(500),reason.trim()).input('uid',sql.Int,user.userId).input('name',sql.NVarChar(100),user.userName).query(`
        INSERT dms_PermanentBookingLocks(BookingID,VehicleID,Reason,ActorUserID,ActorName) VALUES(@id,@vehicle,@reason,@uid,@name);`);
    await rq().input('id',sql.Int,bid).input('ids',sql.NVarChar(sql.MAX),JSON.stringify(voucherIDs)).query('INSERT dms_PermanentBookingVoucherLocks(VoucherID,BookingID) SELECT CONVERT(INT,value),@id FROM OPENJSON(@ids)');
    await rq().input('id',sql.Int,bid).input('uid',sql.Int,user.userId).input('name',sql.NVarChar(100),user.userName).input('reason',sql.NVarChar(500),reason.trim()).input('next',sql.NVarChar(sql.MAX),JSON.stringify(summary)).input('state',sql.NVarChar(30),booking.Status).query(`
        INSERT dms_SalesAuditLog(BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorUserID,ActorName,Notes) VALUES(@id,'Booking',@id,'BookingPermanentlyLocked',NULL,@next,@uid,@name,@reason);
        INSERT dms_BookingStateTransitions(BookingID,FromState,ToState,ActorName,ActorRole,Reason) VALUES(@id,@state,@state,@name,'Administrator',@reason);`);
    const verify=await rq().input('id',sql.Int,bid).input('ids',sql.NVarChar(sql.MAX),JSON.stringify(voucherIDs)).query(`SELECT * FROM dms_SalesBookings WHERE BookingID=@id; SELECT * FROM dms_SalesPayments WHERE BookingID=@id; SELECT * FROM data_FinanceVoucherInfo WHERE VoucherID IN(SELECT CONVERT(INT,value) FROM OPENJSON(@ids)); SELECT * FROM data_FinanceVoucherDetail WHERE VoucherID IN(SELECT CONVERT(INT,value) FROM OPENJSON(@ids)) ORDER BY VoucherDetailID; SELECT VoucherID FROM dms_PermanentBookingVoucherLocks WHERE BookingID=@id ORDER BY VoucherID;`);
    const assert=require('assert/strict');const norm=x=>JSON.parse(JSON.stringify(x));
    const {WholesalePrice,...storedBooking}=booking;assert.deepEqual(norm(verify.recordsets[0]),norm([storedBooking]));assert.deepEqual(norm(verify.recordsets[1]),norm(payments));
    assert.deepEqual(norm(verify.recordsets[2].sort((a,b)=>a.VoucherID-b.VoucherID)),norm(headers.sort((a,b)=>a.VoucherID-b.VoucherID)));
    assert.deepEqual(norm(verify.recordsets[3]),norm(details));assert.deepEqual(verify.recordsets[4].map(x=>x.VoucherID),voucherIDs);
    return {...summary,committed:true,verified:true};
}
module.exports={validatePermanentLock,permanentlyLockBooking};
