// Local development only. Synthetic records and all cancellations roll back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), os = require('node:os');
const db = require('../config/db'), sql = db.sql, realGetPool = db.getPool;
let outer, point = 0, failAt = null;
class NestedTransaction {
    constructor() { this.outer = outer; this.name = 'ClosedCancel' + (++point); }
    async begin() { await new sql.Request(outer).query(`SAVE TRANSACTION ${this.name}`); }
    async commit() {}
    async rollback() { await new sql.Request(outer).query(`ROLLBACK TRANSACTION ${this.name}`); }
}
class Request extends sql.Request {
    constructor(target) { super(target?.outer || target); }
    query(text) { return failAt && text.includes(failAt) ? Promise.reject(new Error('Synthetic audit failure')) : super.query(text); }
}
db.sql = { ...sql, Transaction: NestedTransaction, Request };
db.getPool = async () => ({ request: () => new Request(outer) });
const controller = require('../controllers/closedBookingCancellationController');
const bookingController = require('../controllers/salesBookingController');
const { markVehicleDelivered, vehicleDeliveryLockedSql } = require('../services/vehicleDeliveryLockService');
const request = () => new sql.Request(outer);
const user = { groupId: 1, userId: 1, userName: 'Local cancellation verifier', groupTitle: 'Administrator' };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
async function cancel(id, code = 200, actor = user) {
    const res = response(); await controller.cancel({ params: { id }, user: actor, body: { Reason: 'Synthetic duplicate closed booking' } }, res);
    assert.equal(res.code, code, res.body?.error); return res.body;
}
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host) || process.env.DB_NAME !== 'temp_db1')
        throw new Error('Local temp_db1 development database only.');
    const pool = await realGetPool(); outer = new sql.Transaction(pool); await outer.begin();
    const marker = 'CC' + Date.now();
    try {
        const refs = (await request().query(`SELECT TOP(1) VariantID,ModelID FROM dms_VehicleVariant;
            SELECT TOP(1) PartyID FROM gen_PartiesInfo;SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo;`)).recordsets;
        assert(refs.every(r => r.length), 'Development variant, party and employee required.');
        for (const historical of [false, true]) {
            const bookingId = (await request().input('no', sql.NVarChar(20), marker + (historical ? 'H' : 'N'))
                .input('party', sql.Int, refs[1][0].PartyID).input('model', sql.Int, refs[0][0].ModelID)
                .input('variant', sql.Int, refs[0][0].VariantID).input('emp', sql.Int, refs[2][0].EmployeeID).input('hist', sql.Bit, historical)
                .query(`INSERT dms_SalesBookings(BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,NegotiatedPrice,
                    CreatedBy_SalesExecutiveID,IsHistorical,Status,AmountPaidToDate,BookingDate,PromisedDeliveryMonth,ClosedAt)
                    OUTPUT INSERTED.BookingID VALUES(@no,@party,@model,@variant,1000,1000,@emp,@hist,'Closed',1000,'2026-09-01','2026-10-01',GETDATE())`)).recordset[0].BookingID;
            const vehicleId = (await request().input('chassis', sql.NVarChar(50), marker + (historical ? 'H' : 'N'))
                .input('variant', sql.Int, refs[0][0].VariantID).input('bid', sql.Int, bookingId)
                .query(`DECLARE @ids TABLE(VehicleID INT);
                    INSERT dms_Vehicle(VariantID,ChasisNo,EngineNo,AllocationType,Status,CurrentBookingID)
                    OUTPUT INSERTED.VehicleID INTO @ids VALUES(@variant,@chassis,@chassis,'Booked','Allocated',@bid);
                    SELECT VehicleID FROM @ids;`)).recordset[0].VehicleID;
            await request().input('id', sql.Int, bookingId).input('vid', sql.Int, vehicleId)
                .input('pass', sql.NVarChar(30), marker + (historical ? 'H' : 'N')).input('emp', sql.Int, refs[2][0].EmployeeID)
                .query(`UPDATE dms_SalesBookings SET AllocatedVehicleID=@vid,GatePassIssuedAt=GETDATE(),DeliveredAt=GETDATE() WHERE BookingID=@id;
                    INSERT dms_GatePasses(GatePassNo,DocType,DocID,PassReason,AmountInvoiced,AmountReceived,IssuedAt,IssuedBy,IssuedByName)
                    VALUES(@pass,'BOOKING',@id,'PAID_FULL',1000,1000,GETDATE(),0,'Local verifier');
                    DECLARE @doc TABLE(DocumentID INT);
                    INSERT dms_SalesDocuments(DocType,Description,FilePath,OriginalFileName,MimeType,SizeBytes,BookingID,UploadedByName)
                    OUTPUT INSERTED.DocumentID INTO @doc
                    VALUES('MasterInvoice','Synthetic invoice','uploads/sales/synthetic-cancellation.pdf','synthetic-cancellation.pdf','application/pdf',100,@id,'Local verifier');
                    INSERT dms_BookingMasterInvoices(BookingID,InvoiceNo,InvoiceDate,DocumentID,RecordedByUserID,RecordedByName)
                    SELECT @id,@pass,'2026-09-01',DocumentID,1,'Local verifier' FROM @doc;
                    INSERT dms_SalesIncentiveAccruals(BookingID,EarnerType,EarnerEmployeeID,IncentiveCategory,AmountAccrued,Status)
                    VALUES(@id,'Employee',@emp,'SalesStaff',10,'Accrued');
                    IF EXISTS(SELECT 1 FROM dms_SalesBookings WHERE BookingID=@id AND IsHistorical=0)
                        INSERT dms_SalesIncentiveAccruals(BookingID,EarnerType,IncentiveCategory,AmountAccrued,Status)
                        VALUES(@id,'Master','Standard',20,'Accrued');`);
            await markVehicleDelivered(outer, { vehicleId, bookingId, user });
            const read = async () => (await request().input('id', sql.Int, bookingId)
                .query('SELECT * FROM dms_SalesBookings WHERE BookingID=@id')).recordset[0];
            const retained = async () => (await request().input('id', sql.Int, bookingId).input('vid', sql.Int, vehicleId).query(`
                SELECT COUNT(*) AS N,SUM(TotalAmount) AS A FROM data_FinanceVoucherInfo;
                SELECT COUNT(*) AS N,SUM(Debit) AS D,SUM(Credit) AS C FROM data_FinanceVoucherDetail;
                SELECT COUNT(*) AS N FROM dms_PartyLedger;
                SELECT * FROM dms_SalesPayments WHERE BookingID=@id ORDER BY PaymentID;
                SELECT * FROM dms_SalesIncentiveAccruals WHERE BookingID=@id ORDER BY AccrualID;
                SELECT * FROM dms_Vehicle WHERE VehicleID=@vid;
                SELECT * FROM dms_GatePasses WHERE DocType='BOOKING' AND DocID=@id;
                SELECT * FROM dms_VehicleInventoryLedger WHERE VehicleID=@vid ORDER BY MovementID;
                SELECT * FROM dms_OpenAllocationLedger WHERE VehicleID=@vid;
                SELECT * FROM dms_SalesDocuments WHERE BookingID=@id;
                SELECT * FROM dms_BookingMasterInvoices WHERE BookingID=@id;
                SELECT * FROM dms_SalesBookingCancellations WHERE BookingID=@id;`)).recordsets;
            const before = await read(), beforeRetained = await retained();
            await cancel(bookingId, 403, { ...user, groupId: 2, modules: ['sales_admin_settings', 'admin_unfinalize'] });
            for (const failure of ['INSERT INTO dms_SalesAuditLog', 'INSERT INTO dms_BookingStateTransitions']) {
                failAt = failure; await cancel(bookingId, 500); failAt = null; assert.deepEqual(await read(), before);
            }
            await cancel(bookingId);
            const after = await read(); assert.equal(after.Status, 'Cancelled'); assert(after.CancelledAt); assert.equal(after.CancellationReason, 'Synthetic duplicate closed booking');
            const allowed = new Set(['Status', 'CancelledAt', 'CancellationReason', 'UpdatedAt', 'UpdatedByName', 'UpdatedByEmployeeID']);
            for (const k of Object.keys(before)) if (!allowed.has(k)) assert.deepEqual(after[k], before[k], k);
            assert.deepEqual(await retained(), beforeRetained, 'Financial, incentive, delivery, stock and attachment records must stay unchanged');
            const evidence = (await request().input('id', sql.Int, bookingId).input('vid', sql.Int, vehicleId).query(`
                SELECT * FROM dms_SalesAuditLog WHERE BookingID=@id;
                SELECT * FROM dms_BookingStateTransitions WHERE BookingID=@id;
                SELECT CAST(CASE WHEN ${vehicleDeliveryLockedSql('v')} THEN 1 ELSE 0 END AS BIT) AS Locked FROM dms_Vehicle v WHERE v.VehicleID=@vid;`)).recordsets;
            assert.equal(evidence[0].length, 1); assert.equal(evidence[0][0].Action, 'ClosedBookingCancelled'); assert.equal(evidence[0][0].ActorUserID, user.userId);
            assert.equal(JSON.parse(evidence[0][0].OldValue).Status, 'Closed'); assert.equal(JSON.parse(evidence[0][0].NewValue).Status, 'Cancelled');
            assert.equal(evidence[1].length, 1); assert.equal(evidence[1][0].FromState, 'Closed'); assert.equal(evidence[1][0].ToState, 'Cancelled'); assert.equal(evidence[2][0].Locked, true);
            await cancel(bookingId, 409);
            const list = response(); await bookingController.listCancelledBookings({ user, query: { search: marker } }, list);
            assert.equal(list.code, 200, list.body?.error); assert(list.body.some(b => b.BookingID === bookingId));
        }
        console.log('PASS: main Admin cancels regular and historical closed bookings; rejected roles, repeats and audit failures preserve state; strict audit and timeline persist; cancelled list includes bookings.');
        console.log('PASS: payments, financial totals, both staff and Master incentives, vehicle allocation, delivery timestamps, gate passes, stock ledger, attachments and delivered vehicle lock remain unchanged.');
    } finally { await outer.rollback(); }
    const remaining = (await pool.request().input('marker', sql.NVarChar(30), marker + '%')
        .query('SELECT COUNT(*) AS N FROM dms_SalesBookings WHERE BookingNo LIKE @marker')).recordset[0].N;
    assert.equal(remaining, 0); console.log('PASS: all synthetic fixtures rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.sql = sql; db.getPool = realGetPool; return sql.close(); });
