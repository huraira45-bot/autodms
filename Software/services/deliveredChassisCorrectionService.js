const { randomUUID } = require('crypto');
const { sql } = require('../config/db');
const { vehicleDeliveryLockedSql } = require('./vehicleDeliveryLockService');
const fail = message => { throw new Error(message); };
function fingerprint(recordsets) {
    return JSON.stringify(recordsets.map((rows,index)=>rows.map(row=>{
        const copy={...row}; if(index===0) { delete copy.AllocatedVehicleID; delete copy.UpdatedAt; }
        return JSON.stringify(copy);
    }).sort()));
}
async function finances(tx, bookingId, voucherId) {
    return (await new sql.Request(tx).input('b',sql.Int,bookingId).input('v',sql.Int,voucherId).query(`
        SELECT * FROM dms_SalesBookings WHERE BookingID=@b;
        SELECT * FROM data_FinanceVoucherInfo WHERE VoucherID=@v OR SourceDocID=@b AND SourceDocType LIKE '%SALES%';
        SELECT d.* FROM data_FinanceVoucherDetail d JOIN data_FinanceVoucherInfo f ON f.VoucherID=d.VoucherID
            WHERE f.VoucherID=@v OR f.SourceDocID=@b AND f.SourceDocType LIKE '%SALES%';
        SELECT * FROM dms_SalesPayments WHERE BookingID=@b;`)).recordsets;
}

