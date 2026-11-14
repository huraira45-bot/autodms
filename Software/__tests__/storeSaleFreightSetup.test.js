const fs=require('fs'),path=require('path'),vm=require('vm');
const script=fs.readFileSync(path.join(__dirname,'../scripts/configure-store-sale-freight.js'),'utf8');
async function run(options={}){
 const queries=[],output=[],errors=[];
 const tx={begin:jest.fn(async()=>{}),commit:jest.fn(async()=>{}),rollback:jest.fn(async()=>{})};
 const db={getPool:async()=>({}),sql:{Int:'int',MAX:'max',ISOLATION_LEVEL:{SERIALIZABLE:'serial'},NVarChar:()=> 'text',close:jest.fn(async()=>{}),Transaction:class{constructor(){return tx;}},Request:class{
  constructor(){this.values={};}input(k,t,v){this.values[k]=v;return this;}async query(q){queries.push({q,v:this.values});
   if(q.includes('SELECT definition'))return{recordset:[{definition:options.missingMigration?'OLD_ROLES':'STORE_SALE_FREIGHT_RECOVERY'}]};
   if(q.includes('SELECT GLCAID,GLCode,GLTitle'))return{recordset:[{GLCAID:32897,GLCode:'502003029',GLTitle:'FREIGHT EXPENSE (PARTS)',isParent:!!options.parent}]};
   if(q.includes('SELECT GLCAID FROM dms_SystemAccounts'))return{recordset:options.existing?[{GLCAID:options.existing}]:[]};
   if(q.includes('SELECT TOP(1) Userid'))return{recordset:[{Userid:1,UserName:'admin'}]};
   if(options.failInsert&&q.includes('INSERT dms_SystemAccounts'))throw Error('Synthetic insert failure');
   return{recordset:[]};
  }
 }}};
 const process={argv:['node','configure','--credit-code','502003029','--reason','Owner approved freight recovery',...(options.commit?['--commit']:[])],exitCode:0};
 await vm.runInNewContext(script,{require:name=>name==='dotenv'?{config(){}}:name==='path'?path:db,__dirname:path.join(__dirname,'../scripts'),process,console:{log:v=>output.push(v),error:v=>errors.push(v)}});
 return{tx,queries,output,errors,process};
}
test('setup previews by default, rolling back its mapping and audit',async()=>{const r=await run();expect(r.process.exitCode).toBe(0);expect(r.tx.rollback).toHaveBeenCalledTimes(1);expect(r.tx.commit).not.toHaveBeenCalled();expect(JSON.parse(r.output[0])).toMatchObject({committed:false,changed:true,GLCode:'502003029'});expect(r.queries.every(x=>!/FinanceVoucher|StoreSale|StockInOut/.test(x.q))).toBe(true);});
test('setup commit records the approved account and config audit only',async()=>{const r=await run({commit:true});expect(r.tx.commit).toHaveBeenCalledTimes(1);const write=r.queries.find(x=>x.q.includes('INSERT dms_SystemAccounts'));expect(write.q).toContain('INSERT dms_SystemAccountAudit');expect(write.v).toMatchObject({gl:32897,role:'STORE_SALE_FREIGHT_RECOVERY',by:1});});
test('repeating setup with the same account adds no duplicate mapping or audit',async()=>{const r=await run({commit:true,existing:32897});expect(r.process.exitCode).toBe(0);expect(JSON.parse(r.output[0]).changed).toBe(false);expect(r.queries.some(x=>x.q.includes('INSERT'))).toBe(false);});
test.each([{existing:1},{missingMigration:true},{parent:true},{failInsert:true}])('setup rejects unsafe/failed config %j and rolls back',async options=>{const r=await run({...options,commit:true});expect(r.process.exitCode).toBe(1);expect(r.tx.rollback).toHaveBeenCalledTimes(1);expect(r.tx.commit).not.toHaveBeenCalled();});
