const {sql,getPool}=require('../config/db');
const locks=require('../services/bookingMonthLockService');
exports.list=async(req,res)=>{try{
 const year=Number(req.query.year);if(!Number.isInteger(year)||year<1753||year>9998)return res.status(400).json({error:'Choose a valid year.'});
 const r=await(await getPool()).request().input('year',sql.Int,year).query(`
 SELECT CONVERT(VARCHAR(7),m.MonthStart,23) Month,ISNULL(l.IsLocked,0) IsLocked,l.RevisionID,l.UpdatedAtUtc,l.UpdatedByName,l.Reason FROM (VALUES(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) n(MonthNo) CROSS APPLY(SELECT DATEFROMPARTS(@year,n.MonthNo,1) MonthStart)m LEFT JOIN dms_BookingMonthLocks l ON l.MonthStart=m.MonthStart ORDER BY m.MonthStart;
 SELECT TOP(100) CONVERT(VARCHAR(7),MonthStart,23) Month,IsLocked,AtUtc,ActorName,Reason FROM dms_BookingMonthLockHistory WHERE MonthStart>=DATEFROMPARTS(@year,1,1) AND MonthStart<DATEFROMPARTS(@year+1,1,1) ORDER BY HistoryID DESC;`);
 res.json({months:r.recordsets[0],history:r.recordsets[1]});
}catch(e){res.status(500).json({error:e.message});}};
exports.update=async(req,res)=>{let tx;try{
 tx=new sql.Transaction(await getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 const r=await locks.setMonthLock(tx,{month:req.params.month,locked:req.body?.Locked,reason:req.body?.Reason,expectedRevision:req.body?.ExpectedRevisionID,user:req.user});
 await tx.commit();res.json(r);
}catch(e){if(tx)try{await tx.rollback()}catch{}res.status(e.status||500).json({error:e.message});}};