// Caller owns one SERIALIZABLE transaction. Dry-run performs validation only.
async function correctDeliveredChassis(tx,{bookingNo,oldChassis,newChassis,reason,user,apply=false}) {
    if(user?.groupId!==1) fail('Only the main Administrator can correct an issued chassis.');
    if(!/^BK-\d{4}-\d{4,}$/.test(bookingNo||'') || !/^[A-Z0-9-]{5,50}$/.test(oldChassis||'') ||
        !/^[A-Z0-9-]{5,50}$/.test(newChassis||'') || oldChassis===newChassis) fail('Enter booking, expected old chassis and different replacement chassis.');
    if(typeof reason!=='string' || reason.trim().length<10 || reason.trim().length>500) fail('Enter a correction reason between 10 and 500 characters.');
    const b=(await new sql.Request(tx).input('no',sql.NVarChar(30),bookingNo).query(
        'SELECT * FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK) WHERE BookingNo=@no')).recordset[0];
    if(!b) fail('Booking not found.');
    const vehicles=(await new sql.Request(tx).input('old',sql.NVarChar(50),oldChassis).input('new',sql.NVarChar(50),newChassis).query(`
        SELECT v.*,CASE WHEN ${vehicleDeliveryLockedSql('v')} THEN 1 ELSE 0 END AS IsDeliveryLocked
        FROM dms_Vehicle v WITH (UPDLOCK,HOLDLOCK) WHERE ChasisNo IN (@old,@new) ORDER BY VehicleID;`)).recordset;
    const old=vehicles.find(v=>v.ChasisNo===oldChassis), replacement=vehicles.find(v=>v.ChasisNo===newChassis);
    if(!old || !replacement) fail('Both chassis must exist in inventory.');
    if(b.AllocatedVehicleID===replacement.VehicleID) {
        const done=(await new sql.Request(tx).input('b',sql.Int,b.BookingID).input('old',sql.Int,old.VehicleID).input('new',sql.Int,replacement.VehicleID)
            .query('SELECT CorrectionID FROM dms_DeliveredChassisCorrections WHERE BookingID=@b AND OldVehicleID=@old AND NewVehicleID=@new AND CompletedAtUtc IS NOT NULL')).recordset[0];
        if(done) return {alreadyCorrected:true,BookingNo:bookingNo,CorrectionID:done.CorrectionID};
    }
    if(b.AllocatedVehicleID!==old.VehicleID || old.CurrentBookingID!==b.BookingID) fail('Expected old allocation changed; no correction applied.');
    if(!['GatePassIssued','Delivered','Closed'].includes(b.Status) || !['Delivered','Sold'].includes(old.Status)) fail('This correction requires an issued delivery.');
    if(old.VariantID!==b.VehicleVariantID || replacement.VariantID!==b.VehicleVariantID) fail('Replacement must be the same vehicle variant.');
    if(replacement.CurrentBookingID || replacement.IsDeliveryLocked || !['AtDealer','InTransit','AtMaster'].includes(replacement.Status)) fail('Replacement chassis is unavailable or already delivered.');
    if(old.MasterInvoiceVoucherID || replacement.MasterInvoiceVoucherID) fail('A chassis has a Master invoice voucher; a separate invoice review is required.');
    const conflicting=(await new sql.Request(tx).input('b',sql.Int,b.BookingID).input('old',sql.Int,old.VehicleID).input('new',sql.Int,replacement.VehicleID).query(`
        SELECT TOP(1) BookingID FROM dms_SalesBookings WITH (UPDLOCK,HOLDLOCK)
        WHERE BookingID<>@b AND AllocatedVehicleID IN (@old,@new);`)).recordset[0];
    if(conflicting) fail('A chassis is allocated to another booking.');
    const passes=(await new sql.Request(tx).input('b',sql.Int,b.BookingID).query(`
        SELECT * FROM dms_GatePasses WITH (UPDLOCK,HOLDLOCK) WHERE DocType='BOOKING' AND DocID=@b AND RevokedAt IS NULL;`)).recordset;
    if(passes.length!==1 || passes[0].VehicleChassis!==oldChassis) fail('Expected active gate pass does not match the old chassis.');
    const pass=passes[0], deliveredAt=old.SoldDeliveredAt || b.DeliveredAt || b.GatePassIssuedAt || pass.IssuedAt;
    const voucher=(await new sql.Request(tx).input('v',sql.Int,b.DeliveryVoucherID).query(
        'SELECT VoucherID,VoucherNo,Status,Posted,ReversesVoucherID,SourceDocType,SourceDocID FROM data_FinanceVoucherInfo WITH (UPDLOCK,HOLDLOCK) WHERE VoucherID=@v')).recordset[0];
    if(!voucher || voucher.Status!=='Draft' || voucher.Posted || voucher.ReversesVoucherID || voucher.SourceDocType!=='SALES_DELIVERY' || voucher.SourceDocID!==b.BookingID)
        fail('This correction supports this booking\'s existing Draft delivery voucher only. No vouchers are reversed or edited.');
    const last=(await new sql.Request(tx).input('v',sql.Int,old.VehicleID).input('b',sql.Int,b.BookingID).query(`
        SELECT MAX(MovementID) AS MovementID FROM dms_VehicleInventoryLedger
        WHERE VehicleID=@v AND BookingID=@b AND (EntryType='Delivered' OR EntryType='Opening' AND ToStatus IN ('Delivered','Sold'));`)).recordset[0].MovementID;
    if(!last) fail('Original delivery movement was not found.');
    const plan={BookingNo:bookingNo,OldChassis:oldChassis,NewChassis:newChassis,GatePassNo:pass.GatePassNo,DeliveryVoucherNo:voucher.VoucherNo,
        OldVehicleID:old.VehicleID,NewVehicleID:replacement.VehicleID,OriginalDeliveredAt:deliveredAt,AccountingAction:'None'};
    if(!apply) return {...plan,dryRun:true};
    const before=fingerprint(await finances(tx,b.BookingID,voucher.VoucherID)), correctionId=randomUUID(), actor=user.userName || 'Administrator';
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,correctionId).input('b',sql.Int,b.BookingID).input('gp',sql.Int,pass.GatePassID)
        .input('old',sql.Int,old.VehicleID).input('new',sql.Int,replacement.VehicleID).input('oc',sql.NVarChar(50),oldChassis).input('nc',sql.NVarChar(50),newChassis)
        .input('movement',sql.BigInt,last).input('date',sql.DateTime,deliveredAt).input('reason',sql.NVarChar(500),reason.trim()).input('actor',sql.NVarChar(100),actor)
        .query(`INSERT dms_DeliveredChassisCorrections(CorrectionID,BookingID,GatePassID,OldVehicleID,NewVehicleID,OldChassis,NewChassis,LastOldDeliveryMovementID,OriginalDeliveredAt,Reason,ActorName)
            VALUES(@id,@b,@gp,@old,@new,@oc,@nc,@movement,@date,@reason,@actor);`);
    await new sql.Request(tx).input('b',sql.Int,b.BookingID).input('new',sql.Int,replacement.VehicleID).input('gp',sql.Int,pass.GatePassID)
        .input('chassis',sql.NVarChar(50),newChassis).query(`
            UPDATE dms_SalesBookings SET AllocatedVehicleID=@new,UpdatedAt=GETDATE() WHERE BookingID=@b;
            UPDATE dms_GatePasses SET VehicleChassis=@chassis WHERE GatePassID=@gp;`);
    await new sql.Request(tx).input('b',sql.Int,b.BookingID).input('v',sql.Int,replacement.VehicleID).input('date',sql.DateTime,deliveredAt).input('actor',sql.NVarChar(100),actor)
        .query(`UPDATE dms_Vehicle SET CurrentBookingID=@b,Status='Delivered',SoldDeliveredAt=@date,UpdatedAt=GETDATE(),UpdatedByName=@actor WHERE VehicleID=@v;
            UPDATE dms_OpenAllocationLedger SET Status='Sold',SoldAt=@date,SoldToBookingID=@b WHERE VehicleID=@v AND Status='AtDealer';`);
    await new sql.Request(tx).input('b',sql.Int,b.BookingID).input('v',sql.Int,old.VehicleID).input('actor',sql.NVarChar(100),actor)
        .query(`UPDATE dms_Vehicle SET CurrentBookingID=NULL,Status='AtDealer',SoldDeliveredAt=NULL,UpdatedAt=GETDATE(),UpdatedByName=@actor WHERE VehicleID=@v;
            UPDATE dms_OpenAllocationLedger SET Status='AtDealer',SoldAt=NULL,SoldToBookingID=NULL WHERE VehicleID=@v AND SoldToBookingID=@b AND Status='Sold';`);
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,correctionId).query('UPDATE dms_DeliveredChassisCorrections SET CompletedAtUtc=SYSUTCDATETIME() WHERE CorrectionID=@id');
    await new sql.Request(tx).input('b',sql.Int,b.BookingID).input('old',sql.NVarChar(sql.MAX),JSON.stringify({VehicleID:old.VehicleID,Chassis:oldChassis,GatePassID:pass.GatePassID}))
        .input('new',sql.NVarChar(sql.MAX),JSON.stringify({...plan,CorrectionID:correctionId})).input('reason',sql.NVarChar(500),reason.trim())
        .input('actor',sql.NVarChar(100),actor).input('uid',sql.Int,user.userId || null).query(`
            INSERT dms_SalesAuditLog(BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorName,ActorUserID,Notes)
            VALUES(@b,'Booking',@b,'CorrectDeliveredChassis',@old,@new,@actor,@uid,@reason);`);
    await new sql.Request(tx).input('b',sql.Int,b.BookingID).input('state',sql.NVarChar(30),b.Status).input('actor',sql.NVarChar(100),actor)
        .input('reason',sql.NVarChar(sql.MAX),`Corrected issued chassis ${oldChassis} to ${newChassis}; ${pass.GatePassNo} retained; accounting unchanged. ${reason.trim()}`)
        .query(`INSERT dms_BookingStateTransitions(BookingID,FromState,ToState,ActorName,ActorRole,Reason)
            VALUES(@b,@state,@state,@actor,'Administrator correction',@reason);`);
    if(before!==fingerprint(await finances(tx,b.BookingID,voucher.VoucherID))) fail('Accounting or another booking field changed; roll back the correction.');
    const state=(await new sql.Request(tx).input('old',sql.Int,old.VehicleID).input('new',sql.Int,replacement.VehicleID).query(`
        SELECT v.VehicleID,v.Status,v.CurrentBookingID,CASE WHEN ${vehicleDeliveryLockedSql('v')} THEN 1 ELSE 0 END AS IsDeliveryLocked
        FROM dms_Vehicle v WHERE VehicleID IN (@old,@new);`)).recordset;
    if(state.find(v=>v.VehicleID===old.VehicleID)?.IsDeliveryLocked || !state.find(v=>v.VehicleID===replacement.VehicleID)?.IsDeliveryLocked)
        fail('Delivery protection verification failed; roll back the correction.');
    return {...plan,CorrectionID:correctionId,FinancialRecordsUnchanged:true};
}
module.exports={correctDeliveredChassis};
