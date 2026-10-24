// Development-only SQL integration checks. All fixture changes are rolled back;
// invoice files are represented by test metadata, never written to disk.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const db = require('../config/db');
const { sql } = db;
const originalPool = db.getPool;
let tx;
db.getPool = async () => ({ request: () => new sql.Request(tx) });
const report = require('../controllers/deliveredMasterInvoiceReportController');
const { recordMasterInvoiceDocument } = require('../services/bookingMasterInvoiceDocumentService');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const rq = () => new sql.Request(tx);

(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host)) throw new Error('Local development database only.');
    const pool = await originalPool();
    tx = new sql.Transaction(pool); await tx.begin();
    try {
        const refs = (await rq().query(`SELECT TOP(1) PartyID FROM gen_PartiesInfo;
            SELECT TOP(1) VariantID,ModelID FROM dms_VehicleVariant;
            SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo;
            SELECT TOP(1) UserID,UserName FROM GLUser;`)).recordsets;
        assert.ok(refs.every(rows => rows.length), 'Existing development party/variant/employee/user required.');
        const marker = 'DMI' + Date.now();
        const user = { userId: refs[3][0].UserID, userName: refs[3][0].UserName, employeeId: refs[2][0].EmployeeID, modules: ['sales_master_settlement'] };
        await rq().input('id', sql.Int, refs[0][0].PartyID).input('name', sql.VarChar(100), `${marker} O'Brien_50%[west]~ CNIC 36302-1234567-8`)
            .query("UPDATE gen_PartiesInfo SET PartyName=@name,CNIC='36302-1234567-8' WHERE PartyID=@id");
        async function create(suffix, status, historical = false, delivered = null, gateStamp = null) {
            const result = await rq().input('no', sql.NVarChar(20), marker + suffix).input('party', sql.Int, refs[0][0].PartyID)
                .input('model', sql.Int, refs[1][0].ModelID).input('variant', sql.Int, refs[1][0].VariantID)
                .input('employee', sql.Int, user.employeeId).input('status', sql.NVarChar(30), status).input('hist', sql.Bit, historical)
                .input('delivered', sql.DateTime, delivered && new Date(delivered)).input('gate', sql.DateTime, gateStamp && new Date(gateStamp))
                .query(`INSERT INTO dms_SalesBookings(BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,NegotiatedPrice,
                    Status,CreatedBy_SalesExecutiveID,IsHistorical,DeliveredAt,GatePassIssuedAt)
                    OUTPUT INSERTED.BookingID VALUES(@no,@party,@model,@variant,1000,1000,@status,@employee,@hist,@delivered,@gate)`);
            return result.recordset[0].BookingID;
        }
        async function pass(id, suffix, revoked = false) {
            await rq().input('id', sql.Int, id).input('no', sql.NVarChar(30), marker + suffix).input('revoked', sql.Bit, revoked)
                .query(`INSERT dms_GatePasses(GatePassNo,DocType,DocID,PassReason,AmountInvoiced,AmountReceived,IssuedAt,IssuedBy,IssuedByName,RevokedAt)
                    VALUES(@no,'BOOKING',@id,'PAID_FULL',0,0,'2026-10-21T23:59:59',0,'Report verification',CASE WHEN @revoked=1 THEN GETDATE() END)`);
        }
        async function load(query = {}) {
            const res = response(); await report.report({ query }, res);
            assert.equal(res.code, 200, res.body?.error); return res.body;
        }
        const delivered = await create('A', 'Closed', false, '2026-10-20T23:59:59');
        const historical = await create('B', 'Closed', true, '2026-10-20T23:59:59');
        const allocated = await create('C', 'Allocated');
        const closedWithoutEvidence = await create('D', 'Closed');
        const stamped = await create('E', 'GatePassIssued', false, null, '2026-10-21T23:59:59');
        const passOnly = await create('F', 'Allocated'); await pass(passOnly, 'P');
        const revoked = await create('G', 'Closed'); await pass(revoked, 'R', true);
        const cancelled = await create('H', 'Cancelled', false, '2026-10-20T23:59:59');
        let rows = (await load({ search: marker })).rows;
        for (const id of [delivered, stamped, passOnly]) assert.ok(rows.some(r => r.BookingID === id), 'Real delivery omitted: ' + id);
        for (const id of [historical, allocated, closedWithoutEvidence, revoked, cancelled]) assert.ok(!rows.some(r => r.BookingID === id), 'Ineligible booking included: ' + id);
        const nameRows = (await load({ search: "O'Brien_50%[west]~" })).rows;
        assert.ok(nameRows.some(r => r.BookingID === delivered), 'Literal name punctuation search failed.');
        for (const search of ['36302-1234567-8', '3630212345678', '36302 1234567 8']) {
            assert.ok((await load({ search })).rows.some(r => r.BookingID === delivered), 'CNIC search failed: ' + search);
        }
        await rq().input('id', sql.Int, refs[0][0].PartyID).query('UPDATE gen_PartiesInfo SET CNIC=NULL WHERE PartyID=@id');
        assert.ok((await load({ search: '3630212345678' })).rows.some(r => r.BookingID === delivered), 'Embedded CNIC search failed.');
        rows = (await load({ search: marker, from: '2026-10-20', to: '2026-10-20' })).rows;
        assert.ok(rows.some(r => r.BookingID === delivered));
        assert.ok(!rows.some(r => [stamped, passOnly].includes(r.BookingID)), 'Date period must use delivery date.');
        const finances = async () => JSON.stringify((await rq().query(`SELECT * FROM data_FinanceVoucherInfo ORDER BY VoucherID;
            SELECT * FROM dms_PartyLedger ORDER BY VoucherID,GLCAID;
            SELECT * FROM dms_SalesIncentiveAccruals ORDER BY AccrualID;
            SELECT BookingID,Status,NegotiatedPrice,AmountPaidToDate,DeliveredAt,GatePassIssuedAt FROM dms_SalesBookings ORDER BY BookingID`)).recordsets);
        const moneyBefore = await finances();
        const saved = await recordMasterInvoiceDocument(tx, { bookingId: delivered, invoiceNo: marker, invoiceDate: '2026-10-22', user,
            notes: 'Development report verification', file: { path: path.join(__dirname, '../uploads/sales', marker + '.pdf'), originalname: marker + '.pdf', mimetype: 'application/pdf', size: 100 } });
        assert.equal(await finances(), moneyBefore, 'Upload must preserve finances, incentives and booking state.');
        assert.ok(!(await load({ search: marker })).rows.some(r => r.BookingID === delivered), 'Uploaded invoice must leave pending report.');
        await rq().input('id', sql.Int, saved.DocumentID).query('UPDATE dms_SalesDocuments SET DeletedAt=GETDATE() WHERE DocumentID=@id');
        assert.ok((await load({ search: marker })).rows.some(r => r.BookingID === delivered), 'Soft-deleted invoice must become pending again.');
        console.log('PASS: delivery evidence, historical/cancelled exclusions, name/CNIC searches, inclusive delivery dates, upload removes row, deleted document restores row, unchanged finances/status.');
    } finally { await tx.rollback(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.getPool = originalPool; return sql.close(); });
