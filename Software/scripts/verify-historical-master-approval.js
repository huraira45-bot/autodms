/** Synthetic read-only checks for approved totals; no live booking is changed. */
require('dotenv').config({path:require('path').join(__dirname,'..','.env')});
const assert=require('assert/strict');
const {sql,getPool}=require('../config/db');
const {effectiveMasterPaidSql}=require('../services/historicalMasterApprovalService');
(async()=>{
 const pool=await getPool();
 try{
  for(const [historical,approved,ledger,expected] of [[1,1000,0,1000],[1,1000,1000,1000],[1,500,300,500],
   [1,500,700,700],[0,1000,0,0],[1,null,1000,1000]]){
   const r=await pool.request().input('bid',sql.Int,232).input('historic',sql.Bit,historical)
    .input('approved',sql.Decimal(18,2),approved).input('ledger',sql.Decimal(18,2),ledger).query(`
     WITH dms_SalesBookings AS (SELECT @bid AS BookingID,@historic AS IsHistorical,@approved AS HistoricalMasterApprovedAmount)
     SELECT ${effectiveMasterPaidSql('@bid','@ledger')} AS Paid`);
   assert.equal(Number(r.recordset[0].Paid),expected);
  }
  console.log('Passed 6 approved/matched SQL total scenarios; approvals and matches are not added twice.');
 }finally{await pool.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
