const {sql,getPool}=require('../config/db');
const {logBookingTransition}=require('./salesBookingController');
const {approveHistoricalMaster,revokeHistoricalMaster}=require('../services/historicalMasterApprovalService');
exports.approve=async(req,res)=>{
 let tx;
 try{
  tx=new sql.Transaction(await getPool());await tx.begin();
  const result=await approveHistoricalMaster(tx,Number(req.params.id),req.body?.Amount,req.body?.Notes,req.user);
  await logBookingTransition(tx,result.booking.BookingID,result.booking.Status,result.booking.Status,req.user,
   `Historical Master payment confirmed: PKR ${result.Amount.toLocaleString('en-PK')} total paid. Voucher matching is optional; no ledger entry created.`);
  await tx.commit();res.json({message:'Master payment approved and counted as paid. Voucher matching is optional.',Amount:result.Amount});
 }catch(err){if(tx){try{await tx.rollback();}catch{}}res.status(err.statusCode||500).json({error:err.message});}
};
exports.revoke=async(req,res)=>{
 let tx;
 try{
  tx=new sql.Transaction(await getPool());await tx.begin();
  const booking=await revokeHistoricalMaster(tx,Number(req.params.id));
  await logBookingTransition(tx,booking.BookingID,booking.Status,booking.Status,req.user,
   'Historical Master confirmation removed. Existing voucher matches and ledger entries are unchanged.');
  await tx.commit();res.json({message:'Approval removed. Existing voucher matches remain.'});
 }catch(err){if(tx){try{await tx.rollback();}catch{}}res.status(err.statusCode||500).json({error:err.message});}
};
