// Configure freight recovery only. No invoice, receipt, stock or journal changes.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const {sql,getPool}=require('../config/db');
(async()=>{
    const args=process.argv.slice(2),options={};
    for(let i=0;i<args.length;i++){
        if(args[i]==='--commit'){options.commit=true;continue;}
        if(!['--credit-code','--reason'].includes(args[i])||!args[i+1])throw Error('Use --credit-code GL_CODE --reason "reason" [--commit].');
        options[args[i].slice(2)]=args[++i];
    }
    if(!options['credit-code']||!options.reason||options.reason.trim().length<5||options.reason.length>500)throw Error('An explicit account code and reason (5-500 characters) are required.');
    const pool=await getPool(),tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try{
        const rq=()=>new sql.Request(tx);
        const check=(await rq().query("SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.dms_SystemAccounts') AND name='CK_SystemAccounts_RoleKey'")).recordset[0]?.definition;
        if(!check?.includes('STORE_SALE_FREIGHT_RECOVERY'))throw Error('Apply migration 171_store_sale_freight_recovery.sql first.');
        const accounts=(await rq().input('code',sql.NVarChar(50),options['credit-code']).query('SELECT GLCAID,GLCode,GLTitle,isParent FROM GLChartOFAccount WHERE GLCode=@code')).recordset;
        if(accounts.length!==1||accounts[0].isParent)throw Error('Select an existing unique leaf account.');
        const account=accounts[0],role='STORE_SALE_FREIGHT_RECOVERY';
        const current=(await rq().input('role',sql.NVarChar(50),role).query('SELECT GLCAID FROM dms_SystemAccounts WITH(UPDLOCK,HOLDLOCK) WHERE RoleKey=@role')).recordset[0];
        if(current&&current.GLCAID!==account.GLCAID)throw Error('Freight recovery is already configured to another account. Review Accounting Setup before changing it.');
        if(!current){
            const admin=(await rq().query('SELECT TOP(1) Userid,UserName FROM GLUser WHERE GroupID=1 AND Active=1 ORDER BY Userid')).recordset[0];
            if(!admin)throw Error('An active main Administrator is required for the setup audit.');
            await rq().input('role',sql.NVarChar(50),role).input('gl',sql.Int,account.GLCAID).input('by',sql.Int,admin.Userid)
                .input('name',sql.NVarChar(100),(admin.UserName+' (owner-approved freight setup)').slice(0,100)).input('reason',sql.NVarChar(500),options.reason.trim()).query(`
                INSERT dms_SystemAccounts(RoleKey,GLCAID,AssignedBy,AssignedByName) VALUES(@role,@gl,@by,@name);
                INSERT dms_SystemAccountAudit(RoleKey,OldGLCAID,NewGLCAID,ChangedBy,ChangedByName,Reason) VALUES(@role,NULL,@gl,@by,@name,@reason);`);
        }
        if(options.commit)await tx.commit();else await tx.rollback();
        console.log(JSON.stringify({committed:!!options.commit,changed:!current,role,GLCode:account.GLCode,GLTitle:account.GLTitle,noInvoiceOrStockChanges:true},null,2));
    }catch(error){try{await tx.rollback();}catch{}throw error;}
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>sql.close());