// Development verification: every migration/fixture change is rolled back.
// Run from Software: node scripts/verify-vehicle-inventory.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const db = require('../config/db');
const { sql } = db;
const realGetPool = db.getPool;
let activeTx;
db.getPool = async () => ({ request: () => new sql.Request(activeTx) });
const catalog = require('../controllers/salesCatalogController');
const reports = require('../controllers/vehicleInventoryReportController');
const legacyReports = require('../controllers/salesReportsController');
const {correctDeliveredChassis}=require('../services/deliveredChassisCorrectionService');
const { markVehicleDelivered } = require('../services/vehicleDeliveryLockService');
const { handleSalesVoucherPosted } = require('../services/salesVoucherPostHookService');
const user = { userId: 1, employeeId: null, groupId: 1, userName: 'Inventory verification' };
const response = () => ({ code: 200, status(code) { this.code=code;return this; }, json(data) { this.data=data; } });
const query = text => new sql.Request(activeTx).query(text);

async function invoke(method, request) {
    const res=response();await method({ query:{},body:{},user,...request },res);
    assert.ok(res.code<400, `${res.code}: ${res.data?.error}`);return res.data;
}
async function fixture(pool, check) {
    activeTx=new sql.Transaction(pool);
    await activeTx.begin();
    let aborted=false;activeTx.on('rollback',()=>{aborted=true;});
    try {
        await query(fs.readFileSync(path.join(__dirname,'../migrations/161_vehicle_inventory_ledger_delivery_lock.sql'),'utf8'));
        await query(fs.readFileSync(path.join(__dirname,'../migrations/162_booking_backed_vehicle_delivery_lock.sql'),'utf8'));
        await query(fs.readFileSync(path.join(__dirname,'../migrations/167_delivered_chassis_corrections.sql'),'utf8'));
        const model=(await query('SELECT TOP(1) ModelID FROM dms_VehicleModel ORDER BY ModelID')).recordset[0];
        assert.ok(model,'Development database needs a vehicle model.');
        const variants=(await new sql.Request(activeTx).input('model',sql.Int,model.ModelID).query(`
            DECLARE @ids TABLE(VariantID INT);
            INSERT dms_VehicleVariant(ModelID,VariantCode,VariantName,StandardPrice,WholesalePrice)
            OUTPUT INSERTED.VariantID INTO @ids VALUES(@model,'VERIFY-VAR-A','Verification variant A',100,100),
                (@model,'VERIFY-VAR-B','Verification variant B',100,100);
            SELECT VariantID FROM @ids ORDER BY VariantID;`)).recordset;
        const create=async (suffix,variant=variants[0].VariantID) => invoke(catalog.createVehicle,{body:{
            VariantID:variant,ChasisNo:`VERIFY-CHASSIS-${suffix}`,EngineNo:`VERIFY-ENGINE-${suffix}`,Status:'AtDealer',AllocationType:'OpenAllocation',
        }});
        const first=await create('A');
        await check({ variants,create,vehicleId:first.VehicleID });
    } finally {
        if(!aborted) {try{await activeTx.rollback();}catch(e){if(e.code!=='ENOTBEGUN'&&e.code!=='EABORT')throw e;}}
    }
}
async function delivered(vehicleId) {
    const booking=(await query('SELECT TOP(1) BookingID FROM dms_SalesBookings ORDER BY BookingID')).recordset[0];
    assert.ok(booking,'Development database needs a booking.');
    await new sql.Request(activeTx).input('bid',sql.Int,booking.BookingID).input('vid',sql.Int,vehicleId).query(`
        UPDATE dms_Vehicle SET CurrentBookingID=@bid,Status='Allocated' WHERE VehicleID=@vid;
        UPDATE dms_SalesBookings SET AllocatedVehicleID=@vid,Status='GatePassIssued',GatePassIssuedAt=GETDATE(),
            DeliveredAt=GETDATE(),AmountPaidToDate=NegotiatedPrice WHERE BookingID=@bid;
        INSERT dms_GatePasses(GatePassNo,DocType,DocID,PassReason,AmountInvoiced,AmountReceived,IssuedAt,IssuedBy,IssuedByName)
        VALUES('GP-INVENTORY-VERIFY','BOOKING',@bid,'PAID_FULL',0,0,GETDATE(),0,'Inventory verification');`);
    await markVehicleDelivered(activeTx,{vehicleId,bookingId:booking.BookingID,user});
    return booking.BookingID;
}

