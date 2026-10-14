/** Read-only checks: production SELECT queries run against synthetic CTEs. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const db = require('../config/db');
const fixtures = `WITH dms_SalesBookings AS (
    SELECT 10 AS BookingID,N'BK-2024-0010' AS BookingNo,N'Closed' AS Status,CAST(1 AS bit) AS IsHistorical),
    GLVoucherType AS (SELECT * FROM (VALUES (1,N'JV'),(2,N'BPV'),(3,N'JV')) x(Voucherid,Title)),
    data_FinanceVoucherInfo AS (SELECT * FROM (VALUES
        (99,N'0099',CAST('2024-01-01' AS datetime),CAST(1000 AS decimal(18,2)),N'Posted',N'Other customer',1),
        (100,N'0099',CAST('2024-01-02' AS datetime),CAST(1500 AS decimal(18,2)),N'Draft',N'Other account',2),
        (101,N'JV_00%',CAST('2024-01-03' AS datetime),CAST(2500 AS decimal(18,2)),N'Reversed',N'Literal wildcard number',3))
        x(VoucherID,VoucherNo,VoucherDate,TotalAmount,Status,Remarks,VoucherTypeID)),
    dms_HistoricalVoucherReferences AS (SELECT 5 AS ReferenceID,10 AS BookingID,100 AS VoucherID,
        N'MASTER' AS ReferenceKind,CAST(NULL AS int) AS PaymentID,CAST('2024-01-01' AS datetime) AS LinkedAt,N'Test' AS LinkedByName)
    `;
async function main() {
    const pool = await db.getPool();
    class Request {
        constructor() { this.real = pool.request(); }
        input(...args) { this.real.input(...args); return this; }
        query(query) {
            assert.match(query.trim(), /^SELECT\b/i);
            assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE)\b/i);
            return this.real.query(fixtures + query);
        }
    }
    const file = path.join(__dirname, '..', 'controllers', 'salesHistoricalReferenceController.js');
    const candidate = new Module(file, module);
    candidate.filename = file; candidate.paths = Module._nodeModulePaths(path.dirname(file));
    candidate.require = name => name === '../config/db'
        ? { sql: { ...db.sql, Request }, getPool: async () => ({ request: () => new Request() }) }
        : name === './salesBookingController' ? { logBookingTransition: () => { throw new Error('Read-only check attempted audit write'); } }
        : Module.prototype.require.call(candidate, name);
    candidate._compile(fs.readFileSync(file, 'utf8'), file);
    const handler = candidate.exports;
    async function call(action, query = {}) {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.value = value; return this; } };
        await handler[action]({ params: { id: '10' }, query }, res);
        assert.equal(res.statusCode, 200, JSON.stringify(res.value));
        return res.value;
    }
    const types = await call('types');
    assert.deepEqual(types.map(t => t.VoucherTypeCode), ['BPV','JV']);
    const typed = await call('search', { search: '0099', voucherType: 'JV' });
    assert.deepEqual(typed.vouchers.map(v => v.VoucherID), [99]);
    const draft = await call('search', { search: '0099', voucherType: 'BPV' });
    assert.equal(draft.vouchers[0].Status, 'Draft');
    const anyType = await call('search', { search: '0099' });
    assert.equal(anyType.vouchers.length, 2);
    const literal = await call('search', { search: 'JV_00%', voucherType: 'JV' });
    assert.deepEqual(literal.vouchers.map(v => v.VoucherID), [101]);
    const selectedType = await call('search', { voucherType: 'JV' });
    assert.equal(selectedType.vouchers.length, 2);
    const references = await call('list');
    assert.equal(references[0].Status, 'Draft');
    assert.equal(references[0].ReferenceKind, 'MASTER');
    console.log('Passed: SQL Server voucher types, type disambiguation, all-account/all-status search, literal wildcard numbers, duplicate legacy type IDs and reference list.');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => db.sql.close());
