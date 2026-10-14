/** Read-only SQL regression checks; every data table is shadowed by synthetic CTEs. */
require('dotenv').config({path:require('path').join(__dirname,'..','.env')});
const assert=require('assert/strict');
const {sql,getPool}=require('../config/db');
const {masterPositionSql,historicalPayOrderSql}=require('../services/masterPaymentPositionService');
const {MASTER_CAPACITY_SQL}=require('../services/historicalMasterAllocationService');
const {legacyMasterCodeSql}=require('../services/historicalMasterAccountService');
const tables=[
 ['GLChartOFAccount',[['GLCAID','INT'],['GLCode','NVARCHAR(30)']]],
 ['data_FinanceVoucherInfo',[['VoucherID','INT'],['VoucherNo','NVARCHAR(50)'],['Status','NVARCHAR(20)'],['ReversesVoucherID','INT'],['SourceDocType','NVARCHAR(30)'],['SourceDocID','INT'],['VoucherDate','DATETIME']]],
 ['data_FinanceVoucherDetail',[['VoucherID','INT'],['GLCAID','INT'],['Debit','DECIMAL(18,2)'],['Credit','DECIMAL(18,2)'],['BookingID','INT']]],
 ['dms_SalesPayments',[['PaymentID','INT'],['BookingID','INT'],['VoucherID','INT'],['Amount','DECIMAL(18,2)'],['PremiumPortion','DECIMAL(18,2)'],['IsLinkedVoucher','INT'],['Status','NVARCHAR(20)'],['PaymentMode','NVARCHAR(30)'],['LinkedVoucherGLCAID','INT'],['HistoricalMasterGLCAID','INT']]],
 ['dms_HistoricalMasterAllocations',[['AllocationID','INT'],['BookingID','INT'],['VoucherID','INT'],['GLCAID','INT'],['Amount','DECIMAL(18,2)']]]
];
function fixture(){
 return {GLChartOFAccount:[[201,'102006021'],[101,'102001006'],[102,'102001005'],[777,'101001001'],[301,'201001001'],[302,'201001002']],
  data_FinanceVoucherInfo:[[20,'JV-OPEN','Posted',null,null,null]],
  data_FinanceVoucherDetail:[[20,101,1000,0,null],[20,301,0,1000,null]],
  dms_SalesPayments:[[1,7,20,1000,0,1,'Posted','PayOrder',301]],
  dms_HistoricalMasterAllocations:[[0,0,0,0,0]]};
}
function ctes(data){
 return 'WITH '+tables.map(([name,columns])=>name+' AS (SELECT * FROM (VALUES '+data[name].map(row=>'('+columns.map(([,type],index)=>{
  const value=row[index]??null;
  return 'CAST('+(value===null?'NULL':typeof value==='number'?String(value):"N'"+String(value).replaceAll("'","''")+"'")+' AS '+type+')';
 }).join(',')+')').join(',')+
  ') synthetic('+columns.map(([column])=>column).join(',')+'))').join(',')+'\n';
}

