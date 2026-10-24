// Local development verification. All synthetic accounts, customers and
// bookings are rolled back; the report itself only reads data.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict');
const os = require('node:os');
const db = require('../config/db');
const { sql } = db;
const realGetPool = db.getPool;
let tx;
db.getPool = async () => ({ request: () => new sql.Request(tx) });
const report = require('../controllers/accountBookingReportController');
const request = () => new sql.Request(tx);
async function load(search) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await report.report({ query: { search } }, res);
    assert.equal(res.code, 200, res.body?.error); return res.body;
}

(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host)) throw new Error('Local development database only.');
    const pool = await realGetPool();
    tx = new sql.Transaction(pool); await tx.begin();
    try {
        const marker = 'ABL' + Date.now();
        const accounts = [];
        for (const suffix of ['A', 'B', 'C']) {
            const row = (await request().input('code', sql.NVarChar(20), marker + suffix)
                .input('title', sql.NVarChar(500), suffix === 'A' ? `${marker} O'Brien_50%[west]~` : `${marker} ${suffix}`)
                .query(`INSERT GLChartOFAccount(GLCode,GLTitle,GLLevel,GLNature,GLType,isParent,Companyid,Status,AccountLevelOne,ReadOnly)
                    OUTPUT INSERTED.GLCAID VALUES(@code,@title,4,1,0,0,1,1,'01',0)`)).recordset[0];
            accounts.push(row.GLCAID);
        }
        const parties = [];
        for (const index of [0, 2]) {
            parties.push((await request().input('name', sql.VarChar(100), marker + ' customer ' + index).input('gl', sql.Int, accounts[index])
                .query(`INSERT gen_PartiesInfo(PartyName,PartyType,PartyGLID,ReadOnly) OUTPUT INSERTED.PartyID VALUES(@name,'Customer',@gl,0)`)).recordset[0].PartyID);
        }
        const refs = (await request().query('SELECT TOP(1) VariantID,ModelID FROM dms_VehicleVariant;SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo')).recordsets;
        assert.ok(refs.every(rows => rows.length), 'Existing development variant and employee required.');
        const bookings = [];
        for (const [index, status] of ['PendingPayment', 'Closed', 'Cancelled'].entries()) {
            const b = (await request().input('no', sql.NVarChar(20), marker + index).input('party', sql.Int, parties[0])
                .input('model', sql.Int, refs[0][0].ModelID).input('variant', sql.Int, refs[0][0].VariantID)
                .input('employee', sql.Int, refs[1][0].EmployeeID).input('status', sql.NVarChar(30), status).input('hist', sql.Bit, index === 1)
                .query(`INSERT dms_SalesBookings(BookingNo,PartyID,VehicleModelID,VehicleVariantID,StandardPrice,NegotiatedPrice,
                    Status,CreatedBy_SalesExecutiveID,IsHistorical,BookingDate,PromisedDeliveryMonth)
                    OUTPUT INSERTED.BookingID VALUES(@no,@party,@model,@variant,1000,1000,@status,@employee,@hist,'2026-10-24','2026-12-01')`)).recordset[0];
            bookings.push(b.BookingID);
        }
        const money = async () => JSON.stringify((await request().query(`SELECT COUNT(*) AS N FROM data_FinanceVoucherInfo;
            SELECT COUNT(*) AS N FROM dms_PartyLedger;SELECT COUNT(*) AS N FROM dms_SalesPayments;
            SELECT COUNT(*) AS N FROM dms_SalesIncentiveAccruals;`)).recordsets);
        const before = await money();
        const all = await load(marker);
        assert.deepEqual(all.totals, { accounts: 3, linkedAccounts: 1, unlinkedAccounts: 2, bookings: 3 });
        assert.equal(all.rows.filter(r => r.BookingID != null).length, 3);
        assert.ok(all.rows.some(r => r.AccountID === accounts[1] && r.PartyID == null && r.BookingID == null));
        assert.ok(all.rows.some(r => r.AccountID === accounts[2] && r.PartyID === parties[1] && r.BookingID == null));
        const exact = await load(marker + 'A');
        assert.equal(exact.totals.accounts, 1); assert.equal(exact.totals.bookings, 3);
        assert.deepEqual(new Set(exact.rows.map(r => r.Status)), new Set(['PendingPayment', 'Closed', 'Cancelled']));
        assert.ok(exact.rows.some(r => r.IsHistorical));
        assert.ok(exact.rows.every(r => r.BookingDate === '2026-10-24' && r.PromisedDeliveryMonth === '2026-12'));
        assert.equal((await load("O'Brien_50%[west]~")).totals.bookings, 3);
        assert.equal((await load(marker + 'MISSING')).totals.accounts, 0);
        await request().input('party', sql.Int, parties[0]).input('gl', sql.Int, accounts[1])
            .query('UPDATE gen_PartiesInfo SET PartyGLID=@gl WHERE PartyID=@party');
        assert.equal((await load(marker + 'A')).totals.bookings, 0);
        assert.equal((await load(marker + 'B')).totals.bookings, 3);
        assert.equal(await money(), before, 'Report reads must not create financial records.');
        console.log('PASS: account code/title searches, literal punctuation, every booking/status, historical flag, accounts without customers/bookings, current account mapping and no financial writes.');
    } finally { await tx.rollback(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.getPool = realGetPool; return sql.close(); });
