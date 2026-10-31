// Explicit server-administrator maintenance. Preview first; --commit applies one audited correction.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const {sql,getPool}=require('../config/db');
const {correctDeliveredChassis}=require('../services/deliveredChassisCorrectionService');
(async()=>{
    const args=process.argv.slice(2), options={};
    for(let i=0;i<args.length;i++) {
        if(args[i]==='--commit') {options.apply=true;continue;}
        if(!['--booking','--old','--new','--reason'].includes(args[i]) || args[i+1]===undefined) throw new Error('Use --booking BK-YYYY-NNNN --old OLD_CHASSIS --new CORRECT_CHASSIS --reason "reason" [--commit]');
        options[args[i].slice(2)]=args[++i];
    }
    const tx=new sql.Transaction(await getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const result=await correctDeliveredChassis(tx,{bookingNo:options.booking,oldChassis:options.old,newChassis:options.new,
            reason:options.reason,apply:options.apply,user:{groupId:1,userName:'Server administrator (owner-requested chassis correction)'}});
        if(options.apply) await tx.commit(); else await tx.rollback();
        console.log(JSON.stringify(result,null,2));
    } catch(error) {try{await tx.rollback();}catch{}throw error;}
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>sql.close());
