// Local SQL only; all fixture/schema changes are rolled back.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const db=require('../config/db'),{sql}=db,realGetPool=db.getPool;
let tx;db.getPool=async()=>({request:()=>new sql.Request(tx)});
const controller=require('../controllers/workshopPerformanceController');
const service=require('../services/workshopPerformanceService');
const workshop=require('../controllers/workshopController');
const rq=()=>new sql.Request(tx);
const response=()=>({code:200,status(code){this.code=code;return this;},json(data){this.data=data;}});
async function report(method,query){const res=response();await controller[method]({query},res);assert.equal(res.code,200,res.data?.error);return res.data;}
(async()=>{
    assert.equal(process.env.DB_NAME,'temp_db1');assert.ok(['localhost','.','127.0.0.1'].includes(process.env.DB_SERVER.toLowerCase()),'Local development SQL only.');
    const pool=await realGetPool();tx=new sql.Transaction(pool);await tx.begin();
    try{
        const oldColumns=(await rq().query("SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('vw_WorkshopJobCards') ORDER BY column_id")).recordset.map(r=>r.name);
        const migration=fs.readFileSync(path.join(__dirname,'../migrations/170_workshop_technician_display.sql'),'utf8');
        await rq().query(migration);await rq().query(migration);
        const newColumns=(await rq().query("SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('vw_WorkshopJobCards') ORDER BY column_id")).recordset.map(r=>r.name);
        assert.ok(oldColumns.every(c=>newColumns.includes(c)),'Do not drop existing view columns.');assert.ok(newColumns.includes('CustomerDOB'));assert.ok(newColumns.includes('DMSJobCardNo'));
        const employees=(await rq().query('SELECT TOP(2) EmployeeID,EmployeeName FROM gen_EmployeeInfo ORDER BY EmployeeID')).recordset;
        const types=(await rq().query('SELECT TOP(2) JobCardTypeId FROM gen_JobCardType ORDER BY JobCardTypeId')).recordset;
        assert.equal(employees.length,2);assert.equal(types.length,2);
        const [a,b]=employees.map(e=>e.EmployeeID),[deptA,deptB]=types.map(t=>t.JobCardTypeId),marker='PERF'+Date.now();
        const newJob=async(suffix,dept,finalized,finalDate='2094-11-15T12:00:00Z')=>(await rq()
            .input('no',sql.NVarChar(50),`${marker}-${suffix}`).input('dms',sql.NVarChar(50),marker)
            .input('dept',sql.Int,dept).input('fin',sql.Bit,finalized)
            .input('date',sql.DateTime,finalized?new Date('2094-10-01T00:00:00Z'):new Date('2094-11-15T00:00:00Z'))
            .input('finalDate',sql.DateTime,finalized?new Date(finalDate):null).query(`
                INSERT Addata_JobCardInfo(JobCardNo,DMSJobCardNo,JobTypeId,JobCardDate,FinalizedAt,IsOld,IsFinalized,IsEstimatedRO,IsFIR,JobStatus)
                OUTPUT INSERTED.JobCardId VALUES(@no,@dms,@dept,@date,@finalDate,0,@fin,0,0,0)`)).recordset[0].JobCardId;
        const jobA=await newJob('A',deptA,true),jobB=await newJob('B',deptB,true),partsOnly=await newJob('C',deptA,true),
            outside=await newJob('OUT',deptB,true,'2094-12-01T00:00:00Z'),lastTick=await newJob('LAST',deptB,true,'2094-11-30T23:59:59.997Z'),draft=await newJob('DRAFT',deptB,false);
        const labour=async(job,tech,name,price,disc=0,qty=1,timed=false)=>(await rq().input('job',sql.Int,job).input('tech',sql.Int,tech)
            .input('name',sql.NVarChar(100),name).input('price',sql.Decimal(18,3),price).input('disc',sql.Decimal(18,3),disc).input('qty',sql.Decimal(18,3),qty)
            .input('start',sql.DateTime,timed?new Date('2094-11-15T10:00:00Z'):null).input('end',sql.DateTime,timed?new Date('2094-11-15T12:00:00Z'):null)
            .query(`INSERT Addata_JobCardInfoDetail(JobCardId,TechnicianId,PerformedByName,Price,DiscAmt,Quantity,Remarks,TaxAmount,JobStartTime,JobEndTime)
                OUTPUT INSERTED.DetailId VALUES(@job,@tech,@name,@price,@disc,@qty,'Synthetic work',999,@start,@end)`)).recordset[0].DetailId;
        const firstLine=await labour(jobA,a,'Technician A',100,10,7,true);
        await labour(jobA,b,'Technician B',60);await labour(jobA,a,'Technician A',50,5);
        await labour(jobA,null,null,30);await labour(jobA,null,'Legacy named technician',20);
        await labour(jobB,a,null,200);await labour(lastTick,b,'Technician B',25);
        await labour(outside,b,'Technician B',9000);await labour(draft,b,'Technician B',5000);
        const parts=async(job,qty,rate,disc)=>{
            const issue=(await rq().input('job',sql.Int,job).query(`INSERT data_StockIssuetoJobCard(JobCardId,IsTaxable) OUTPUT INSERTED.StockIssueID VALUES(@job,0)`)).recordset[0].StockIssueID;
            await rq().input('issue',sql.Int,issue).input('job',sql.Int,job).input('qty',sql.Decimal(18,3),qty).input('rate',sql.Decimal(18,3),rate).input('disc',sql.Decimal(18,3),disc)
                .query(`INSERT data_StockIssuetoJobCardDetail(StockIssueID,JobCardId,IssueQuantity,Quantity,StockRate,ItemRate,DiscAmt)
                    VALUES(@issue,@job,@qty,@qty,0,@rate,@disc)`);
        };
        await parts(jobA,2,100,20);await parts(jobA,1,50,5);await parts(partsOnly,1,30,0);
        await rq().input('a',sql.Int,jobA).input('b',sql.Int,partsOnly).query(`
            INSERT Addata_JobCardInfoSubletJobDetail(JobCardId,PayableAmount,TaxAmount) VALUES(@a,40,999),(@a,60,999),(@b,5,999)`);
        const scope={from:'2094-11-01',to:'2094-11-30',search:marker};
        const before=JSON.stringify((await rq().query(`SELECT COUNT_BIG(*) N FROM data_FinanceVoucherInfo;SELECT COUNT_BIG(*) N FROM GLvMAIN;
            SELECT COUNT_BIG(*) N FROM GLvDetail;SELECT COUNT_BIG(*) N FROM Addata_JobCardInfoDetail;`)).recordsets);
        const tech=await report('technicians',scope);
        assert.equal(tech.totals.netLabour,470);assert.equal(tech.totals.jobCards,3);assert.equal(tech.totals.jobLines,7);assert.equal(tech.totals.unassignedNet,30);
        assert.equal(tech.rows.find(r=>r.TechnicianId===a).NetLabour,335,'Line Price is already the gross amount; Quantity must not multiply it.');
        assert.equal(tech.rows.find(r=>r.TechnicianId===b).NetLabour,85);
        assert.equal(tech.rows.find(r=>r.TechnicianId===a).RecordedHours,2);
        const dept=await report('departments',scope);assert.equal(dept.totals.jobCards,4);assert.equal(dept.totals.NetBusiness,830);
        assert.equal(dept.rows.find(r=>r.DepartmentID===deptA).NetBusiness,605,'No fanout from multiple labour, parts and sublet lines.');
        assert.equal(dept.rows.find(r=>r.DepartmentID===deptB).NetBusiness,225);
        assert.equal((await report('technicians',{...scope,technicianId:a})).totals.netLabour,335);
        assert.equal((await report('technicians',{...scope,technicianId:'unassigned'})).totals.netLabour,30);
        assert.equal((await report('technicians',{...scope,departmentId:deptB})).totals.netLabour,225);
        assert.equal((await report('technicians',{...scope,finalized:'draft'})).totals.netLabour,5000);
        assert.equal((await report('technicians',{...scope,finalized:'all'})).totals.netLabour,5470);
        const detail=await report('technicians',{...scope,view:'details'});
        assert.equal(detail.rows.find(r=>r.DetailId===firstLine).NetLabour,90);
        assert.equal((await report('technicians',{...scope,search:marker+'_missing%['})).rows.length,0,'Wildcard characters are literal.');
        const view=(await rq().input('id',sql.Int,jobA).query('SELECT TechnicianNames FROM vw_WorkshopJobCards WHERE JobCardId=@id')).recordset[0];
        assert.equal(view.TechnicianNames.split('Technician A').length-1,1,'Deduplicate names on job cards.');
        assert.ok(view.TechnicianNames.includes('Technician B'));assert.ok(view.TechnicianNames.includes('Legacy named technician'));
        const cardRes=response();await workshop.getJobCardById({params:{id:jobA}},cardRes);assert.equal(cardRes.code,200,cardRes.data?.error);
        assert.equal(cardRes.data.LabourItems.find(r=>r.DetailId===firstLine).TechnicianName,'Technician A');
        // A desk save carries assignments from DB, ignoring display-only technician names.
        const {floorFieldCarrier}=require('../services/jobCardSaveService'),carry=await floorFieldCarrier(tx,jobA);
        assert.equal(carry({WorkDescription:'Synthetic work',Price:100}).TechnicianId,a);
        const after=JSON.stringify((await rq().query(`SELECT COUNT_BIG(*) N FROM data_FinanceVoucherInfo;SELECT COUNT_BIG(*) N FROM GLvMAIN;
            SELECT COUNT_BIG(*) N FROM GLvDetail;SELECT COUNT_BIG(*) N FROM Addata_JobCardInfoDetail;`)).recordsets);
        assert.equal(after,before,'Reports and display reads cannot change financial/work records.');
        console.log('PASS: view migration twice retains existing columns; Job Controller names on card/lines; billing-price revenue; mixed-tech unique counts; legacy/unassigned; exact boundary/finalization/technician/department/literal filters; parts/sublet without fanout; detailed work and floor-field preservation; records unchanged. All local fixtures rolled back.');
    }finally{await tx.rollback();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>sql.close());
