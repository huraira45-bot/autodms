// Local development SQL verification only. Every synthetic job card is rolled back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict');
const os = require('node:os');
const db = require('../config/db');
const { sql } = db;
const realGetPool = db.getPool;
let tx;
db.getPool = async () => ({ request: () => new sql.Request(tx) });
const { report } = require('../controllers/dmsJobCardReportController');
const request = () => new sql.Request(tx);
async function load(query) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await report({ query }, res);
    assert.equal(res.code, 200, res.body?.error);
    return res.body;
}
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    assert.ok(['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host), 'Local development server only.');
    const pool = await realGetPool();
    assert.equal((await pool.request().query('SELECT DB_NAME() AS Name')).recordset[0].Name, 'temp_db1', 'Development database only.');
    tx = new sql.Transaction(pool); await tx.begin();
    try {
        const marker = `DMS${Date.now()}`;
        const numbers = [`${marker}-00042`, `${marker}-00042`, `${marker}-00042/X`, `${marker}_50%[west]~`, null, ''];
        const dates = ['2024-02-29T00:00:00.000', '2024-02-29T23:59:59.997', '2024-03-01T00:00:00.000', '2020-01-01T00:00:00.000',
            '2024-02-29T12:00:00.000', '2024-02-29T12:30:00.000'];
        const ids = [];
        for (let index = 0; index < numbers.length; index++) {
            const result = await request().input('no', sql.NVarChar(50), numbers[index])
                .input('ro', sql.NVarChar(100), `${marker}-${index}`)
                .input('date', sql.DateTime, new Date(`${dates[index]}Z`))
                .input('fin', sql.Bit, index === 1).input('status', sql.Int, index === 1 ? 4 : 0)
                .query(`INSERT Addata_JobCardInfo(JobCardNo,DMSJobCardNo,JobCardDate,IsOld,IsFinalized,IsEstimatedRO,IsFIR,JobStatus)
                    OUTPUT INSERTED.JobCardId VALUES(@ro,@no,@date,0,@fin,0,0,@status)`);
            ids.push(result.recordset[0].JobCardId);
        }
        const before = JSON.stringify((await request().input('prefix', sql.NVarChar(60), marker + '%')
            .query('SELECT * FROM Addata_JobCardInfo WHERE JobCardNo LIKE @prefix ORDER BY JobCardId')).recordset);
        const all = await load({ number: marker });
        assert.equal(all.count, 4, 'Old dates, drafts and closed/finalized cards are all searchable.');
        assert.ok(all.rows.some(row => row.JobStatusText === 'Closed' && row.IsFinalized));
        const exact = await load({ number: numbers[0], match: 'exact' });
        assert.deepEqual(new Set(exact.rows.map(row => row.JobCardId)), new Set(ids.slice(0, 2)), 'Shared DMS number returns both cards.');
        const partial = await load({ number: numbers[0] });
        assert.equal(partial.count, 3);
        assert.ok(partial.rows.slice(0, 2).every(row => row.DMSJobCardNo === numbers[0]), 'Exact matches first.');
        const literal = await load({ number: '_50%[west]~' });
        assert.deepEqual(literal.rows.map(row => row.JobCardId), [ids[3]]);
        const day = await load({ number: marker, from: '2024-02-29', to: '2024-02-29' });
        assert.deepEqual(new Set(day.rows.map(row => row.JobCardId)), new Set(ids.slice(0, 2)), 'Include midnight and last datetime tick; exclude following day.');
        assert.equal((await load({ number: marker, finalized: 'finalized' })).count, 1);
        assert.equal((await load({ number: marker, finalized: 'draft' })).count, 3);
        assert.equal((await load({ number: marker + 'MISSING' })).count, 0);
        assert.equal((await load({ number: '' })).searchRequired, true);
        const dateOnly = await load({ number: '', from: '2024-02-29', to: '2024-02-29', match: 'exact' });
        const expected = (await request().query(`SELECT JobCardId FROM Addata_JobCardInfo
            WHERE JobCardDate >= '20240229' AND JobCardDate < '20240301'`)).recordset.map(row => row.JobCardId);
        assert.equal(dateOnly.searchRequired, false);
        assert.deepEqual(new Set(dateOnly.rows.map(row => row.JobCardId)), new Set(expected), 'Blank number returns every card in the date range.');
        assert.ok(dateOnly.rows.some(row => row.JobCardId === ids[4] && row.DMSJobCardNo === null));
        assert.ok(dateOnly.rows.some(row => row.JobCardId === ids[5] && row.DMSJobCardNo === ''));
        const finalizedOnly = await load({ from: '2024-02-29', to: '2024-02-29', finalized: 'finalized' });
        assert.ok(finalizedOnly.rows.every(row => row.IsFinalized));
        assert.ok(finalizedOnly.rows.some(row => row.JobCardId === ids[1]));
        const after = JSON.stringify((await request().input('prefix', sql.NVarChar(60), marker + '%')
            .query('SELECT * FROM Addata_JobCardInfo WHERE JobCardNo LIKE @prefix ORDER BY JobCardId')).recordset);
        assert.equal(after, before, 'Report must not alter job cards.');
        console.log('PASS: real SQL DMS exact/partial/literal lookup, blank-number date-only report including null/empty DMS numbers, shared numbers, old/draft/closed cards, inclusive dates, finalization filters and unchanged records. All fixtures rolled back.');
    } finally { await tx.rollback(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.getPool = realGetPool; return sql.close(); });
