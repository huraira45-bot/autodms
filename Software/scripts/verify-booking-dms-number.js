// Development SQL only. The schema addition and all fixtures roll back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const db = require('../config/db'), sql = db.sql, realGetPool = db.getPool;
let outer, point = 0, failAudit = false;
class NestedTransaction {
    constructor() { this.outer = outer; this.name = 'DmsNumber' + (++point); }
    request() { return new Request(outer); }
    async begin() { await new sql.Request(outer).query(`SAVE TRANSACTION ${this.name}`); }
    async commit() {}
    async rollback() { await new sql.Request(outer).query(`ROLLBACK TRANSACTION ${this.name}`); }
}
class Request extends sql.Request {
    constructor(target) { super(target?.outer || target); }
    query(text) {
        if (failAudit && text.includes('DMSBookingNumberRecorded')) return Promise.reject(new Error('Synthetic DMS audit failure'));
        return super.query(text);
    }
}
db.sql = { ...sql, Transaction: NestedTransaction, Request };
db.getPool = async () => ({ request: () => new Request(outer) });
const bookings = require('../controllers/salesBookingController'), historical = require('../controllers/salesHistoricalController');
const reports = require('../controllers/salesReportsController');
const rq = () => new sql.Request(outer);
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
async function call(fn, req, code = 200) { const res = response(); await fn(req, res); assert.equal(res.code, code, res.body?.error); return res.body; }
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host) || process.env.DB_NAME !== 'temp_db1')
        throw new Error('Local temp_db1 development database only.');
    const pool = await realGetPool(); outer = new sql.Transaction(pool); await outer.begin();
    const marker = 'DN' + Date.now();
    try {
        const oldBookings = (await rq().query('SELECT * FROM dms_SalesBookings ORDER BY BookingID')).recordset;
        const migration = fs.readFileSync(path.join(__dirname, '../migrations/164_booking_dms_number.sql'), 'utf8');
        await rq().query(migration); await rq().query(migration);
        const refs = (await rq().query(`SELECT TOP(1) ModelID FROM dms_VehicleModel;
            SELECT TOP(1) PartyID FROM gen_PartiesInfo;
            SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo e WHERE NOT EXISTS(
                SELECT 1 FROM dms_SalesIncentiveAssignments a WHERE a.EmployeeID=e.EmployeeID AND a.IsActive=1);`)).recordsets;
        assert(refs.every(r => r.length), 'Development model, customer and employee without incentive assignment required.');
        const variant = (await rq().input('model', sql.Int, refs[0][0].ModelID).input('code', sql.NVarChar(50), marker)
            .query(`INSERT dms_VehicleVariant(ModelID,VariantCode,VariantName,StandardPrice,WholesalePrice,MinimumBookingAmount)
                OUTPUT INSERTED.VariantID VALUES(@model,@code,'Synthetic DMS variant',1000,1000,0)`)).recordset[0].VariantID;
        const user = { groupId: 1, userId: 1, userName: 'Local DMS verifier', employeeId: refs[2][0].EmployeeID, modules: ['sales_executive'] };
        await rq().input('v',sql.Int,variant).query(`INSERT dms_MasterIncentiveRates(VariantID,EffectiveFrom,EffectiveTo,AmountPerBooking,CreatedByUserID,CreatedByName)
            VALUES(@v,'1753-01-01','9999-12-31',0,1,'Synthetic DMS verifier')`);
        const body = { PartyID: refs[1][0].PartyID, VehicleVariantID: variant, NegotiatedPrice: 1000 };
        const finance = async () => (await rq().query(`SELECT COUNT(*) AS N,SUM(TotalAmount) AS A FROM data_FinanceVoucherInfo;
            SELECT COUNT(*) AS N,SUM(Debit) AS D,SUM(Credit) AS C FROM data_FinanceVoucherDetail;
            SELECT COUNT(*) AS N FROM dms_PartyLedger;SELECT COUNT(*) AS N FROM dms_SalesPayments;`)).recordsets;
        const beforeFinance = await finance();
        await call(bookings.createBooking, { user, body }, 400);
        const dms = `001005/00001234-A'${marker}`;
        const saved = await call(bookings.createBooking, { user, body: { ...body, DMSBookingNumber: ' ' + dms + ' ' } }, 201);
        assert.equal(saved.DMSBookingNumber, dms); assert.match(saved.BookingNo, /^BK-\d{4}-\d{4,}$/);
        const loaded = await call(bookings.getBooking, { user, params: { id: saved.BookingID } });
        assert.equal(loaded.DMSBookingNumber, dms);
        const list = await call(bookings.listBookings, { user, query: { search: dms } });
        assert.deepEqual(list.map(r => r.BookingID), [saved.BookingID]); assert.equal(list[0].DMSBookingNumber, dms);
        const createdOn = loaded.CreatedAt.toISOString().slice(0, 10);
        const report = await call(reports.bookingRegister, { user, query: { from: createdOn, to: createdOn } });
        assert.equal(report.rows.find(r => r.BookingID === saved.BookingID).DMSBookingNumber, dms);
        const audit = (await rq().input('id', sql.Int, saved.BookingID).query("SELECT * FROM dms_SalesAuditLog WHERE BookingID=@id AND Action='DMSBookingNumberRecorded'")).recordset;
        assert.equal(audit.length, 1); assert.equal(audit[0].ActorUserID, user.userId); assert.equal(JSON.parse(audit[0].NewValue).DMSBookingNumber, dms);
        const count = async () => (await rq().query('SELECT COUNT(*) AS N FROM dms_SalesBookings')).recordset[0].N;
        const beforeFailure = await count();
        failAudit = true;
        await call(bookings.createBooking, { user, body: { ...body, DMSBookingNumber: marker + '-FAIL' } }, 500);
        failAudit = false; assert.equal(await count(), beforeFailure);
        const oldEntry = await call(historical.createBooking, { user, body: { ...body, Status: 'PendingPayment', BookingDate: '2026-09-01' } }, 201);
        const historicalRow = (await rq().input('id', sql.Int, oldEntry.BookingID).query('SELECT IsHistorical,DMSBookingNumber FROM dms_SalesBookings WHERE BookingID=@id')).recordset[0];
        assert.equal(historicalRow.IsHistorical, true); assert.equal(historicalRow.DMSBookingNumber, null);
        const afterBookings = (await rq().query('SELECT * FROM dms_SalesBookings ORDER BY BookingID')).recordset;
        for (const b of oldBookings) { const a = afterBookings.find(a => a.BookingID === b.BookingID); for (const k of Object.keys(b)) assert.deepEqual(a[k], b[k], b.BookingNo + ': ' + k); }
        assert.deepEqual(await finance(), beforeFinance, 'DMS reference and no-policy fixture creation must not affect financial data');
        console.log('PASS: idempotent nullable migration; required number saved/reloaded/searched/reported with leading zeros, apostrophe and separators intact; actor audited; failed audit rolls back creation.');
        console.log('PASS: existing bookings unchanged, historical entry works without number, normal booking state/incentive policy lookup preserved and no financial changes in fixtures.');
    } finally { await outer.rollback(); }
    const remaining = (await pool.request().input('code', sql.NVarChar(50), marker).query('SELECT COUNT(*) AS N FROM dms_VehicleVariant WHERE VariantCode=@code')).recordset[0].N;
    assert.equal(remaining, 0); console.log('PASS: all fixtures and schema changes rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.sql = sql; db.getPool = realGetPool; return sql.close(); });
