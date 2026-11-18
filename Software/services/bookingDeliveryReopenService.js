const {randomUUID}=require('crypto');
const {sql}=require('../config/db');
const {postReversalVoucher}=require('./voucherReversalService');
const {vehicleDeliveryLockedSql}=require('./vehicleDeliveryLockService');
const assert=require('assert/strict');
const normal=x=>JSON.parse(JSON.stringify(x));
const fail=message=>{throw new Error(message);};
const omit=(row,keys)=>Object.fromEntries(Object.entries(normal(row)).filter(([k])=>!keys.includes(k)));
const sort=rows=>normal(rows).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
async function reopenBookingDelivery(tx,{bookingNo,expectedChassis,expectedVoucherNo,expectedGatePassNo,reason,user,apply=false}){
 if(user?.groupId!==1||!Number.isInteger(user.userId)||!user.userName)fail('Only the main Administrator can reopen a delivered booking.');
 if(!/^BK-\d{4}-\d{4,}$/.test(bookingNo||''))fail('Enter a valid booking number.');
 if(!expectedChassis||!expectedVoucherNo||!expectedGatePassNo)fail('Expected chassis, delivery voucher and gate pass are required.');
 if(typeof reason!=='string'||reason.trim().length<10||reason.trim().length>500)fail('Enter a reason between 10 and 500 characters.');
 reason=reason.trim();const rq=()=>new sql.Request(tx);
 const setup=(await rq().query("SELECT OBJECT_ID('dbo.dms_BookingDeliveryReopens','U') AS SetupID")).recordset[0];
 if(!setup?.SetupID)fail('Apply migration 174_booking_delivery_reopen.sql first. No booking changes made.');
 const booking=(await rq().input('no',sql.NVarChar(30),bookingNo).query('SELECT * FROM dms_SalesBookings WITH(UPDLOCK,HOLDLOCK) WHERE BookingNo=@no')).recordset[0];
 if(!booking)fail('Booking not found.');
 if(!['Closed','Delivered','GatePassIssued'].includes(booking.Status)||!booking.AllocatedVehicleID||!booking.DeliveryVoucherID)fail('Booking must have its original issued delivery and allocated vehicle.');
 const id=booking.BookingID,vehicleId=booking.AllocatedVehicleID,voucherId=booking.DeliveryVoucherID;
 const vehicle=(await rq().input('vid',sql.Int,vehicleId).query('SELECT * FROM dms_Vehicle WITH(UPDLOCK,HOLDLOCK) WHERE VehicleID=@vid')).recordset[0];
 if(!vehicle||vehicle.ChasisNo!==expectedChassis||vehicle.CurrentBookingID!==id||!['Delivered','Sold'].includes(vehicle.Status))fail('Expected delivered chassis no longer matches this booking.');
 if(vehicle.MasterInvoiceVoucherID)fail('A vehicle Master invoice voucher requires separate review.');
 const loaded=await rq().input('bid',sql.Int,id).input('vid',sql.Int,vehicleId).input('voucher',sql.Int,voucherId).query(`
 SELECT * FROM dms_GatePasses WITH(UPDLOCK,HOLDLOCK) WHERE DocType='BOOKING' AND DocID=@bid AND RevokedAt IS NULL ORDER BY GatePassID;
 SELECT * FROM data_FinanceVoucherInfo WITH(UPDLOCK,HOLDLOCK) WHERE VoucherID=@voucher OR ReversesVoucherID=@voucher ORDER BY VoucherID;
 SELECT * FROM data_FinanceVoucherDetail WITH(HOLDLOCK) WHERE VoucherID=@voucher ORDER BY VoucherDetailID;
 SELECT * FROM dms_PartyLedger WITH(HOLDLOCK) WHERE VoucherID=@voucher;
 SELECT * FROM dms_OpenAllocationLedger WITH(UPDLOCK,HOLDLOCK) WHERE VehicleID=@vid;
 SELECT MAX(MovementID) AS LastDeliveryMovementID FROM dms_VehicleInventoryLedger WHERE VehicleID=@vid AND BookingID=@bid AND (EntryType='Delivered' OR EntryType='Opening' AND ToStatus IN('Delivered','Sold'));
 SELECT BookingID FROM dms_SalesBookings WITH(UPDLOCK,HOLDLOCK) WHERE BookingID<>@bid AND AllocatedVehicleID=@vid;
 SELECT GatePassID FROM dms_GatePasses WHERE VehicleChassis=(SELECT ChasisNo FROM dms_Vehicle WHERE VehicleID=@vid) AND RevokedAt IS NULL AND (DocType<>'BOOKING' OR DocID<>@bid);
 SELECT * FROM dms_BookingMasterInvoices WHERE BookingID=@bid;
 SELECT * FROM dms_PendingCheques WHERE ReceiptVoucherID=@voucher OR ClearanceVoucherID=@voucher;
 `);
 const [passes,vouchers,details,subsidiary,openLedger,movement,conflicts,otherPasses,invoices,cheques]=loaded.recordsets;
 if(passes.length!==1||passes[0].GatePassNo!==expectedGatePassNo||passes[0].VehicleChassis!==expectedChassis)fail('Expected single active gate pass no longer matches.');
 const pass=passes[0],voucher=vouchers.find(v=>v.VoucherID===voucherId);
 if(!voucher||voucher.VoucherNo!==expectedVoucherNo||voucher.Status!=='Posted'||!voucher.Posted||voucher.ReversesVoucherID||voucher.SourceDocType!=='SALES_DELIVERY'||voucher.SourceDocID!==id||vouchers.length!==1)fail('Expected delivery voucher must be posted and not already reversed.');
 if(!details.length||details.some(d=>d.BookingID!==id))fail('Delivery voucher lines must belong only to this booking.');
 const cents=x=>Math.round(Number(x||0)*100);
 if(details.reduce((n,d)=>n+cents(d.Debit)-cents(d.Credit),0)!==0)fail('Delivery voucher is not balanced.');
 if(!movement[0]?.LastDeliveryMovementID)fail('Original delivery stock movement was not found.');
 if(conflicts.length||otherPasses.length)fail('Vehicle is also referenced by another booking or active gate pass.');
 if(invoices.length)fail('Uploaded Master invoice must be reviewed before changing this delivered allocation.');
 if(cheques.length)fail('Delivery voucher unexpectedly has cheque records; separate review is required.');
 const protectedRecords=async()=>{
 const r=await rq().input('bid',sql.Int,id).input('delivery',sql.Int,voucherId).query(`
 SELECT * FROM dms_SalesPayments WITH(HOLDLOCK) WHERE BookingID=@bid ORDER BY PaymentID;
 SELECT * FROM data_FinanceVoucherInfo WITH(HOLDLOCK) WHERE (SourceDocID=@bid AND SourceDocType IN('PAY_MASTER','SALES_PAYMENT','MASTER_INVOICE','MASTER_BOOKING_INC')) OR VoucherID IN(SELECT VoucherID FROM dms_SalesPayments WHERE BookingID=@bid) OR ReversesVoucherID IN(SELECT VoucherID FROM dms_SalesPayments WHERE BookingID=@bid);
 SELECT d.* FROM data_FinanceVoucherDetail d WITH(HOLDLOCK) JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID WHERE (v.SourceDocID=@bid AND v.SourceDocType IN('PAY_MASTER','SALES_PAYMENT','MASTER_INVOICE','MASTER_BOOKING_INC')) OR d.VoucherID IN(SELECT VoucherID FROM dms_SalesPayments WHERE BookingID=@bid) OR v.ReversesVoucherID IN(SELECT VoucherID FROM dms_SalesPayments WHERE BookingID=@bid);
 SELECT * FROM dms_SalesIncentiveAccruals WITH(HOLDLOCK) WHERE BookingID=@bid;
 SELECT * FROM dms_HistoricalMasterAllocations WITH(HOLDLOCK) WHERE BookingID=@bid;
 SELECT * FROM dms_SalesDocuments WITH(HOLDLOCK) WHERE BookingID=@bid;
 `);return r.recordsets.map(sort);
 };
 const beforeProtected=await protectedRecords();
 const plan={BookingNo:bookingNo,OldStatus:booking.Status,NewStatus:'PendingPayment',Chassis:expectedChassis,VehicleID:vehicleId,GatePassNo:pass.GatePassNo,DeliveryVoucherNo:voucher.VoucherNo,DeliveryAmount:Number(voucher.TotalAmount),PaymentAmountsPreserved:true,MasterRemittancesPreserved:true,StockStatus:'AtDealer',dryRun:!apply};
 if(!apply)return plan;
 const oldValues=normal({booking,vehicle,gatePass:pass,deliveryVoucher:voucher,deliveryLines:details,subsidiary,openLedger});
 const reversal=await postReversalVoucher(voucherId,user,tx);
 const reopenId=randomUUID();
 await rq().input('rid',sql.UniqueIdentifier,reopenId).input('bid',sql.Int,id).input('vid',sql.Int,vehicleId).input('gp',sql.Int,pass.GatePassID)
 .input('orig',sql.Int,voucherId).input('rev',sql.Int,reversal.reversalId).input('last',sql.BigInt,movement[0].LastDeliveryMovementID)
 .input('old',sql.NVarChar(sql.MAX),JSON.stringify(oldValues)).input('reason',sql.NVarChar(500),reason).input('uid',sql.Int,user.userId).input('actor',sql.NVarChar(100),user.userName)
 .query(`INSERT dms_BookingDeliveryReopens(ReopenID,BookingID,VehicleID,GatePassID,DeliveryVoucherID,ReversalVoucherID,LastDeliveryMovementID,OriginalValues,Reason,ActorUserID,ActorName)
 VALUES(@rid,@bid,@vid,@gp,@orig,@rev,@last,@old,@reason,@uid,@actor);`);
 await rq().input('bid',sql.Int,id).input('gp',sql.Int,pass.GatePassID).input('uid',sql.Int,user.userId).input('emp',sql.Int,user.employeeId||null)
 .input('actor',sql.NVarChar(100),user.userName).input('reason',sql.NVarChar(500),reason).query(`
 UPDATE dms_GatePasses SET RevokedAt=GETDATE(),RevokedBy=@uid,RevokedByName=@actor,RevokeReason=@reason WHERE GatePassID=@gp AND RevokedAt IS NULL;
 IF @@ROWCOUNT<>1 THROW 51074,'Gate pass changed before revocation.',1;
 UPDATE dms_SalesBookings SET Status='PendingPayment',AllocatedVehicleID=NULL,DeliveryVoucherID=NULL,GatePassIssuedAt=NULL,DeliveredAt=NULL,ClosedAt=NULL,
 UpdatedAt=GETDATE(),UpdatedByEmployeeID=@emp,UpdatedByName=@actor WHERE BookingID=@bid;
 `);
 await rq().input('vid',sql.Int,vehicleId).input('bid',sql.Int,id).input('emp',sql.Int,user.employeeId||null).input('actor',sql.NVarChar(100),user.userName).query(`
 UPDATE dms_Vehicle SET Status='AtDealer',CurrentBookingID=NULL,SoldDeliveredAt=NULL,UpdatedAt=GETDATE(),UpdatedByEmployeeID=@emp,UpdatedByName=@actor WHERE VehicleID=@vid;
 UPDATE dms_OpenAllocationLedger SET Status='AtDealer',SoldAt=NULL,SoldToBookingID=NULL WHERE VehicleID=@vid AND Status='Sold' AND SoldToBookingID=@bid;
 `);
 await rq().input('rid',sql.UniqueIdentifier,reopenId).query('UPDATE dms_BookingDeliveryReopens SET CompletedAtUtc=SYSUTCDATETIME() WHERE ReopenID=@rid');
 const nextValues={...plan,ReopenID:reopenId,ReversalVoucherID:reversal.reversalId,ReversalVoucherNo:reversal.reversalNo};
 await rq().input('bid',sql.Int,id).input('old',sql.NVarChar(sql.MAX),JSON.stringify(oldValues)).input('next',sql.NVarChar(sql.MAX),JSON.stringify(nextValues))
 .input('emp',sql.Int,user.employeeId||null).input('uid',sql.Int,user.userId).input('actor',sql.NVarChar(100),user.userName).input('reason',sql.NVarChar(500),reason).input('state',sql.NVarChar(30),booking.Status)
 .query(`INSERT dms_SalesAuditLog(BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorEmployeeID,ActorUserID,ActorName,Notes)
 VALUES(@bid,'Booking',@bid,'ReopenIssuedDelivery',@old,@next,@emp,@uid,@actor,@reason);
 INSERT dms_BookingStateTransitions(BookingID,FromState,ToState,ActorEmployeeID,ActorName,ActorRole,Reason)
 VALUES(@bid,@state,'PendingPayment',@emp,@actor,'Administrator delivery reopen',@reason);`);
 assert.deepEqual(await protectedRecords(),beforeProtected,'Customer payments, Master remittances, incentives or documents changed.');
 const final=await rq().input('bid',sql.Int,id).input('vid',sql.Int,vehicleId).input('gp',sql.Int,pass.GatePassID).input('orig',sql.Int,voucherId).input('rev',sql.Int,reversal.reversalId).query(`
 SELECT * FROM dms_SalesBookings WHERE BookingID=@bid;
 SELECT v.*,CASE WHEN ${vehicleDeliveryLockedSql('v')} THEN 1 ELSE 0 END AS DeliveryLocked FROM dms_Vehicle v WHERE v.VehicleID=@vid;
 SELECT * FROM dms_GatePasses WHERE GatePassID=@gp;
 SELECT * FROM data_FinanceVoucherInfo WHERE VoucherID IN(@orig,@rev);
 SELECT * FROM data_FinanceVoucherDetail WHERE VoucherID IN(@orig,@rev);
 SELECT * FROM dms_PartyLedger WHERE VoucherID IN(@orig,@rev);
 SELECT * FROM dms_OpenAllocationLedger WHERE VehicleID=@vid;
 `);
 const [afterBookings,afterVehicles,afterPasses,afterVouchers,afterLines,afterSubs,afterOpen]=final.recordsets;
 const after=afterBookings[0],afterVehicle=afterVehicles[0],afterPass=afterPasses[0];
 assert.equal(after.Status,'PendingPayment');for(const k of ['AllocatedVehicleID','DeliveryVoucherID','GatePassIssuedAt','DeliveredAt','ClosedAt'])assert.equal(after[k],null);
 assert.deepEqual(omit(after,['Status','AllocatedVehicleID','DeliveryVoucherID','GatePassIssuedAt','DeliveredAt','ClosedAt','UpdatedAt','UpdatedByEmployeeID','UpdatedByName']),omit(booking,['Status','AllocatedVehicleID','DeliveryVoucherID','GatePassIssuedAt','DeliveredAt','ClosedAt','UpdatedAt','UpdatedByEmployeeID','UpdatedByName']));
 assert.equal(afterVehicle.Status,'AtDealer');assert.equal(afterVehicle.CurrentBookingID,null);assert.equal(afterVehicle.SoldDeliveredAt,null);assert.equal(afterVehicle.DeliveryLocked,0);
 assert.deepEqual(omit(afterVehicle,['Status','CurrentBookingID','SoldDeliveredAt','UpdatedAt','UpdatedByEmployeeID','UpdatedByName','DeliveryLocked']),omit(vehicle,['Status','CurrentBookingID','SoldDeliveredAt','UpdatedAt','UpdatedByEmployeeID','UpdatedByName','DeliveryLocked']));
 assert.ok(afterPass.RevokedAt);assert.deepEqual(omit(afterPass,['RevokedAt','RevokedBy','RevokedByName','RevokeReason']),omit(pass,['RevokedAt','RevokedBy','RevokedByName','RevokeReason']));
 const originalAfter=afterVouchers.find(v=>v.VoucherID===voucherId),reverse=afterVouchers.find(v=>v.VoucherID===reversal.reversalId);
 assert.equal(originalAfter.Status,'Reversed');assert.deepEqual(omit(originalAfter,['Status','ReversedAt','ReversedBy','ReversedByName']),omit(voucher,['Status','ReversedAt','ReversedBy','ReversedByName']));
 assert.equal(reverse.Status,'Posted');assert.equal(reverse.ReversesVoucherID,voucherId);assert.equal(reverse.SourceDocType,'SALES_DELIVERY');assert.equal(reverse.SourceDocID,id);assert.equal(cents(reverse.TotalAmount),cents(voucher.TotalAmount));
 assert.deepEqual(sort(afterLines.filter(d=>d.VoucherID===voucherId)),sort(details));
 const lineKey=d=>({GLCAID:d.GLCAID,PartyID:d.PartyID??null,JobCardID:d.JobCardID??null,BookingID:d.BookingID??null,AllocatedToVoucherID:d.AllocatedToVoucherID??null,Debit:cents(d.Debit),Credit:cents(d.Credit)});
 assert.deepEqual(sort(afterLines.filter(d=>d.VoucherID===reversal.reversalId).map(lineKey)),sort(details.map(d=>lineKey({...d,Debit:d.Credit,Credit:d.Debit}))));
 assert.deepEqual(sort(afterSubs.filter(d=>d.VoucherID===voucherId)),sort(subsidiary));
 const subKey=d=>({PartyID:d.PartyID??null,JobCardID:d.JobCardID??null,BookingID:d.BookingID??null,GLCAID:d.GLCAID,Debit:cents(d.Debit),Credit:cents(d.Credit)});
 assert.deepEqual(sort(afterSubs.filter(d=>d.VoucherID===reversal.reversalId).map(subKey)),sort(subsidiary.map(d=>subKey({...d,Debit:d.Credit,Credit:d.Debit}))));
 assert.equal(afterOpen.length,openLedger.length);for(const row of openLedger){const changed=afterOpen.find(r=>r.VehicleID===row.VehicleID);if(row.Status==='Sold'&&row.SoldToBookingID===id){assert.equal(changed.Status,'AtDealer');assert.equal(changed.SoldAt,null);assert.equal(changed.SoldToBookingID,null);assert.deepEqual(omit(changed,['Status','SoldAt','SoldToBookingID']),omit(row,['Status','SoldAt','SoldToBookingID']));}else assert.deepEqual(normal(changed),normal(row));}
 return {...nextValues,dryRun:false,verified:true};
}
module.exports={reopenBookingDelivery};
