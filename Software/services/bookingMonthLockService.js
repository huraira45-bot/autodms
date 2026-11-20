const {sql}=require('../config/db');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function requireAdmin(req,res,next){if(Number(req.user?.groupId)===1)return next();return res.status(403).json({error:'Only the main Administrator can lock or unlock booking months.'});}
function parseMonth(value){if(typeof value!=='string'||!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)||value<'1753-01')fail('Choose a valid booking month (YYYY-MM).');return value+'-01';}
function validateChange({month,locked,reason,expectedRevision,user}){
 if(Number(user?.groupId)!==1||!user?.userId)fail('Only the main Administrator can lock or unlock booking months.',403);
 const date=parseMonth(month);
 if(typeof locked!=='boolean')fail('Locked must be true or false.');
 if(typeof reason!=='string'||reason.trim().length<5||reason.trim().length>500)fail('Enter a reason between 5 and 500 characters.');
 if(expectedRevision!==null&&(typeof expectedRevision!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(expectedRevision)))fail('Refresh month status before changing it.');
 return date;
}
async function setMonthLock(tx,input){
 const date=validateChange(input),{locked,reason,expectedRevision,user}=input;
 const rq=()=>new sql.Request(tx);
 const old=(await rq().input('month',sql.Date,date).query('SELECT * FROM dms_BookingMonthLocks WITH(UPDLOCK,HOLDLOCK) WHERE MonthStart=@month')).recordset[0];
 if(String(old?.RevisionID||'').toLowerCase()!==String(expectedRevision||'').toLowerCase())fail('This month changed. Refresh before saving.',409);
 if(old&&Boolean(old.IsLocked)===locked)return{month:input.month,locked,changed:false};
 await rq().input('month',sql.Date,date).input('locked',sql.Bit,locked).input('uid',sql.Int,user.userId).input('name',sql.NVarChar(100),user.userName||'Administrator').input('reason',sql.NVarChar(500),reason.trim()).query(`
 DECLARE @revision UNIQUEIDENTIFIER=NEWID();
 IF EXISTS(SELECT 1 FROM dms_BookingMonthLocks WHERE MonthStart=@month)
 UPDATE dms_BookingMonthLocks SET IsLocked=@locked,RevisionID=@revision,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserID=@uid,UpdatedByName=@name,Reason=@reason WHERE MonthStart=@month;
 ELSE INSERT dms_BookingMonthLocks(MonthStart,IsLocked,RevisionID,UpdatedByUserID,UpdatedByName,Reason) VALUES(@month,@locked,@revision,@uid,@name,@reason);
 INSERT dms_BookingMonthLockHistory(MonthStart,IsLocked,RevisionID,ActorUserID,ActorName,Reason) VALUES(@month,@locked,@revision,@uid,@name,@reason);`);
 return{month:input.month,locked,changed:true};
}
async function assertBookingVoidAllowed(executor,bookingId){
 const r=await new sql.Request(executor).input('id',sql.Int,bookingId).query(`SELECT CONVERT(VARCHAR(7),l.MonthStart,23) Month FROM dms_SalesBookings b JOIN dms_BookingMonthLocks l WITH(UPDLOCK,HOLDLOCK) ON l.IsLocked=1 AND l.MonthStart=DATEFROMPARTS(YEAR(COALESCE(b.BookingDate,b.CreatedAt)),MONTH(COALESCE(b.BookingDate,b.CreatedAt)),1) WHERE b.BookingID=@id`);
 if(r.recordset.length)fail('Booking month '+r.recordset[0].Month+' is locked. The main Administrator must unlock it before voiding a payment.',409);
}
module.exports={requireAdmin,parseMonth,validateChange,setMonthLock,assertBookingVoidAllowed};
