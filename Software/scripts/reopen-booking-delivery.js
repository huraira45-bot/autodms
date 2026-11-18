// Server-admin maintenance only. Defaults to validation; --commit performs one atomic reopen.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const {sql,getPool}=require('../config/db');
const {reopenBookingDelivery}=require('../services/bookingDeliveryReopenService');
(async()=>{
 const args=process.argv.slice(2),opts={};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--commit'){opts.apply=true;continue;}
  if(!['--booking','--chassis','--voucher','--gate-pass','--reason'].includes(args[i])||args[i+1]===undefined)throw new Error('Use --booking BK-YYYY-NNNN --chassis CHASSIS --voucher JV-NNNN --gate-pass GP-NNNNN --reason "reason" [--commit]');
  opts[args[i].slice(2)]=args[++i];
 }
 const pool=await getPool(),tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  const admin=(await new sql.Request(tx).query('SELECT TOP(1) Userid,UserName,LinkedEmployeeID FROM GLUser WHERE GroupID=1 AND Active=1 ORDER BY Userid')).recordset[0];
  if(!admin)throw new Error('No active main Administrator is available to attribute this correction.');
  const out=await reopenBookingDelivery(tx,{bookingNo:opts.booking,expectedChassis:opts.chassis,expectedVoucherNo:opts.voucher,expectedGatePassNo:opts['gate-pass'],reason:opts.reason,apply:opts.apply,
   user:{groupId:1,userId:admin.Userid,employeeId:admin.LinkedEmployeeID,userName:(admin.UserName+' (owner-approved delivery reopen)').slice(0,100)}});
  if(opts.apply)await tx.commit();else await tx.rollback();
  console.log(JSON.stringify({...out,committed:!!opts.apply},null,2));
 }catch(e){try{await tx.rollback();}catch{}throw e;}
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>sql.close());
