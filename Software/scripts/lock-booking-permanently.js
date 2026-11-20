require('dotenv').config();
const {sql,getPool}=require('../config/db');
const {permanentlyLockBooking}=require('../services/permanentBookingLockService');
const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i>=0?args[i+1]:null;};
(async()=>{let tx;try{
 const bookingNo=value('--booking'),expectedVoucherNo=value('--voucher'),reason=value('--reason');
 if(!bookingNo||!expectedVoucherNo||!reason)throw new Error('Required: --booking BK-2026-0312 --voucher JV-2200 --reason "Owner approved permanent lock" [--commit]');
 const pool=await getPool();tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 const admin=(await new sql.Request(tx).query('SELECT TOP(1) Userid,UserName FROM GLUser WHERE GroupID=1 AND Active=1 ORDER BY Userid')).recordset[0];
 if(!admin)throw new Error('Active main Administrator not found.');
 const apply=args.includes('--commit');
 const result=await permanentlyLockBooking(tx,{bookingNo,expectedVoucherNo,reason,user:{groupId:1,userId:admin.Userid,userName:admin.UserName+' (owner-approved permanent lock)'},apply});
 if(apply)await tx.commit();else await tx.rollback();tx=null;console.log(JSON.stringify(result,null,2));
}catch(e){if(tx)try{await tx.rollback()}catch{}console.error(e.stack);process.exitCode=1}finally{await sql.close()}})();
