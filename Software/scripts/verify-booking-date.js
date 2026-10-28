// Local development SQL only. All fixture bookings, audits and changes roll back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), os = require('node:os');
const db = require('../config/db'), sql = db.sql, realGetPool = db.getPool;
let outer, point = 0, failAudit = false;
class NestedTransaction {
    constructor() { this.outer = outer; this.name = 'BookingDate' + (++point); }
    async begin() { await new sql.Request(outer).query(`SAVE TRANSACTION ${this.name}`); }
    async commit() {}
    async rollback() { await new sql.Request(outer).query(`ROLLBACK TRANSACTION ${this.name}`); }
}
class Request extends sql.Request {
    constructor(target) { super(target?.outer || target); }
    query(text) {
        if (failAudit && text.includes('INSERT INTO dms_SalesAuditLog')) return Promise.reject(new Error('Synthetic audit failure'));
        return super.query(text);
    }
}
db.sql = { ...sql, Transaction: NestedTransaction, Request };
db.getPool = async () => ({ request: () => new Request(outer) });
const controller = require('../controllers/bookingDateController'), bookings = require('../controllers/salesBookingController');
const report = require('../controllers/accountBookingReportController');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const request = () => new sql.Request(outer), actor = { groupId: 1, userId: 1, userName: 'Local date verifier', modules: [], permissions: ['sales_booking_date'] };
async function save(id, date, expected, status = 200) {
    const res = response(); await controller.update({ params: { id }, user: actor, body: { BookingDate: date, ExpectedDate: expected, Reason: 'Local date correction check' } }, res);
    assert.equal(res.code, status, res.body?.error); return res.body;
}
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host)) throw new Error('Local development database only.');
    const pool = await realGetPool(); outer = new sql.Transaction(pool); await outer.begin();
    const marker = 'BD' + Date.now();
    try {
        const fs = require('node:fs'), path = require('node:path');
        const otherPermissions = async () => (await request().query('SELECT GroupID,PermissionKey FROM dms_ModulePermissions WHERE GroupID<>1 ORDER BY GroupID,PermissionKey')).recordset;
        const beforeOtherPermissions = await otherPermissions();
        const migration = fs.readFileSync(path.join(__dirname, '../migrations/163_booking_date_admin_right.sql'), 'utf8');
        await request().query(migration); await request().query(migration);
        const grants = (await request().query("SELECT PermissionKey FROM dms_ModulePermissions WHERE GroupID=1 AND PermissionKey='sales_booking_date'")).recordset;
        assert.equal(grants.length, 1); assert.deepEqual(await otherPermissions(), beforeOtherPermissions);
        const refs = (await request().query('SELECT TOP(1) VariantID,ModelID FROM dms_VehicleVariant;SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo')).recordsets;
        assert(refs.every(rows => rows.length), 'Development variant and employee required.');
        const gl = (await request().input('code', sql.NVarChar(20), '201' + marker).query(`INSERT GLChartOFAccount(GLCode,GLTitle,GLLevel,GLNature,GLType,isParent,Companyid,Status,AccountLevelOne,ReadOnly)
            OUTPUT INSERTED.GLCAID VALUES(@code,'Synthetic date account',4,1,0,0,1,1,'01',0)`)).recordset[0].GLCAID;
        const party = (await request().input('name', sql.VarChar(100), marker).input('gl', sql.Int, gl)
            .query("INSERT gen_PartiesInfo(PartyName,PartyType,PartyGLID,ReadOnly) OUTPUT INSERTED.PartyID VALUES(@name,'Customer',@gl,0)")).recordset[0].PartyID;
        const beforeMoney = async () => JSON.stringify((await request().query(`SELECT COUNT(*) AS N,SUM(TotalAmount) AS A FROM data_FinanceVoucherInfo;
            SELECT COUNT(*) AS N,SUM(Debit) AS D,SUM(Credit) AS C FROM data_FinanceVoucherDetail;
            SELECT COUNT(*) AS N FROM dms_PartyLedger;SELECT COUNT(*) AS N FROM dms_SalesPayments;SELECT COUNT(*) AS N FROM dms_SalesIncentiveAccruals;`)).recordsets);
        const money = await beforeMoney();
        const ids = [];
        for (const index of [0, 1]) {
            const id = (await request().input('no', sql.NVarChar(20), marker + index).input('party', sql.Int, party)
                .input('model', sql.Int, refs[0][0].ModelID).input('variant', sql.Int, refs[0][0].VariantID).input('emp', sql.Int, refs[1][0].EmployeeID)
                .input('hist', sql.Bit, index === 1).input('date', sql.Date, index ? new Date('2026-09-01T00:00Z') : null).input('status', sql.NVarChar(30), index ? 'Closed' : 'PendingPayment')
                .query(`INSERT dms_SalesBookings(BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,NegotiatedPrice,CreatedBy_SalesExecutiveID,
                    IsHistorical,BookingDate,Status,CreatedAt,PromisedDeliveryMonth,HistoricalEnteredAt)
                    OUTPUT INSERTED.BookingID VALUES(@no,@party,@model,@variant,1000,1000,@emp,@hist,@date,@status,'2026-10-28T02:03:04.123','2026-12-01','2026-10-28T02:03:04.123')`)).recordset[0].BookingID;
            ids.push(id);
            const read = async () => (await request().input('id', sql.Int, id).query('SELECT * FROM dms_SalesBookings WHERE BookingID=@id')).recordset[0];
            const before = await read(), next = index ? '2026-09-15' : '2026-10-10', expected = index ? '2026-09-01' : null;
            assert.equal((await save(id, next, expected)).changed, true);
            const after = await read(); assert.equal(after.BookingDate.toISOString().slice(0, 10), next);
            for (const key of Object.keys(before).filter(k => !['BookingDate', 'UpdatedAt', 'UpdatedByEmployeeID', 'UpdatedByName'].includes(k))) assert.deepEqual(after[key], before[key], key);
            const audit = (await request().input('id', sql.Int, id).query("SELECT * FROM dms_SalesAuditLog WHERE BookingID=@id AND Action='BookingDateChanged'")).recordset;
            assert.equal(audit.length, 1); assert.equal(JSON.parse(audit[0].OldValue).BookingDate, expected); assert.equal(JSON.parse(audit[0].NewValue).BookingDate, next);
            assert.equal(audit[0].ActorUserID, actor.userId);
            const timeline = (await request().input('id', sql.Int, id).query('SELECT * FROM dms_BookingStateTransitions WHERE BookingID=@id')).recordset;
            assert.equal(timeline.length, 1); assert.equal(timeline[0].FromState, timeline[0].ToState);
            await save(id, '2026-08-01', expected, 409);
            assert.equal((await save(id, next, next)).changed, false);
            failAudit = true; await save(id, '2026-08-01', next, 500); failAudit = false;
            assert.equal((await read()).BookingDate.toISOString().slice(0, 10), next);
        }
        const list = response(); await bookings.listBookings({ user: actor, query: { search: marker, dateFrom: '2026-10-10', dateTo: '2026-10-10' } }, list);
        assert.equal(list.code, 200, list.body?.error); assert.deepEqual(list.body.map(row => row.BookingID), [ids[0]]);
        const accountReport = response(); await report.report({ query: { search: '201' + marker } }, accountReport);
        assert.equal(accountReport.code, 200, accountReport.body?.error);
        assert.deepEqual(accountReport.body.rows.map(row => row.BookingDate).sort(), ['2026-09-15', '2026-10-10']);
        assert.equal(await beforeMoney(), money);
        const rights = require('../controllers/permissionController');
        const adminKeys = (await request().query('SELECT PermissionKey FROM dms_ModulePermissions WHERE GroupID=1')).recordset.map(row => row.PermissionKey);
        const revoke = response(); await rights.setRolePermissions({ params: { groupId: '1' }, body: { permissions: adminKeys.filter(key => key !== 'sales_booking_date') } }, revoke);
        assert.equal(revoke.code, 200, revoke.body?.error);
        actor.permissions = [];
        await save(ids[0], '2026-08-01', '2026-10-10', 403);
        const grant = response(); await rights.setRolePermissions({ params: { groupId: '1' }, body: { permissions: adminKeys } }, grant);
        assert.equal(grant.code, 200, grant.body?.error); actor.permissions = ['sales_booking_date'];
        assert.deepEqual(await otherPermissions(), beforeOtherPermissions);
        console.log('PASS: migration seeds only Admin once; Admin Rights saves and revokes the key; revoked Admin cannot change booking dates; other roles are unchanged.');
        console.log('PASS: regular and closed historical booking date corrections persist; list filters/reports use corrected dates; entry timestamps, every unrelated booking field and financial records preserved; audit/timeline retained; stale saves and audit failures roll back.');
    } finally { await outer.rollback(); }
    assert.equal((await pool.request().input('name', sql.VarChar(100), marker).query('SELECT COUNT(*) AS N FROM gen_PartiesInfo WHERE PartyName=@name')).recordset[0].N, 0);
    console.log('PASS: all synthetic fixtures rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.sql = sql; db.getPool = realGetPool; return sql.close(); });
