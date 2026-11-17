const {sql,getPool}=require('../config/db');
module.exports=async function extremeHistoricalGuard(req,res,next){
 try {
  const pool=await getPool();
  const r=await pool.request().input('id',sql.Int,Number(req.params.id)).query('SELECT IsExtremeHistorical FROM dms_SalesBookings WHERE BookingID=@id');
  if(r.recordset[0]?.IsExtremeHistorical) return res.status(409).json({error:'Extreme Historical Booking is plain data entry. Accounting, stock operations and voucher matching are disabled.'});
  return next();
 } catch(err){return res.status(500).json({error:err.message});}
};
