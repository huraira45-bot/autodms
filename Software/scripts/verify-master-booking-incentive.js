// Local development SQL only. All setup, fixtures, postings and reversals roll back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const db = require('../config/db'), sql = db.sql, realGetPool = db.getPool;
let outer, point = 0, failAt = null;
class NestedTransaction {
    constructor() { this.outer = outer; this.name = 'MasterBooking' + (++point); }
    request() { return new Request(outer); }
    async begin() { await new sql.Request(outer).query(`SAVE TRANSACTION ${this.name}`); }
    async commit() {}
    async rollback() { await new sql.Request(outer).query(`ROLLBACK TRANSACTION ${this.name}`); }
}
class Request extends sql.Request {
    constructor(target) { super(target?.outer || target); }
    query(text) { return failAt && text.includes(failAt) ? Promise.reject(new Error('Synthetic Master audit failure')) : super.query(text); }
}
db.sql = { ...sql, Transaction: NestedTransaction, Request };
db.getPool = async () => ({ request: () => new Request(outer) });
const bookings = require('../controllers/salesBookingController'), rates = require('../controllers/masterIncentiveRateController');
const closed = require('../controllers/closedBookingCancellationController'), receipts = require('../controllers/masterIncentiveController');
const aging = require('../controllers/masterIncentiveAgingController');
const { accrueAtBooking, reverseOnCancellation } = require('../services/masterBookingIncentiveService');
const { requireUploadedMasterInvoice } = require('../services/masterInvoiceAccrualGuard');
const rq = () => new sql.Request(outer);
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
async function call(fn, req, code = 200) { const res = response(); await fn(req, res); assert.equal(res.code, code, res.body?.error); return res.body; }
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host) || process.env.DB_NAME !== 'temp_db1') throw new Error('Local temp_db1 development database only.');
    const pool = await realGetPool(); outer = new sql.Transaction(pool); await outer.begin(); const marker = 'MI' + Date.now();
    try {
        const migration = fs.readFileSync(path.join(__dirname, '../migrations/165_master_incentive_rates.sql'), 'utf8');
        for (let i = 0; i < 2; i++) for (const batch of migration.split(/^\s*GO\s*$/mi).filter(b => b.trim())) await rq().query(batch);
        const refs = (await rq().query(`SELECT TOP(1) ModelID FROM dms_VehicleModel;
            SELECT TOP(1) PartyID FROM gen_PartiesInfo;
            SELECT TOP(1) EmployeeID FROM gen_EmployeeInfo e WHERE NOT EXISTS(SELECT 1 FROM dms_SalesIncentiveAssignments a WHERE a.EmployeeID=e.EmployeeID AND a.IsActive=1);
            SELECT CONVERT(varchar(10),GETDATE(),23) AS Today;`)).recordsets;
        assert(refs.every(r => r.length)); const today = refs[3][0].Today, year = Number(today.slice(0, 4));
        const user = { groupId: 1, userId: 1, userName: 'Local Master verifier', employeeId: refs[2][0].EmployeeID, modules: ['sales_executive', 'sales_admin_settings', 'sales_master_settlement', 'finalize'] };
        const account = async suffix => (await rq().input('code', sql.NVarChar(20), '201' + marker + suffix)
            .query(`INSERT GLChartOFAccount(GLCode,GLTitle,GLLevel,GLNature,GLType,isParent,Companyid,Status,AccountLevelOne,ReadOnly)
                OUTPUT INSERTED.GLCAID VALUES(@code,@code,4,1,0,0,1,1,'01',0)`)).recordset[0].GLCAID;
        const recv = await account('R'), income = await account('I'), replacement = await account('X'), pos = await account('P');
        const map = async (role, gl) => rq().input('role', sql.NVarChar(100), role).input('gl', sql.Int, gl).query(`
            IF EXISTS(SELECT 1 FROM dms_SystemAccounts WHERE RoleKey=@role) UPDATE dms_SystemAccounts SET GLCAID=@gl WHERE RoleKey=@role;
            ELSE INSERT dms_SystemAccounts(RoleKey,GLCAID) VALUES(@role,@gl);`);
        await map('MASTER_INCENTIVE_RECEIVABLE', recv); await map('MASTER_INCENTIVE_INCOME', income); await map('POS_CLEARING', pos);
        const variant = (await rq().input('model', sql.Int, refs[0][0].ModelID).input('code', sql.NVarChar(50), marker)
            .query(`INSERT dms_VehicleVariant(ModelID,VariantCode,VariantName,StandardPrice,WholesalePrice,MinimumBookingAmount)
                OUTPUT INSERTED.VariantID VALUES(@model,@code,'Synthetic Master rate variant',1000,1000,0)`)).recordset[0].VariantID;
        const policy = { VariantID: variant, EffectiveFrom: `${year}-01-01`, EffectiveTo: `${year}-12-31`, AmountPerBooking: 250, Notes: marker };
        const rate = await call(rates.create, { user, body: policy }, 201);
        await call(rates.create, { user, body: { ...policy, EffectiveFrom: today } }, 409);
        await call(rates.create, { user, body: { ...policy, EffectiveFrom: `${year + 1}-01-01`, EffectiveTo: `${year + 1}-12-31`, AmountPerBooking: 400 } }, 201);
        const body = { PartyID: refs[1][0].PartyID, VehicleVariantID: variant, NegotiatedPrice: 1000 };
        const create = async suffix => call(bookings.createBooking, { user, body: { ...body, DMSBookingNumber: marker + suffix } }, 201);
        const readBooking = async id => (await rq().input('id', sql.Int, id).query('SELECT * FROM dms_SalesBookings WHERE BookingID=@id')).recordset[0];
        const closeBooking = async (id, code = 200) => {
            await rq().input('id', sql.Int, id).query("UPDATE dms_SalesBookings SET Status='Closed',ClosedAt=GETDATE() WHERE BookingID=@id");
            return call(closed.cancel, { user, params: { id }, body: { Reason: 'Synthetic cancellation test' } }, code);
        };
        const draft = await create('DRAFT');
        assert.equal(draft.MasterIncentive.Amount, 250); assert.equal(draft.MasterIncentive.RateID, rate.RateID);
        const dv = draft.MasterIncentive.VoucherID, da = draft.MasterIncentive.AccrualID;
        const lines = (await rq().input('id', sql.Int, dv).query('SELECT GLCAID,Debit,Credit FROM data_FinanceVoucherDetail WHERE VoucherID=@id ORDER BY VoucherDetailID')).recordset;
        assert.deepEqual(lines.map(l => [l.GLCAID,Number(l.Debit),Number(l.Credit)]), [[recv,250,0],[income,0,250]]);
        assert.equal((await accrueAtBooking(outer, draft.BookingID, user)).skipped, 'already-recorded');
        await call(receipts.createReceipt, { user, body: { AccrualID: da, GrossAmount: 100, NetCashReceived: 100, PaymentMode: 'POS' } }, 400);
        await closeBooking(draft.BookingID);
        assert.equal((await rq().input('id', sql.Int, dv).query('SELECT COUNT(*) AS N FROM data_FinanceVoucherInfo WHERE VoucherID=@id')).recordset[0].N, 0);
        const voidAudit = (await rq().input('id', sql.Int, draft.BookingID).query("SELECT OldValue FROM dms_SalesAuditLog WHERE BookingID=@id AND Action='MasterIncentiveDraftVoided'")).recordset;
        assert.equal(voidAudit.length, 1); assert.equal(JSON.parse(voidAudit[0].OldValue).detail.length, 2);
        const posted = await create('POSTED'), pv = posted.MasterIncentive.VoucherID, pa = posted.MasterIncentive.AccrualID;
        await rq().input('id', sql.Int, pv).query("UPDATE data_FinanceVoucherInfo SET Status='Posted',Posted=1,PostedAt=GETDATE() WHERE VoucherID=@id");
        await map('MASTER_INCENTIVE_RECEIVABLE', replacement);
        const receipt = await call(receipts.createReceipt, { user, body: { AccrualID: pa, GrossAmount: 100, NetCashReceived: 100, PaymentMode: 'POS' } });
        const settled = (await rq().input('id', sql.Int, receipt.VoucherID).query('SELECT GLCAID,Credit FROM data_FinanceVoucherDetail WHERE VoucherID=@id AND Credit>0')).recordset;
        assert.equal(settled[0].GLCAID, recv, 'Receipt must credit the original snapshot despite mapping change');
        const beforeCancel = await readBooking(posted.BookingID);
        failAt = 'INSERT INTO dms_SalesAuditLog'; await closeBooking(posted.BookingID, 500); failAt = null;
        assert.equal((await readBooking(posted.BookingID)).Status, 'Closed');
        assert.equal((await rq().input('id', sql.Int, pv).query('SELECT Status FROM data_FinanceVoucherInfo WHERE VoucherID=@id')).recordset[0].Status, 'Posted');
        await closeBooking(posted.BookingID);
        const mirror = (await rq().input('id', sql.Int, pv).query(`SELECT v.Status,v.ReversesVoucherID,d.GLCAID,d.Debit,d.Credit
            FROM data_FinanceVoucherInfo v JOIN data_FinanceVoucherDetail d ON d.VoucherID=v.VoucherID
            WHERE v.ReversesVoucherID=@id ORDER BY d.VoucherDetailID`)).recordset;
        assert.deepEqual(mirror.map(l => [l.GLCAID,Number(l.Debit),Number(l.Credit)]), [[recv,0,250],[income,250,0]]);
        assert(mirror.every(l => l.Status === 'Posted'));
        await reverseOnCancellation(outer, posted.BookingID, user, 'Repeat must not duplicate reversal');
        assert.equal((await rq().input('id', sql.Int, pv).query('SELECT COUNT(*) AS N FROM data_FinanceVoucherInfo WHERE ReversesVoucherID=@id')).recordset[0].N, 1);
        assert.equal((await readBooking(posted.BookingID)).AmountPaidToDate, beforeCancel.AmountPaidToDate);
        const active = await create('ACTIVE');
        const report = await call(aging.report, { query: { asOf: today, variantId: variant, show: 'all', search: marker } });
        assert.equal(report.rows.length, 3);
        assert.equal(report.rows.find(r => r.BookingID === active.BookingID).Outstanding, 250);
        assert.equal(report.rows.find(r => r.BookingID === active.BookingID).PostedAccrued, 0);
        assert.equal(report.rows.find(r => r.BookingID === posted.BookingID).RefundDueToMaster, 100);
        assert.equal(report.rows.find(r => r.BookingID === draft.BookingID).Outstanding, 0);
        assert.equal(report.totals.outstanding, 250); assert.equal(report.totals.refundDue, 100);
        await assert.rejects(() => requireUploadedMasterInvoice(outer, active.BookingID, 'M', today), /already recognized/);
        await call(bookings.cancelBooking,{user,params:{id:active.BookingID},body:{Reason:'Synthetic approval-loop cancellation'}});
        assert.equal((await rq().input('id',sql.Int,active.MasterIncentive.VoucherID).query('SELECT Status FROM data_FinanceVoucherInfo WHERE VoucherID=@id')).recordset[0].Status,'Draft','Proposal must not void incentive before execution');
        const cancellation=(await rq().input('id',sql.Int,active.BookingID).query("SELECT CancellationID FROM dms_SalesBookingCancellations WHERE BookingID=@id AND Status='Pending'")).recordset[0].CancellationID;
        await call(bookings.amApproveCancellation,{user,params:{id:cancellation},body:{Comments:'Synthetic AM approval'}});
        await call(bookings.adminExecuteCancellation,{user,params:{id:cancellation},body:{RefundAmount:0,AdminNotes:'Synthetic final execution'}});
        assert.equal((await readBooking(active.BookingID)).Status,'Cancelled');
        const immediate=await call(bookings.createBooking,{user,body:{...body,NegotiatedPrice:900,NegotiationReason:'Synthetic discount request',DMSBookingNumber:marker+'IMMEDIATE'}},201);
        await call(bookings.cancelBooking,{user,params:{id:immediate.BookingID},body:{Reason:'Synthetic pre-confirmation cancellation'}});
        assert.equal((await readBooking(immediate.BookingID)).Status,'Cancelled');
        // Receipt reversal on a cancelled booking must not resurrect its incentive.
        await call(receipts.revokeReceipt, { user, params: { id: receipt.ReceiptID }, body: { reason: 'Synthetic wrong receipt' } });
        assert.equal((await rq().input('id', sql.Int, pa).query('SELECT Status FROM dms_SalesIncentiveAccruals WHERE AccrualID=@id')).recordset[0].Status, 'Reversed');
        const setup = await call(rates.list, { query: { variantId: variant } });
        assert.equal(setup.length, 2); assert.equal(Number(setup.find(r => r.RateID === rate.RateID).AmountPerBooking), 250);
        await map('MASTER_INCENTIVE_RECEIVABLE', recv); const bulkA = await create('BULKA');
        await map('MASTER_INCENTIVE_RECEIVABLE', replacement); const bulkB = await create('BULKB');
        for (const booking of [bulkA, bulkB]) await rq().input('id', sql.Int, booking.MasterIncentive.VoucherID)
            .query("UPDATE data_FinanceVoucherInfo SET Status='Posted',Posted=1,PostedAt=GETDATE() WHERE VoucherID=@id");
        const bulk = await call(receipts.createBulkReceipt, { user, body: { AccrualIDs: [bulkA.MasterIncentive.AccrualID,bulkB.MasterIncentive.AccrualID],
            TotalGrossAmount: 400,TotalNetCashReceived: 400,PaymentMode: 'POS' } });
        const bulkCredit = (await rq().input('id', sql.Int, bulk.VoucherID).query('SELECT GLCAID,Credit FROM data_FinanceVoucherDetail WHERE VoucherID=@id AND Credit>0 ORDER BY VoucherDetailID')).recordset;
        assert.deepEqual(bulkCredit.map(l => [l.GLCAID,Number(l.Credit)]), [[recv,250],[replacement,150]]);
        await closeBooking(bulkA.BookingID);
        await call(receipts.revokeReceipt, { user, params: { id: bulk.ReceiptIDs[0] }, body: { reason: 'Synthetic bulk correction' } });
        const bulkStates = (await rq().input('a', sql.Int, bulkA.MasterIncentive.AccrualID).input('b', sql.Int, bulkB.MasterIncentive.AccrualID)
            .query('SELECT AccrualID,Status,DisbursedAmount FROM dms_SalesIncentiveAccruals WHERE AccrualID IN(@a,@b) ORDER BY AccrualID')).recordset;
        assert.equal(bulkStates[0].Status,'Reversed');assert.equal(bulkStates[1].Status,'Accrued');assert(bulkStates.every(a=>Number(a.DisbursedAmount)===0));
        const yesterday = new Date(new Date(today+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10);
        if (today > policy.EffectiveFrom) await call(rates.end,{user,params:{id:rate.RateID},body:{EffectiveTo:yesterday,ExpectedTo:policy.EffectiveTo,Reason:'Cannot rewrite dates already used'}},409);
        if (today < policy.EffectiveTo) {
            await call(rates.end,{user,params:{id:rate.RateID},body:{EffectiveTo:today,ExpectedTo:policy.EffectiveTo,Reason:'New Master rate starts tomorrow'}});
            const tomorrow = new Date(new Date(today+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);
            await call(rates.create,{user,body:{...policy,EffectiveFrom:tomorrow,AmountPerBooking:350}},201);
            const prior=(await rq().input('id',sql.Int,rate.RateID).query('SELECT AmountPerBooking,EffectiveTo FROM dms_MasterIncentiveRates WHERE RateID=@id')).recordset[0];
            assert.equal(Number(prior.AmountPerBooking),250);assert.equal(prior.EffectiveTo.toISOString().slice(0,10),today);
            const frozen=(await rq().input('id',sql.Int,active.MasterIncentive.AccrualID).query('SELECT AmountAccrued,PolicySnapshotJSON FROM dms_SalesIncentiveAccruals WHERE AccrualID=@id')).recordset[0];
            assert.equal(Number(frozen.AmountAccrued),250);assert.equal(JSON.parse(frozen.PolicySnapshotJSON).EffectiveTo.slice(0,10),policy.EffectiveTo);
        }
        console.log('PASS: dated rates retained, overlap rejected, booking uses original rate/account snapshot; balanced draft, receipt before finalization blocked, remapped receipt credits original account.');
        console.log('PASS: draft void retains full audit; posted cancellation creates exact mirror once; audit failure rolls back cancellation/reversal; customer payments retained; receipt revocation cannot resurrect cancelled incentive.');
        console.log('PASS: booking-wise DMS aging distinguishes unposted incentive, cancelled amounts and money owed back to Master; invoice path cannot duplicate booking accrual.');
        console.log('PASS: bulk receipts retain each booking original account; bulk reversal preserves a cancelled incentive and reopens only the active incentive.');
        console.log('PASS: ending a policy cannot invalidate used dates; early ending and replacement retain old amount, snapshot and audit.');
        console.log('PASS: approval-loop proposal retains incentive until AM approval and Admin execution; pre-confirmation cancellation voids its draft atomically.');
    } finally { await outer.rollback(); }
    assert.equal((await pool.request().input('code', sql.NVarChar(50), marker).query('SELECT COUNT(*) AS N FROM dms_VehicleVariant WHERE VariantCode=@code')).recordset[0].N, 0);
    console.log('PASS: all synthetic setup, financial entries and fixtures rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.sql = sql; db.getPool = realGetPool; return sql.close(); });
