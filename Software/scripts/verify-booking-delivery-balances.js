/** Local SQL verification: all booking/payment/audit fixtures roll back. */
require('dotenv').config({path:require('path').join(__dirname,'..','.env')});
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),Module=require('module');
const {sql,getPool}=require('../config/db');
const {setDeliveryMonth}=require('../services/bookingDeliveryMonthService');
(async()=>{
    if(!['.','localhost','127.0.0.1',require('os').hostname().toLowerCase()].includes((process.env.DB_SERVER||'').split('\\')[0].toLowerCase()))
        throw new Error('Run against the local development database only.');
    const pool=await getPool(),tx=new sql.Transaction(pool),marker='BDM-'+Date.now();
    await tx.begin();
    try{
        const rq=()=>new sql.Request(tx);
        const refs=(await rq().query(`SELECT TOP(1) PartyID FROM gen_PartiesInfo ORDER BY PartyID;
            SELECT TOP(1) VariantID,ModelID FROM dms_VehicleVariant ORDER BY VariantID;
            SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo ORDER BY EmployeeID;
            SELECT TOP(1) UserID,UserName FROM GLUser ORDER BY UserID`)).recordsets;
        assert.ok(refs.every(r=>r.length),'Local party/variant/employee/user fixtures required.');
        const user={userId:refs[3][0].UserID,userName:refs[3][0].UserName,employeeId:refs[2][0].EmployeeID,modules:['sales_executive']};
        async function booking(suffix,{price=1000,paid=250,premium=0,status='PendingPayment',historical=false,month=null,date='2026-01-01'}={}){
            const created=await rq().input('no',sql.NVarChar(20),marker+suffix).input('party',sql.Int,refs[0][0].PartyID)
                .input('variant',sql.Int,refs[1][0].VariantID).input('model',sql.Int,refs[1][0].ModelID).input('emp',sql.Int,user.employeeId)
                .input('price',sql.Decimal(18,2),price).input('status',sql.NVarChar(30),status).input('hist',sql.Bit,historical)
                .input('month',sql.Date,month?new Date(month+'-01T00:00Z'):null).input('date',sql.DateTime,new Date(date+'T00:00Z'))
                .query(`INSERT INTO dms_SalesBookings (BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,NegotiatedPrice,
                    AmountPaidToDate,PremiumAmount,Status,CreatedBy_SalesExecutiveID,IsHistorical,PromisedDeliveryMonth,BookingDate)
                    OUTPUT INSERTED.BookingID VALUES(@no,@party,@model,@variant,1000,@price,0,0,@status,@emp,@hist,@month,@date)`);
            const id=created.recordset[0].BookingID;
            if(paid) await rq().input('id',sql.Int,id).input('amt',sql.Decimal(18,2),paid).input('prem',sql.Decimal(18,2),premium)
                .query(`INSERT INTO dms_SalesPayments(BookingID,PaymentPath,PaymentMode,Amount,PremiumPortion,Status)
                    VALUES(@id,'Direct','Cash',@amt,@prem,'Posted')`);
            return id;
        }
        const partial=await booking('A',{paid:250,premium:200});
        const discounted=await booking('B',{price:900,paid:100,historical:true,month:'2026-12'});
        await booking('C',{paid:1000,month:'2026-12'});
        await booking('D',{paid:0,status:'Cancelled'});
        const closed=await booking('E',{paid:50,status:'Closed'});
        const financialSnapshot=async()=>JSON.stringify((await rq().query(`
            SELECT * FROM data_FinanceVoucherInfo ORDER BY VoucherID;
            SELECT * FROM data_FinanceVoucherDetail ORDER BY VoucherDetailID;
            SELECT * FROM dms_PartyLedger ORDER BY VoucherID,GLCAID;
            SELECT * FROM dms_SalesPayments ORDER BY PaymentID;
            SELECT BookingID,NegotiatedPrice,AmountPaidToDate,PremiumAmount,Status FROM dms_SalesBookings ORDER BY BookingID`)).recordsets);
        const before=await financialSnapshot();
        await setDeliveryMonth(tx,{bookingId:partial,month:'2026-11',expectedMonth:null,reason:'Customer delivery commitment',user});
        assert.equal(await financialSnapshot(),before,'Promised month must not alter financial records or booking state.');
        const timeline=(await rq().input('id',sql.Int,partial).query(`SELECT Action FROM dms_SalesAuditLog WHERE BookingID=@id;
            SELECT Reason FROM dms_BookingStateTransitions WHERE BookingID=@id`)).recordsets;
        assert.equal(timeline[0][0].Action,'PromisedDeliveryMonthChanged');assert.match(timeline[1][0].Reason,/2026-11/);

        const filename=path.join(__dirname,'..','controllers','customerVehicleBalanceController.js'),candidate=new Module(filename,module);
        candidate.filename=filename;candidate.paths=Module._nodeModulePaths(path.dirname(filename));
        const realRequire=Module.createRequire(filename);
        candidate.require=name=>name==='../config/db'?{sql,getPool:async()=>({request:rq})}:realRequire(name);
        candidate._compile(fs.readFileSync(filename,'utf8'),filename);
        async function report(extra={}){
            const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;}};
            await candidate.exports.report({query:{search:marker,...extra}},res);
            assert.equal(res.code,200,JSON.stringify(res.body));return res.body;
        }
        const all=await report();assert.equal(all.rows.length,3);
        assert.equal(all.rows.find(r=>r.BookingID===partial).Outstanding,750,'Premium must not reduce car debt.');
        assert.equal(all.rows.find(r=>r.BookingID===discounted).Outstanding,800,'Use discounted vehicle price and historical receipts.');
        assert.ok(all.rows.some(r=>r.BookingID===closed),'Unpaid completed bookings remain collectible.');
        assert.equal(all.totals.outstanding,2500);
        assert.deepEqual((await report({month:'2026-11'})).rows.map(r=>r.BookingID),[partial]);
        assert.deepEqual((await report({unpromised:'1'})).rows.map(r=>r.BookingID),[closed]);
        assert.equal((await report({from:'2026-01-01',to:'2026-01-01'})).totals.count,3,'Booking date filter is inclusive.');
        assert.equal((await report({from:'2026-01-02'})).totals.count,0);
        assert.equal((await report({status:'Closed'})).rows[0].BookingID,closed);
        await setDeliveryMonth(tx,{bookingId:partial,month:null,expectedMonth:'2026-11',reason:'Date no longer committed',user});
        assert.equal((await report({unpromised:'1'})).totals.count,2);
        assert.equal(await financialSnapshot(),before);
        console.log('PASS: real SQL promise set/clear + audit, unchanged financial data, discounted/partial/premium/historical balances, full/cancelled exclusions, completed debt and date/month filters.');
    }finally{await tx.rollback();}
    const remaining=await pool.request().input('prefix',sql.NVarChar(50),marker+'%').query('SELECT COUNT(*) AS N FROM dms_SalesBookings WHERE BookingNo LIKE @prefix');
    assert.equal(remaining.recordset[0].N,0);console.log('PASS: all fixtures rolled back.');
})().catch(err=>{console.error(err.message||err);process.exitCode=1;}).finally(()=>sql.close());
