/** Development SQL verification. Every test record is rolled back. No files uploaded. */
require('dotenv').config({path:require('path').join(__dirname,'..','.env')});
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const db=require('../config/db'),{sql}=db;
const {recordMasterInvoiceDocument}=require('../services/bookingMasterInvoiceDocumentService');
const {requireUploadedMasterInvoice}=require('../services/masterInvoiceAccrualGuard');
const marker='MI-'+Date.now();
(async()=>{
    if(!['.','localhost','127.0.0.1',require('os').hostname().toLowerCase()].includes((process.env.DB_SERVER||'').split('\\')[0].toLowerCase()))
        throw new Error('Local development database only.');
    const pool=await db.getPool();
    async function scenario(work){
        const tx=new sql.Transaction(pool);await tx.begin();const rollback=tx.rollback.bind(tx),rq=()=>new sql.Request(tx);
        try{
            const refs=(await rq().query(`SELECT TOP(1) PartyID FROM gen_PartiesInfo;
                SELECT TOP(1) VariantID,ModelID FROM dms_VehicleVariant;
                SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo;
                SELECT TOP(1) UserID,UserName FROM GLUser;
                SELECT TOP(1) VehicleID FROM dms_Vehicle`)).recordsets;
            assert.ok(refs.every(r=>r.length),'Local party/variant/employee/user/vehicle fixtures required.');
            const user={userId:refs[3][0].UserID,userName:refs[3][0].UserName,employeeId:refs[2][0].EmployeeID,modules:['sales_master_settlement']};
            async function create(suffix,historical=false,status='Closed'){
                const r=await rq().input('no',sql.NVarChar(20),marker+suffix).input('pid',sql.Int,refs[0][0].PartyID)
                    .input('variant',sql.Int,refs[1][0].VariantID).input('model',sql.Int,refs[1][0].ModelID)
                    .input('employee',sql.Int,user.employeeId).input('hist',sql.Bit,historical).input('status',sql.NVarChar(30),status)
                    .input('vehicle',sql.Int,refs[4][0].VehicleID)
                    .query(`INSERT INTO dms_SalesBookings(BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,NegotiatedPrice,
                        Status,CreatedBy_SalesExecutiveID,IsHistorical,AllocatedVehicleID)
                        OUTPUT INSERTED.BookingID VALUES(@no,@pid,@model,@variant,1000,1000,@status,@employee,@hist,@vehicle)`);
                return r.recordset[0].BookingID;
            }
            const payload=id=>({bookingId:id,invoiceNo:'MASTER-'+id,invoiceDate:'2026-10-17',notes:'Development verification',user,
                file:{path:path.resolve(__dirname,'../uploads/sales',marker+'.pdf'),originalname:marker+'.pdf',mimetype:'application/pdf',size:100}});
            const accrual=async(id,earner='Master')=>rq().input('id',sql.Int,id).input('earner',sql.NVarChar(20),earner)
                .input('employee',sql.Int,earner==='Master'?null:user.employeeId)
                .input('category',sql.NVarChar(20),earner==='Master'?'Standard':'SalesStaff')
                .query(`INSERT INTO dms_SalesIncentiveAccruals(BookingID,EarnerType,EarnerEmployeeID,IncentiveCategory,AmountAccrued,Status)
                        VALUES(@id,@earner,@employee,@category,10,'Accrued')`);
            await work({tx,rq,create,payload,user,refs,accrual});
        }finally{
            try{await rollback();}catch(err){if(!['EABORT','ENOTBEGUN'].includes(err.code))throw err;}
        }
    }
    await scenario(async({tx,rq,create,payload,user,refs})=>{
        const normal=await create('A'),historical=await create('H',true,'GatePassIssued');
        const finances=async()=>JSON.stringify((await rq().query(`SELECT * FROM data_FinanceVoucherInfo ORDER BY VoucherID;
            SELECT * FROM data_FinanceVoucherDetail ORDER BY VoucherDetailID;
            SELECT * FROM dms_PartyLedger ORDER BY VoucherID,GLCAID;
            SELECT * FROM dms_SalesIncentiveAccruals ORDER BY AccrualID;
            SELECT * FROM dms_SalesPayments ORDER BY PaymentID;
            SELECT * FROM dms_Vehicle ORDER BY VehicleID;
            SELECT BookingID,Status,NegotiatedPrice,AmountPaidToDate FROM dms_SalesBookings ORDER BY BookingID`)).recordsets);
        const before=await finances();
        await assert.rejects(()=>requireUploadedMasterInvoice(tx,normal,'missing','2026-10-17'),/Upload and save/);
        await recordMasterInvoiceDocument(tx,payload(normal));await recordMasterInvoiceDocument(tx,payload(historical));
        assert.equal(await finances(),before,'Uploading invoice paperwork must not alter money, stock or booking state.');
        const bookingFilename=path.join(__dirname,'../controllers/salesBookingController.js'),bookingModule=new Module(bookingFilename,module);
        bookingModule.filename=bookingFilename;bookingModule.paths=Module._nodeModulePaths(path.dirname(bookingFilename));
        const bookingRequire=Module.createRequire(bookingFilename);
        bookingModule.require=name=>name==='../config/db'?{sql,getPool:async()=>({request:rq})}:bookingRequire(name);
        bookingModule._compile(fs.readFileSync(bookingFilename,'utf8'),bookingFilename);
        const loaded={status(n){throw new Error('Booking load HTTP '+n);},json(body){this.body=body;}};
        await bookingModule.exports.getBooking({params:{id:String(historical)}},loaded);
        assert.ok(loaded.body.MasterInvoiceDocumentID);assert.equal(loaded.body.MasterInvoiceNo,payload(historical).invoiceNo);
        assert.equal(loaded.body.Status,'GatePassIssued');assert.equal(loaded.body.MasterIncentiveAlreadyAccrued,0);
        await assert.rejects(()=>recordMasterInvoiceDocument(tx,payload(normal)),/already been uploaded/);
        await assert.rejects(()=>requireUploadedMasterInvoice(tx,historical,payload(historical).invoiceNo,'2026-10-17'),/Historical bookings/);
        await requireUploadedMasterInvoice(tx,normal,payload(normal).invoiceNo,'2026-10-17');

        // Execute the real lifecycle controller in the outer test transaction.
        // Its commit is held until the verifier rolls back the complete fixture.
        await rq().query('SAVE TRANSACTION MasterInvoiceProcessTest');
        tx.begin=async()=>{};tx.commit=async()=>{};tx.rollback=async()=>rq().query('ROLLBACK TRANSACTION MasterInvoiceProcessTest');
        const wrappedSql={...sql,Transaction:class{constructor(){return tx;}}};
        const filename=path.join(__dirname,'../controllers/salesLifecycleController.js'),candidate=new Module(filename,module);
        candidate.filename=filename;candidate.paths=Module._nodeModulePaths(path.dirname(filename));const realRequire=Module.createRequire(filename);
        candidate.require=name=>name==='../config/db'?{sql:wrappedSql,getPool:async()=>({request:rq})}:realRequire(name);
        candidate._compile(fs.readFileSync(filename,'utf8'),filename);
        // Force a positive Master incentive for this fixture variant only.
        await rq().input('id',sql.Int,refs[1][0].VariantID).query('UPDATE dms_VehicleVariant SET StandardIncentiveAmount=100 WHERE VariantID=@id');
        async function process(id){const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;}};
            await candidate.exports.postMasterInvoice({params:{id:String(id)},user,body:{MasterInvoiceNo:payload(id).invoiceNo,MasterInvoiceDate:'2026-10-17',WholesalePrice:1000}},res);
            return res;
        }
        const processed=await process(normal);assert.equal(processed.code,200,JSON.stringify(processed.body));assert.equal(processed.body.Status,'Closed');
        assert.equal(processed.body.IncentiveAccrued.standard,100);
        const closed=(await rq().input('id',sql.Int,normal).query('SELECT Status FROM dms_SalesBookings WHERE BookingID=@id')).recordset[0];
        assert.equal(closed.Status,'Closed');
        await assert.rejects(()=>requireUploadedMasterInvoice(tx,normal,payload(normal).invoiceNo,'2026-10-17'),/already been processed/);
        const historicalCount=(await rq().input('id',sql.Int,historical).query("SELECT COUNT(*) AS N FROM dms_SalesIncentiveAccruals WHERE BookingID=@id AND EarnerType='Master'")).recordset[0].N;
        assert.equal(historicalCount,0);
        console.log('PASS: regular/closed and historical/gate-passed invoice metadata, duplicate guard, unchanged upload finances, late regular Master processing preserves Closed, historical has no Master accrual.');
    });
    await scenario(async({create,accrual})=>{
        const id=await create('B');await accrual(id,'Employee');
        await assert.rejects(()=>accrual(id),/Master incentives require an uploaded/);
        console.log('PASS: SQL trigger blocks Master accrual without invoice; employee accrual remains allowed.');
    });
    await scenario(async({tx,create,payload,accrual})=>{
        const id=await create('C',true);await recordMasterInvoiceDocument(tx,payload(id));
        await assert.rejects(()=>accrual(id),/non-historical booking/);
        console.log('PASS: SQL trigger blocks historical Master accrual even with an uploaded invoice.');
    });
    const left=(await pool.request().input('no',sql.NVarChar(50),marker+'%').query('SELECT COUNT(*) AS N FROM dms_SalesBookings WHERE BookingNo LIKE @no')).recordset[0].N;
    assert.equal(left,0);console.log('PASS: all fixtures rolled back.');
})().catch(err=>{console.error(err.message||err);process.exitCode=1;}).finally(()=>sql.close());
