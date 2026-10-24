// Development database only. All customer/account/booking/audit fixtures roll back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), os = require('node:os');
const db = require('../config/db'), sql = db.sql, realGetPool = db.getPool;
let outer, failAudit = false, savepoint = 0;
class NestedTransaction {
    constructor() { this.outer = outer; this.name = 'CustomerTest' + (++savepoint); }
    async begin() { await new sql.Request(outer).query(`SAVE TRANSACTION ${this.name}`); }
    async commit() {}
    async rollback() { await new sql.Request(outer).query(`ROLLBACK TRANSACTION ${this.name}`); }
}
class Request extends sql.Request {
    constructor(target) { super(target?.outer || target); }
    query(statement) {
        if (failAudit && statement.includes('INSERT INTO dms_SalesAuditLog')) return Promise.reject(new Error('Synthetic audit failure'));
        return super.query(statement);
    }
}
db.sql = { ...sql, Transaction: NestedTransaction, Request };
db.getPool = async () => ({ request: () => new Request(outer) });
const customer = require('../controllers/salesCustomerController'), parties = require('../controllers/partyController');
const identity = require('../services/salesCustomerIdentityService');
const request = () => new sql.Request(outer);
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const actor = { userId: 1, userName: 'Local customer verifier', groupId: 1, modules: [] };
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host)) throw new Error('Local development database only.');
    const pool = await realGetPool(); outer = new sql.Transaction(pool); await outer.begin();
    const marker = 'SCE' + Date.now();
    try {
        const refs = (await request().query('SELECT TOP(1) VariantID,ModelID FROM dms_VehicleVariant;SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo')).recordsets;
        assert(refs.every(rows => rows.length), 'Development variant and employee required.');
        const accounts = [];
        for (const suffix of ['A', 'B']) accounts.push((await request().input('code', sql.NVarChar(20), '201' + marker + suffix).input('name', sql.NVarChar(200), marker)
            .query(`INSERT GLChartOFAccount(GLCode,GLTitle,GLLevel,GLNature,GLType,isParent,Companyid,Status,AccountLevelOne,ReadOnly)
                OUTPUT INSERTED.GLCAID VALUES(@code,@name,4,1,0,0,1,1,'01',0)`)).recordset[0].GLCAID);
        const first = (await request().input('name', sql.VarChar(100), marker + ' original').input('gl', sql.Int, accounts[0])
            .query(`INSERT gen_PartiesInfo(PartyName,PartyType,PartyGLID,ReadOnly,CNIC,NTNNO) OUTPUT INSERTED.PartyID
                VALUES(@name,'Customer',@gl,0,'9999912345671','9999999-8')`)).recordset[0].PartyID;
        const create = response();
        await parties.createSalesCustomer({ body: { PartyName: marker + ' repeated', PartyGLID: accounts[1], CNIC: '99999-1234567-1', NTNNO: '99999998' } }, create);
        assert.equal(create.code, 201, create.body?.error);
        assert(create.body.warnings.some(w => w.PartyID === first && w.fields.includes('CNIC') && w.fields.includes('NTN')));
        const second = create.body.PartyID;
        const self = await identity.identityWarnings(new Request(outer), { CNIC: '9999912345671', NTNNO: '99999998', excludeId: second });
        assert(self.some(w => w.PartyID === first)); assert(!self.some(w => w.PartyID === second));
        const ids = [];
        for (const [index, status] of ['Closed', 'PendingPayment'].entries()) ids.push((await request().input('no', sql.NVarChar(20), marker + index)
            .input('party', sql.Int, first).input('model', sql.Int, refs[0][0].ModelID).input('variant', sql.Int, refs[0][0].VariantID)
            .input('employee', sql.Int, refs[1][0].EmployeeID).input('status', sql.NVarChar(30), status).input('hist', sql.Bit, index === 0)
            .query(`INSERT dms_SalesBookings(BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,NegotiatedPrice,Status,CreatedBy_SalesExecutiveID,IsHistorical)
                OUTPUT INSERTED.BookingID VALUES(@no,@party,@model,@variant,1000,1000,@status,@employee,@hist)`)).recordset[0].BookingID);
        const money = async () => JSON.stringify((await request().query(`
            SELECT COUNT(*) AS N,SUM(TotalAmount) AS A FROM data_FinanceVoucherInfo;
            SELECT COUNT(*) AS N,SUM(Debit) AS D,SUM(Credit) AS C FROM data_FinanceVoucherDetail;
            SELECT COUNT(*) AS N FROM dms_PartyLedger;SELECT COUNT(*) AS N FROM dms_SalesPayments;
            SELECT COUNT(*) AS N FROM dms_SalesIncentiveAccruals;`)).recordsets);
        const moneyBefore = await money();
        const bookingsBefore = JSON.stringify((await request().input('party', sql.Int, first).query('SELECT * FROM dms_SalesBookings WHERE PartyID=@party ORDER BY BookingID')).recordset);
        const partyBefore = (await request().input('party', sql.Int, first).query('SELECT * FROM gen_PartiesInfo WHERE PartyID=@party')).recordset[0];
        const read = response(); await customer.get({ params: { id: ids[0] }, user: actor }, read);
        assert.equal(read.code, 200, read.body?.error); assert.equal(read.body.linkedBookings, 2);
        const body = { PartyName: marker + ' corrected', CNIC: '9999912345671', NTNNO: '99999998', PhoneOne: '03000000000', AddressOne: 'Corrected address', Expected: read.body.customer, Reason: 'Local correction verification' };
        const update = response(); await customer.update({ params: { id: ids[0] }, user: actor, body }, update);
        assert.equal(update.code, 200, update.body?.error); assert(update.body.warnings.some(w => w.PartyID === second));
        const partyAfter = (await request().input('party', sql.Int, first).query('SELECT * FROM gen_PartiesInfo WHERE PartyID=@party')).recordset[0];
        for (const key of Object.keys(partyBefore).filter(k => !['PartyName', 'CNIC', 'NTNNO', 'PhoneOne', 'AddressOne'].includes(k))) assert.deepEqual(partyAfter[key], partyBefore[key], key);
        assert.equal(JSON.stringify((await request().input('party', sql.Int, first).query('SELECT * FROM dms_SalesBookings WHERE PartyID=@party ORDER BY BookingID')).recordset), bookingsBefore);
        const linked = (await request().input('party', sql.Int, first).query('SELECT p.PartyName FROM dms_SalesBookings b JOIN gen_PartiesInfo p ON p.PartyID=b.PartyID WHERE b.PartyID=@party')).recordset;
        assert.equal(linked.length, 2); assert(linked.every(row => row.PartyName === body.PartyName));
        const audit = (await request().input('booking', sql.Int, ids[0]).query("SELECT * FROM dms_SalesAuditLog WHERE BookingID=@booking AND Action='CustomerDetailsEdited'")).recordset;
        assert.equal(audit.length, 1); assert.equal(JSON.parse(audit[0].OldValue).PartyName, partyBefore.PartyName); assert.equal(JSON.parse(audit[0].NewValue).PartyName, body.PartyName);
        const stale = response(); await customer.update({ params: { id: ids[0] }, user: actor, body }, stale); assert.equal(stale.code, 409);
        failAudit = true;
        const failed = response(); await customer.update({ params: { id: ids[0] }, user: actor, body: { ...body, PartyName: marker + ' must roll back', Expected: update.body.customer } }, failed);
        failAudit = false; assert.equal(failed.code, 500);
        const verified = response(); await customer.get({ params: { id: ids[0] }, user: actor }, verified); assert.equal(verified.body.customer.PartyName, body.PartyName);
        assert.equal(await money(), moneyBefore);
        console.log('PASS: repeated formatted/unformatted CNIC and NTN allowed with warnings; self excluded; closed historical/shared customer edited; audit before/after; stale saves rejected; audit failure rolls back; all financial, booking and unrelated customer fields unchanged.');
    } finally { await outer.rollback(); }
    const left = (await pool.request().input('name', sql.VarChar(100), marker + '%').query('SELECT COUNT(*) AS N FROM gen_PartiesInfo WHERE PartyName LIKE @name')).recordset[0].N;
    assert.equal(left, 0); console.log('PASS: all synthetic data rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.sql = sql; db.getPool = realGetPool; return sql.close(); });