async function main() {
    const host=(process.env.DB_SERVER||'').split('\\')[0].toLowerCase();
    if(!['.','localhost','127.0.0.1',require('node:os').hostname().toLowerCase()].includes(host))
        throw new Error('Local development database only.');
    const pool=await realGetPool();
    if(process.argv.includes('--chassis-correction-only')) {
        await fixture(pool,async({vehicleId,create,variants})=>{
            await query(fs.readFileSync(path.join(__dirname,'../migrations/167_delivered_chassis_corrections.sql'),'utf8'));
            const newId=(await create('CORRECT')).VehicleID, bookingId=await delivered(vehicleId);
            const b=(await new sql.Request(activeTx).input('b',sql.Int,bookingId).query('SELECT BookingNo FROM dms_SalesBookings WHERE BookingID=@b')).recordset[0];
            const voucher=(await new sql.Request(activeTx).input('b',sql.Int,bookingId).query(`
                INSERT data_FinanceVoucherInfo(VoucherDate,VoucherNo,VoucherTypeID,Remarks,TotalAmount,Status,Posted,SourceDocType,SourceDocID)
                OUTPUT INSERTED.VoucherID SELECT GETDATE(),'JV-CHASSIS-VERIFY',MIN(VoucherTypeID),'Original chassis narration retained',100,'Draft',0,'SALES_DELIVERY',@b FROM data_FinanceVoucherInfo;
            `)).recordset[0];
            await new sql.Request(activeTx).input('b',sql.Int,bookingId).input('v',sql.Int,voucher.VoucherID).query(`
                UPDATE dms_SalesBookings SET DeliveryVoucherID=@v,VehicleVariantID=(SELECT VariantID FROM dms_Vehicle WHERE VehicleID=${vehicleId}) WHERE BookingID=@b;
                INSERT data_FinanceVoucherDetail(VoucherID,GLCAID,Narration,Debit,Credit,BookingID)
                SELECT @v,MIN(GLCAID),'Original financial line retained',100,0,@b FROM GLChartOFAccount;`);
            const bookingBefore=(await new sql.Request(activeTx).input('b',sql.Int,bookingId).query('SELECT * FROM dms_SalesBookings WHERE BookingID=@b')).recordset[0];
            const pass=(await new sql.Request(activeTx).input('b',sql.Int,bookingId).query(`
                UPDATE dms_GatePasses SET VehicleChassis='VERIFY-CHASSIS-A' WHERE DocType='BOOKING' AND DocID=@b;
                SELECT * FROM dms_GatePasses WHERE DocType='BOOKING' AND DocID=@b AND RevokedAt IS NULL;`)).recordset[0];
            const beforeFinance=(await query(`SELECT COUNT(*) AS N,SUM(TotalAmount) AS A FROM data_FinanceVoucherInfo;
                SELECT COUNT(*) AS N,SUM(Debit) AS D,SUM(Credit) AS C FROM data_FinanceVoucherDetail;
                SELECT COUNT(*) AS N FROM dms_PartyLedger;
                SELECT COUNT(*) AS N FROM GLvMAIN;SELECT COUNT(*) AS N FROM GLvDetail;`)).recordsets;
            const beforeHistory=(await new sql.Request(activeTx).input('old',sql.Int,vehicleId).input('new',sql.Int,newId)
                .query('SELECT * FROM dms_VehicleInventoryLedger WHERE VehicleID IN(@old,@new) ORDER BY MovementID')).recordset;
            const options={bookingNo:b.BookingNo,oldChassis:'VERIFY-CHASSIS-A',newChassis:'VERIFY-CHASSIS-CORRECT',reason:'Owner confirmed the original chassis was selected accidentally',user:{...user,groupId:1}};
            await assert.rejects(correctDeliveredChassis(activeTx,{...options,user:{...user,groupId:2}}),/Administrator/);
            await assert.rejects(correctDeliveredChassis(activeTx,{...options,oldChassis:'VERIFY-MISSING'}),/Both chassis/);
            const preview=await correctDeliveredChassis(activeTx,options);assert.equal(preview.dryRun,true);
            assert.equal((await query('SELECT COUNT(*) AS N FROM dms_DeliveredChassisCorrections')).recordset[0].N,0);
            const result=await correctDeliveredChassis(activeTx,{...options,apply:true});assert.equal(result.FinancialRecordsUnchanged,true);
            const rows=(await invoke(catalog.listVehicles,{query:{search:'VERIFY-CHASSIS'}}));
            const old=rows.find(v=>v.VehicleID===vehicleId), replacement=rows.find(v=>v.VehicleID===newId);
            assert.equal(old.Status,'AtDealer');assert.equal(old.CurrentBookingID,null);assert.equal(old.IsDeliveryLocked,false);
            assert.equal(replacement.Status,'Delivered');assert.equal(replacement.CurrentBookingID,bookingId);assert.equal(replacement.IsDeliveryLocked,true);
            assert.equal(new Date(replacement.SoldDeliveredAt).getTime(),new Date(result.OriginalDeliveredAt).getTime());
            const afterPass=(await new sql.Request(activeTx).input('id',sql.Int,pass.GatePassID).query('SELECT * FROM dms_GatePasses WHERE GatePassID=@id')).recordset[0];
            assert.equal(afterPass.VehicleChassis,options.newChassis);delete afterPass.VehicleChassis;delete pass.VehicleChassis;assert.deepEqual(afterPass,pass);
            const afterBooking=(await new sql.Request(activeTx).input('b',sql.Int,bookingId).query('SELECT * FROM dms_SalesBookings WHERE BookingID=@b')).recordset[0];
            assert.equal(afterBooking.AllocatedVehicleID,newId);for(const key of ['AllocatedVehicleID','UpdatedAt']) {delete afterBooking[key];delete bookingBefore[key];}assert.deepEqual(afterBooking,bookingBefore);
            assert.deepEqual((await query(`SELECT COUNT(*) AS N,SUM(TotalAmount) AS A FROM data_FinanceVoucherInfo;
                SELECT COUNT(*) AS N,SUM(Debit) AS D,SUM(Credit) AS C FROM data_FinanceVoucherDetail;
                SELECT COUNT(*) AS N FROM dms_PartyLedger;SELECT COUNT(*) AS N FROM GLvMAIN;SELECT COUNT(*) AS N FROM GLvDetail;`)).recordsets,beforeFinance);
            const afterHistory=(await new sql.Request(activeTx).input('old',sql.Int,vehicleId).input('new',sql.Int,newId)
                .query('SELECT * FROM dms_VehicleInventoryLedger WHERE VehicleID IN(@old,@new) ORDER BY MovementID')).recordset;
            assert.deepEqual(afterHistory.slice(0,beforeHistory.length),beforeHistory);assert.equal(afterHistory.length,beforeHistory.length+2);
            assert.equal(afterHistory.slice(beforeHistory.length).reduce((n,r)=>n+r.QuantityIn-r.QuantityOut,0),0);
            assert.equal((await correctDeliveredChassis(activeTx,{...options,apply:true})).alreadyCorrected,true);
            await invoke(catalog.updateVehicle,{params:{id:String(vehicleId)},body:{Color:'Released stock editable'}});
            const locked=response();await catalog.updateVehicle({params:{id:String(newId)},body:{Color:'Must remain locked'},user},locked);assert.equal(locked.code,423);
            const summary=await invoke(reports.summary,{query:{variantId:String(variants[0].VariantID),inStockOnly:'1'}});assert.equal(summary.totals.InStock,1);
            // The correction excuses only the original delivery movement. A later
            // genuine delivery must lock this chassis again, even with missing headers.
            await new sql.Request(activeTx).input('v',sql.Int,vehicleId).input('b',sql.Int,bookingId).query(`
                INSERT dms_VehicleInventoryLedger(VehicleID,VariantID,ModelID,ChasisNo,OccurredAtUtc,EntryType,BookingID,QuantityIn,QuantityOut)
                SELECT v.VehicleID,v.VariantID,vr.ModelID,v.ChasisNo,SYSUTCDATETIME(),'Delivered',@b,0,0
                FROM dms_Vehicle v JOIN dms_VehicleVariant vr ON vr.VariantID=v.VariantID WHERE v.VehicleID=@v;`);
            assert.equal((await invoke(catalog.getVehicle,{params:{id:String(vehicleId)}})).IsDeliveryLocked,true);
            await assert.rejects(new sql.Request(activeTx).input('v',sql.Int,vehicleId).query("UPDATE dms_Vehicle SET Color='Future delivery must remain locked' WHERE VehicleID=@v"),error=>error.number===51061);
        });
        await fixture(pool,async({vehicleId})=>{
            await new sql.Request(activeTx).input('v',sql.Int,vehicleId).query(`
                INSERT dms_DeliveredChassisCorrections(CorrectionID,BookingID,GatePassID,OldVehicleID,NewVehicleID,OldChassis,NewChassis,LastOldDeliveryMovementID,OriginalDeliveredAt,Reason,ActorName,CompletedAtUtc)
                VALUES(NEWID(),-1,-1,@v,-1,'SYNTHETIC-OLD','SYNTHETIC-NEW',-1,GETDATE(),'Immutable correction test','Local verifier',SYSUTCDATETIME());`);
            await assert.rejects(new sql.Request(activeTx).input('v',sql.Int,vehicleId).query('DELETE dms_DeliveredChassisCorrections WHERE OldVehicleID=@v'),error=>error.number===51068);
        });
        console.log('PASS: audited correction frees only wrong chassis, protects replacement, preserves all booking/pass fields and finances, appends stock history, dry-run/idempotence/role validation; rolled back.');
        return;
    }
    if (process.argv.includes('--reports-only')) {
        await fixture(pool,async({ variants,create,vehicleId })=>{
            const chassis=new Set(['VERIFY-CHASSIS-A']);
            for(const status of ['AtMaster','InTransit','Allocated','Delivered','Sold','Returned']) {
                const created=await create('REPORT-'+status);chassis.add('VERIFY-CHASSIS-REPORT-'+status);
                await new sql.Request(activeTx).input('v',sql.Int,created.VehicleID).input('status',sql.NVarChar(20),status)
                    .query("UPDATE dms_Vehicle SET Status=@status,AllocationType='Booked' WHERE VehicleID=@v");
            }
            const stale=await create('REPORT-GATEPASS');chassis.add('VERIFY-CHASSIS-REPORT-GATEPASS');
            const booking=(await query('SELECT TOP(1) BookingID FROM dms_SalesBookings ORDER BY BookingID')).recordset[0];
            assert.ok(booking,'Development database needs a booking.');
            await new sql.Request(activeTx).input('v',sql.Int,stale.VehicleID).input('b',sql.Int,booking.BookingID)
                .query('UPDATE dms_SalesBookings SET AllocatedVehicleID=@v,GatePassIssuedAt=GETDATE() WHERE BookingID=@b');
            const variantId=String(variants[0].VariantID);
            const all=await invoke(reports.summary,{query:{variantId}});
            assert.equal(all.totals.TotalVehicles,8);assert.equal(all.totals.InStock,4);
            assert.equal(all.totals.Delivered,3);assert.equal(all.totals.Returned,1);
            const stock=await invoke(reports.summary,{query:{variantId,inStockOnly:'1'}});
            assert.equal(stock.totals.TotalVehicles,4);assert.equal(stock.totals.InStock,4);
            assert.equal(stock.totals.Delivered,0);assert.equal(stock.totals.Returned,0);
            assert.equal(stock.totals.Allocated,1);assert.equal(stock.totals.OpenAllocation,1);
            const deliveredOnly=await create('REPORT-DELIVERY-ONLY',variants[1].VariantID);
            await new sql.Request(activeTx).input('v',sql.Int,deliveredOnly.VehicleID).query("UPDATE dms_Vehicle SET Status='Delivered' WHERE VehicleID=@v");
            assert.equal((await invoke(reports.summary,{query:{variantId:String(variants[1].VariantID),inStockOnly:'1'}})).rows.length,0);
            const listed=await invoke(legacyReports.vehicleInventory,{query:{inStockOnly:'1'}});
            const rows=listed.rows.filter(row=>chassis.has(row.ChasisNo));
            assert.equal(rows.length,4);assert.deepEqual(rows.map(row=>row.Status).sort(),['Allocated','AtDealer','AtMaster','InTransit']);
            const allListed=await invoke(legacyReports.vehicleInventory,{query:{}});
            const staleRow=allListed.rows.find(row=>row.ChasisNo==='VERIFY-CHASSIS-REPORT-GATEPASS');
            assert.equal(staleRow.Status,'Delivered');
            assert.ok((await new sql.Request(activeTx).input('v',sql.Int,vehicleId).query('SELECT VehicleID FROM dms_Vehicle WHERE VehicleID=@v')).recordset.length);
        });
        console.log('PASS: real SQL inventory reports include all undelivered booked/allocated stock; delivered/sold/returned and stale gate-pass statuses excluded before counts, totals and exports. All fixtures/migrations rolled back.');
        return;
    }
    await fixture(pool,async({variants,create,vehicleId})=>{
        await invoke(catalog.updateVehicle,{params:{id:String(vehicleId)},body:{Color:'Blue',Status:'InTransit'}});
        await invoke(catalog.updateVehicle,{params:{id:String(vehicleId)},body:{Status:'AtDealer'}});
        const second=(await create('B')).VehicleID;
        await new sql.Request(activeTx).input('v',sql.Int,second).input('variant',sql.Int,variants[1].VariantID)
            .query('UPDATE dms_Vehicle SET VariantID=@variant WHERE VehicleID=@v');
        await invoke(catalog.deleteVehicle,{params:{id:String(second)}});
        const ledger=await invoke(reports.ledger,{query:{search:'VERIFY-'}});
        assert.equal(ledger.totals.Opening,0);assert.equal(ledger.totals.QuantityIn,3);
        assert.equal(ledger.totals.QuantityOut,2);assert.equal(ledger.totals.Closing,1);
        const history=ledger.rows.filter(r=>r.VehicleID===second);
        assert.ok(history.some(r=>r.EntryType==='VariantOut'));
        assert.ok(history.some(r=>r.EntryType==='VariantIn'));
        assert.ok(history.some(r=>r.EntryType==='Removed'));
        const summary=await invoke(reports.summary,{query:{variantId:String(variants[0].VariantID)}});
        assert.equal(summary.rows[0].InStock,1);
        assert.equal(summary.rows[0].AtDealer,1);
        await invoke(catalog.deleteVariant,{params:{id:String(variants[1].VariantID)}});
        const options=await invoke(reports.options,{});assert.ok(options.variants.some(v=>v.VariantID===variants[1].VariantID));
        await invoke(catalog.updateVehicle,{params:{id:String(vehicleId)},body:{Status:'Returned'}});
        assert.equal((await invoke(reports.ledger,{query:{search:'VERIFY-'}})).totals.Closing,0);
        await invoke(catalog.updateVehicle,{params:{id:String(vehicleId)},body:{Status:'AtDealer'}});
        assert.equal((await invoke(reports.ledger,{query:{search:'VERIFY-'}})).totals.Closing,1);
        const before=(await query('SELECT COUNT(*) AS Qty FROM dms_VehicleInventoryLedger')).recordset[0].Qty;
        await query(fs.readFileSync(path.join(__dirname,'../migrations/161_vehicle_inventory_ledger_delivery_lock.sql'),'utf8'));
        await query(fs.readFileSync(path.join(__dirname,'../migrations/162_booking_backed_vehicle_delivery_lock.sql'),'utf8'));
        await query(fs.readFileSync(path.join(__dirname,'../migrations/162_booking_backed_vehicle_delivery_lock.sql'),'utf8'));
        assert.equal((await query('SELECT COUNT(*) AS Qty FROM dms_VehicleInventoryLedger')).recordset[0].Qty,before);
    });
    console.log('PASS: register/receive/edit/variant-transfer/delete, reports, options and balances; rolled back.');
    await fixture(pool,async({vehicleId,create})=>{
        // Reproduce an old Delivered label with no booking, pass or linked
        // delivery history. A label alone must not make the row immutable.
        await new sql.Request(activeTx).input('v',sql.Int,vehicleId).query("UPDATE dms_Vehicle SET Status='Delivered',SoldDeliveredAt=GETDATE() WHERE VehicleID=@v");
        let row=await invoke(catalog.getVehicle,{params:{id:String(vehicleId)}});
        assert.equal(row.IsDeliveryLocked,false);assert.equal(row.Status,'Delivered');
        await invoke(catalog.updateVehicle,{params:{id:String(vehicleId)},body:{Color:'Corrected',Status:'Delivered'}});
        row=await invoke(catalog.getVehicle,{params:{id:String(vehicleId)}});
        assert.equal(row.Color,'Corrected');assert.equal(row.Status,'Delivered');
        await invoke(catalog.updateVehicle,{params:{id:String(vehicleId)},body:{Status:'AtDealer'}});
        row=await invoke(catalog.getVehicle,{params:{id:String(vehicleId)}});
        assert.equal(row.Status,'AtDealer');assert.equal(row.SoldDeliveredAt,null);
        assert.equal((await invoke(reports.ledger,{query:{search:'VERIFY-'}})).totals.Closing,1);
        const unused=(await create('UNLINKED')).VehicleID;
        await new sql.Request(activeTx).input('v',sql.Int,unused).query("UPDATE dms_Vehicle SET Status='Delivered' WHERE VehicleID=@v");
        await invoke(catalog.deleteVehicle,{params:{id:String(unused)}});
        assert.equal((await new sql.Request(activeTx).input('v',sql.Int,unused).query('SELECT VehicleID FROM dms_Vehicle WHERE VehicleID=@v')).recordset.length,0);
        assert.ok((await invoke(reports.ledger,{query:{search:'VERIFY-'}})).rows.some(r=>r.VehicleID===unused&&r.EntryType==='Removed'));
    });
    console.log('PASS: unlinked Delivered label permits edit/delete; explicit stock correction clears stale date and records one stock restoration; rolled back.');
    for(const source of ['chassis-pass','delivery-history']) {
        await fixture(pool,async({vehicleId})=>{
            const booking=(await query('SELECT TOP(1) BookingID FROM dms_SalesBookings ORDER BY BookingID')).recordset[0];
            const request=new sql.Request(activeTx).input('v',sql.Int,vehicleId).input('b',sql.Int,booking.BookingID);
            if(source==='chassis-pass') await request.query(`INSERT dms_GatePasses(GatePassNo,DocType,DocID,VehicleChassis,PassReason,AmountInvoiced,AmountReceived,IssuedAt,IssuedBy,IssuedByName)
                SELECT 'GP-CHASSIS-VERIFY','BOOKING',@b,ChasisNo,'PAID_FULL',0,0,GETDATE(),0,'Inventory verification' FROM dms_Vehicle WHERE VehicleID=@v`);
            else await request.query(`INSERT dms_VehicleInventoryLedger(VehicleID,VariantID,ModelID,ChasisNo,OccurredAtUtc,EntryType,BookingID,QuantityIn,QuantityOut)
                SELECT v.VehicleID,v.VariantID,vr.ModelID,v.ChasisNo,SYSUTCDATETIME(),'Delivered',@b,0,0 FROM dms_Vehicle v JOIN dms_VehicleVariant vr ON vr.VariantID=v.VariantID WHERE v.VehicleID=@v`);
            const row=await invoke(catalog.getVehicle,{params:{id:String(vehicleId)}});
            assert.equal(row.CurrentBookingID,null);assert.equal(row.IsDeliveryLocked,true);
            const res=response();await catalog.updateVehicle({params:{id:String(vehicleId)},body:{Color:'Tampered'},user},res);
            assert.equal(res.code,423);
            await assert.rejects(new sql.Request(activeTx).input('v',sql.Int,vehicleId).query("UPDATE dms_Vehicle SET Color='Tampered' WHERE VehicleID=@v"),e=>e.number===51061);
        });
    }
    console.log('PASS: chassis gate-pass and immutable booking delivery history still protect vehicles after header links are absent; rolled back.');
    await fixture(pool,async({vehicleId,variants})=>{
        const bookingId=await delivered(vehicleId);
        const status=(await new sql.Request(activeTx).input('v',sql.Int,vehicleId).query('SELECT Status FROM dms_Vehicle WHERE VehicleID=@v')).recordset[0].Status;
        assert.equal(status,'Delivered');
        for(const [method,body]of [[catalog.updateVehicle,{Color:'Tampered'}],[catalog.deleteVehicle,{}]]) {
            const res=response();await method({params:{id:String(vehicleId)},body,user},res);assert.equal(res.code,423);
        }
        const before=(await invoke(reports.ledger,{query:{search:'VERIFY-'}})).rows.length;
        // Accounting metadata remains writable so late Master invoice processing
        // after delivery is still possible; inventory history must not change.
        await new sql.Request(activeTx).input('v',sql.Int,vehicleId).query('UPDATE dms_Vehicle SET MasterInvoiceVoucherID=123456,UpdatedAt=GETDATE() WHERE VehicleID=@v');
        const ledger=await invoke(reports.ledger,{query:{search:'VERIFY-'}});
        assert.equal(ledger.rows.length,before);assert.equal(ledger.totals.Closing,0);
        assert.equal(ledger.rows.filter(r=>r.EntryType==='Delivered').length,1);
        await markVehicleDelivered(activeTx,{vehicleId,bookingId,user});
        const deliveryDate=(await new sql.Request(activeTx).input('v',sql.Int,vehicleId)
            .query('SELECT SoldDeliveredAt FROM dms_Vehicle WHERE VehicleID=@v')).recordset[0].SoldDeliveredAt.getTime();
        await handleSalesVoucherPosted(999999,'SALES_DELIVERY',bookingId,user);
        const afterFinalize=await invoke(reports.ledger,{query:{search:'VERIFY-'}});
        assert.equal(afterFinalize.rows.length,before);
        assert.equal((await new sql.Request(activeTx).input('v',sql.Int,vehicleId)
            .query('SELECT SoldDeliveredAt FROM dms_Vehicle WHERE VehicleID=@v')).recordset[0].SoldDeliveredAt.getTime(),deliveryDate);
        const summary=await invoke(reports.summary,{query:{variantId:String(variants[0].VariantID)}});
        assert.equal(summary.rows[0].Delivered,1);assert.equal(summary.rows[0].InStock,0);
        const report=await invoke(catalog.listVehicles,{query:{search:'VERIFY-'}});
        assert.equal(report[0].IsDeliveryLocked,true);
    });
    console.log('PASS: delivered status, administrator lock, idempotence, late invoices and no second stock issue/date change at voucher finalization; rolled back.');
    for(const mutation of ['UPDATE dms_Vehicle SET Color=N\'Tampered\' WHERE VehicleID=@v',
        'UPDATE dms_Vehicle SET ChasisNo=LOWER(ChasisNo) WHERE VehicleID=@v',
        "UPDATE dms_Vehicle SET ChasisNo=ChasisNo+' ' WHERE VehicleID=@v",'DELETE FROM dms_Vehicle WHERE VehicleID=@v']) {
        await fixture(pool,async({vehicleId})=>{
            await delivered(vehicleId);
            if(mutation.startsWith('DELETE')) await new sql.Request(activeTx).input('v',sql.Int,vehicleId).query(`
                DELETE FROM dms_OpenAllocationLedger WHERE VehicleID=@v;
                UPDATE dms_SalesBookings SET AllocatedVehicleID=NULL WHERE AllocatedVehicleID=@v;`);
            await assert.rejects(new sql.Request(activeTx).input('v',sql.Int,vehicleId).query(mutation),error=>error.number===51061);
        });
    }
    console.log('PASS: database rejects direct edits/deletion of delivered vehicles; rolled back.');
    for(const mutation of ['DELETE FROM dms_VehicleInventoryLedger WHERE VehicleID=@v', "UPDATE dms_VehicleInventoryLedger SET ChasisNo='Tampered' WHERE VehicleID=@v"]) {
        await fixture(pool,async({vehicleId})=>{
            await assert.rejects(new sql.Request(activeTx).input('v',sql.Int,vehicleId).query(mutation),error=>error.number===51062);
        });
    }
    console.log('PASS: movement history cannot be edited or deleted; rolled back.');
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;}).finally(()=>sql.close());