const cases=[];
function add(name,change,expected){cases.push({name,change,expected});}
add('legacy Oshan pay order',()=>{}, {7:1000});
add('current account pay order',d=>d.data_FinanceVoucherDetail[0][1]=201,{7:1000});
add('cash receipt',d=>d.dms_SalesPayments[0][7]='Cash',{7:0});
add('normal unlinked payment',d=>d.dms_SalesPayments[0][5]=0,{7:0});
add('voided payment',d=>d.dms_SalesPayments[0][6]='Reversed',{7:0});
add('draft source',d=>d.data_FinanceVoucherInfo[0][2]='Draft',{7:0});
add('reversed source',d=>d.data_FinanceVoucherInfo[0][2]='Reversed',{7:0});
add('reversal mirror source',d=>d.data_FinanceVoucherInfo[0][3]=19,{7:0});
add('bank debit is not a Master pay order',d=>d.data_FinanceVoucherDetail[0][1]=777,{7:0});
add('wrong customer account',d=>d.dms_SalesPayments[0][8]=302,{7:0});
add('customer debit is not a receipt',d=>{d.data_FinanceVoucherDetail[1][2]=1000;d.data_FinanceVoucherDetail[1][3]=0;},{7:0});
add('premium cannot travel on Master pay order',d=>d.dms_SalesPayments[0][4]=50,{7:0});
add('source cannot cover payment',d=>d.data_FinanceVoucherDetail[0][2]=999.99,{7:0});
add('shared opening supports independent bookings',d=>{
 d.dms_SalesPayments=[[1,7,20,400,0,1,'Posted','PayOrder',301],[2,8,20,600,0,1,'Posted','PayOrder',302]];
 d.data_FinanceVoucherDetail=[[20,101,1000,0,null],[20,301,0,400,null],[20,302,0,600,null]];
},{7:400,8:600});
add('shared opening total cannot exceed Master amount',d=>{
 d.dms_SalesPayments=[[1,7,20,400,0,1,'Posted','PayOrder',301],[2,8,20,600.01,0,1,'Posted','PayOrder',302]];
 d.data_FinanceVoucherDetail=[[20,101,1000,0,null],[20,301,0,400,null],[20,302,0,600.01,null]];
},{7:0,8:0});
add('same booking manual allocation takes precedence',d=>d.dms_HistoricalMasterAllocations=[[1,7,20,101,1000]],{7:1000});
add('other booking manual allocation shares remaining capacity',d=>{
 d.dms_SalesPayments[0][3]=400;d.data_FinanceVoucherDetail[1][3]=400;
 d.dms_HistoricalMasterAllocations=[[1,8,20,101,600]];
},{7:400,8:600});
add('manual reservation cannot be reused by pay order',d=>d.dms_HistoricalMasterAllocations=[[1,8,20,101,600]],{7:0,8:600});
add('existing legacy booking tag counted once',d=>d.data_FinanceVoucherDetail[0][4]=7,{7:1000});
add('normal posted direct-pay-order voucher counted once',d=>{
 d.data_FinanceVoucherInfo[0][4]='SALES_PAYMENT';
 d.data_FinanceVoucherDetail[0][1]=201;d.data_FinanceVoucherDetail[0][4]=7;
},{7:1000});
add('delivery credit clears the actual legacy account',d=>{
 d.data_FinanceVoucherInfo.push([22,'JV-DEL','Posted',null,'SALES_DELIVERY',7]);
 d.data_FinanceVoucherDetail.push([22,101,0,1000,7]);
},{7:0});
add('reversed tagged original plus posted mirror nets zero',d=>{
 d.data_FinanceVoucherInfo=[[20,'BPV-OLD','Reversed',null,'PAY_MASTER',7],[21,'BPV-REV','Posted',20,'REVERSAL',20]];
 d.data_FinanceVoucherDetail=[[20,201,1000,0,7],[21,201,0,1000,7]];
 d.dms_SalesPayments[0][5]=0;
},{7:0});
add('two possible Master debit accounts require explicit allocation',d=>{
 d.data_FinanceVoucherDetail[0][2]=500;d.data_FinanceVoucherDetail.push([20,201,500,0,null]);
},{7:0});

// Separate customer and Master opening journals, as in BK-2026-0232.
function splitOpening(d) {
 d.data_FinanceVoucherInfo=[[20,'JV-OB-CUSTOMERS','Posted',null,'VOUCHER',null,'2024-07-01'],
     [88,'JV-OB-MASTER','Posted',null,'VOUCHER',null,'2024-06-30']];
 d.data_FinanceVoucherDetail=[[20,301,0,1000,null],[20,999,1000,0,null],[88,101,1000,0,null],[88,999,0,1000,null]];
 d.dms_SalesPayments=[[1,7,20,1000,0,1,'Posted','PayOrder',301,101]];
}
add('separate opening customer and Master vouchers',splitOpening,{7:1000});
add('shared same opening resolves the vehicle Master account',d=>{
 d.data_FinanceVoucherInfo[0][1]='JV-OB-SHARED';
 d.dms_SalesPayments[0][9]=101;
 d.data_FinanceVoucherDetail.push([20,201,500,0,null]);
},{7:1000});
add('opening recognition requires a vehicle account snapshot',d=>{splitOpening(d);d.dms_SalesPayments[0][9]=null;},{7:0});
add('ordinary capital journal cannot borrow a Master opening balance',d=>{splitOpening(d);d.data_FinanceVoucherInfo[0][1]='JV-ORDINARY';},{7:0});
add('opening customer voucher must still be posted',d=>{splitOpening(d);d.data_FinanceVoucherInfo[0][2]='Draft';},{7:0});
add('opening Master voucher must be posted',d=>{splitOpening(d);d.data_FinanceVoucherInfo[1][2]='Draft';},{7:0});
add('reversed opening Master source is not reusable',d=>{splitOpening(d);d.data_FinanceVoucherInfo[1][2]='Reversed';},{7:0});
add('opening Master reversal mirror is not reusable',d=>{splitOpening(d);d.data_FinanceVoucherInfo[1][3]=80;},{7:0});
add('generated Master voucher is not an opening source',d=>{splitOpening(d);d.data_FinanceVoucherInfo[1][4]='PAY_MASTER';},{7:0});
add('future Master opening cannot back an earlier customer balance',d=>{splitOpening(d);d.data_FinanceVoucherInfo[1][6]='2024-07-02';},{7:0});
add('two separate opening Master sources remain ambiguous',d=>{
 splitOpening(d);d.data_FinanceVoucherInfo.push([89,'JV-OB-SECOND','Posted',null,'VOUCHER',null,'2024-06-30']);
 d.data_FinanceVoucherDetail.push([89,101,1000,0,null]);
},{7:0});
add('non-Master account snapshot is not accepted',d=>{splitOpening(d);d.dms_SalesPayments[0][9]=999;},{7:0});
add('separate opening customer credit must cover the payment',d=>{splitOpening(d);d.data_FinanceVoucherDetail[0][3]=999.99;},{7:0});
add('opening reference without a payment link is not a remittance',d=>{splitOpening(d);d.dms_SalesPayments[0][5]=0;},{7:0});
add('opening cash payment is not a direct pay order',d=>{splitOpening(d);d.dms_SalesPayments[0][7]='Cash';},{7:0});
add('separate opening Master balance cannot be overused',d=>{splitOpening(d);d.data_FinanceVoucherDetail[2][2]=999.99;},{7:0});
add('separate opening subtracts another booking manual allocation',d=>{
 splitOpening(d);d.dms_SalesPayments[0][3]=400;d.dms_HistoricalMasterAllocations=[[1,8,88,101,600]];
},{7:400,8:600});
add('separate opening respects same booking manual allocation precedence',d=>{
 splitOpening(d);d.dms_HistoricalMasterAllocations=[[1,7,88,101,1000]];
},{7:1000});
add('two customer openings share one Master opening budget',d=>{
 splitOpening(d);d.data_FinanceVoucherInfo.push([21,'JV-OB-CUSTOMER2','Posted',null,'VOUCHER',null,'2024-07-01']);
 d.data_FinanceVoucherDetail[0][3]=400;d.data_FinanceVoucherDetail.push([21,302,0,600,null]);
 d.dms_SalesPayments=[[1,7,20,400,0,1,'Posted','PayOrder',301,101],[2,8,21,600,0,1,'Posted','PayOrder',302,101]];
},{7:400,8:600});
add('two customer openings cannot claim more than one Master opening',d=>{
 splitOpening(d);d.data_FinanceVoucherInfo.push([21,'JV-OB-CUSTOMER2','Posted',null,'VOUCHER',null,'2024-07-01']);
 d.data_FinanceVoucherDetail.push([21,302,0,1000,null]);
 d.dms_SalesPayments.push([2,8,21,1000,0,1,'Posted','PayOrder',302,101]);
},{7:0,8:0});
add('delivery settles the separate opening on its actual Master account',d=>{
 splitOpening(d);d.data_FinanceVoucherInfo.push([22,'JV-DEL','Posted',null,'SALES_DELIVERY',7,'2024-07-02']);
 d.data_FinanceVoucherDetail.push([22,101,0,1000,7]);
},{7:0});

