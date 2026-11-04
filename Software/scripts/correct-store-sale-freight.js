// Administrator maintenance. Preview rolls back; --commit explicitly applies.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const {sql,getPool}=require('../config/db');
const {correctStoreSaleFreight}=require('../services/storeSaleFreightCorrectionService');
(async()=>{
    const options={},args=process.argv.slice(2);
    for(let i=0;i<args.length;i++){
        if(args[i]==='--commit'){options.commit=true;continue;}
        if(args[i]==='--configure-role'){options.configureRole=true;continue;}
        if(!['--sale-id','--voucher-id','--credit-code','--reason'].includes(args[i])||!args[i+1])throw new Error('Use --sale-id ID --voucher-id ID --credit-code GL_CODE --reason "reason" [--commit]');
        options[args[i].slice(2)]=args[++i];
    }
    const pool=await getPool(),tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try{
        const admin=(await new sql.Request(tx).query('SELECT TOP(1) Userid,UserName FROM GLUser WHERE GroupID=1 AND Active=1 ORDER BY Userid')).recordset[0];
        if(!admin)throw new Error('An active main administrator is required for the correction trail.');
        const result=await correctStoreSaleFreight(tx,{saleId:Number(options['sale-id']),expectedVoucherId:Number(options['voucher-id']),creditGLCode:options['credit-code'],
            reason:options.reason,configureRecoveryRole:Boolean(options.configureRole),user:{userId:admin.Userid,userName:`${admin.UserName} (owner-approved maintenance)`.slice(0,100),groupId:1}});
        if(options.commit)await tx.commit();else await tx.rollback();console.log(JSON.stringify({...result,committed:Boolean(options.commit)},null,2));
    }catch(error){try{await tx.rollback();}catch{}throw error;}
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>sql.close());