(async()=>{
 const pool=await getPool();
 try{
  for(const test of cases){const data=fixture();test.change(data);
   for(const [booking,expected] of Object.entries(test.expected)){
    const result=await pool.request().input('bid',sql.Int,Number(booking)).input('gl',sql.Int,201)
      .query(ctes(data)+masterPositionSql('@bid','@gl'));
    const net=Math.round(result.recordset.reduce((sum,row)=>sum+Number(row.Net),0)*100)/100;
    assert.equal(net,expected,test.name+' booking '+booking);
   }
  }
  const data=fixture();data.data_FinanceVoucherDetail[0][1]=201;
  const capacity=(await pool.request().input('bid',sql.Int,7).input('gl',sql.Int,201).input('vid',sql.Int,20)
    .query(ctes(data)+MASTER_CAPACITY_SQL)).recordset[0];
  assert.equal(Number(capacity.LinkedAmount),1000);assert.equal(Number(capacity.DirectPayOrderAmount),1000);
  const rows=(await pool.request().input('gl',sql.Int,201).query(ctes(fixture())+historicalPayOrderSql('@gl'))).recordset;
  assert.equal(rows[0].GLCAID,101);assert.equal(Number(rows[0].Amount),1000);
  const split=fixture();splitOpening(split);
  const openingRows=(await pool.request().input('gl',sql.Int,201).query(ctes(split)+historicalPayOrderSql('@gl'))).recordset;
  assert.equal(openingRows[0].VoucherID,88);assert.equal(openingRows[0].PaymentVoucherID,20);assert.equal(openingRows[0].GLCAID,101);
  for(const [name,expected] of [
   ['DEEPAL S05 REEV','102001011'],['DEEPAL SO5','102001011'],['DEEPAL L07','102001008'],
   ['OSHAN X7 COMFORT','102001006'],['ALSVIN 1.37L COMFORT MT','102001005'],
   ['M9(SHERPA)','102001002'],['NEVO HUNTER K50','102001012'],['KARVAN COMFORT','102001001'],
   ['KARVAAN POWER PLUS','102001001'],['KARWAN + UG','102001001'],['Unknown vehicle',null]
  ]){
   const code=(await pool.request().input('vehicle',sql.NVarChar(200),name)
    .query('SELECT '+legacyMasterCodeSql('UPPER(@vehicle)')+' AS Code')).recordset[0].Code;
   assert.equal(code,expected,name);
  }
  console.log('Passed '+cases.length+' read-only SQL scenarios, 11 vehicle-account mappings and source-account/allocation-capacity checks.');
 }finally{await pool.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
