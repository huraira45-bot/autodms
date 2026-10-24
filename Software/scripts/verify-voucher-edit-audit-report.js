// Local development SQL checks. Synthetic audit entries are rolled back;
// no voucher or ledger record is changed.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), os = require('node:os');
const db = require('../config/db'), { sql } = db, realGetPool = db.getPool;
let tx;
db.getPool = async () => ({ request: () => new sql.Request(tx) });
const controller = require('../controllers/voucherEditAuditReportController');
const request = () => new sql.Request(tx);
const marker = 'EDIT-AUDIT-' + Date.now();

(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host)) throw new Error('Local development database only.');
    const pool = await realGetPool(); tx = new sql.Transaction(pool); await tx.begin();
    try {
        const fixtures = [
            ['N0', 'DATE_CHANGE', '2026-10-23T18:59:59.999Z', false],
            ['N1', 'DATE_CHANGE', '2026-10-23T19:00:00.000Z', true],
            ['N2', 'VOUCHER_EDIT', '2026-10-24T18:59:59.999Z', true],
            ['N3', 'DATE_CHANGE', '2026-10-24T19:00:00.000Z', false],
            ['L0', 'LEGACY_DATE_CHANGE', '2026-10-23T23:59:59.997Z', false],
            ['L1', 'LEGACY_DATE_CHANGE', '2026-10-24T00:00:00.000Z', true],
            ['L2', 'LEGACY_DATE_CHANGE', '2026-10-24T23:59:59.997Z', true],
            ['L3', 'LEGACY_DATE_CHANGE', '2026-10-25T00:00:00.000Z', false],
        ];
        const base = (await request().query('SELECT ISNULL(MAX(VoucherID),0)+1000 AS NextID FROM data_FinanceVoucherInfo')).recordset[0].NextID;
        for (const [index, [suffix, action, at]] of fixtures.entries()) {
            const legacy = action === 'LEGACY_DATE_CHANGE';
            const before = { Header: { VoucherDate: '2025-01-01', TotalAmount: 100, VoucherTypeCode: 'JV' } };
            const after = { Header: { VoucherDate: '2025-02-01', TotalAmount: 120, VoucherTypeCode: 'JV' } };
            if (!legacy) {
                before.Lines = [{ VoucherDetailID: 10, GLCAID: 1, GLCode: 'TEST', Debit: 100, Credit: 0, Narration: 'Before' }];
                after.Lines = [{ VoucherDetailID: 99, GLCAID: 1, GLCode: 'TEST', Debit: 120, Credit: 0, Narration: 'After' }];
            }
            await request().input('id', sql.Int, base + index).input('no', sql.NVarChar(50), marker + suffix)
                .input('action', sql.NVarChar(40), action).input('at', sql.DateTime2, new Date(at))
                .input('user', sql.Int, legacy ? 99002 : 99001).input('name', sql.NVarChar(100), legacy ? 'Legacy audit tester' : 'Audit_50% tester')
                .input('before', sql.NVarChar(sql.MAX), JSON.stringify(before)).input('after', sql.NVarChar(sql.MAX), JSON.stringify(after))
                .query(`INSERT dms_VoucherEditHistory(VoucherID,VoucherNo,Action,Reason,ChangedBy,ChangedByName,ChangedAt,BeforeJSON,AfterJSON)
                    VALUES(@id,@no,@action,'Synthetic report verification',@user,@name,@at,@before,@after)`);
        }
        const counts = async () => (await request().query(`
            SELECT COUNT(*) AS N FROM data_FinanceVoucherInfo;
            SELECT COUNT(*) AS N FROM dms_PartyLedger;
            SELECT COUNT(*) AS N FROM dms_VoucherEditHistory;
        `)).recordsets.map(rows => rows[0].N);
        const beforeCounts = await counts();
        async function load(query = {}) {
            const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
            await controller.report({ query: { from: '2026-10-24', to: '2026-10-24', voucherNo: marker, ...query } }, res);
            assert.equal(res.code, 200, res.body?.error); return res.body;
        }
        const all = await load();
        assert.deepEqual(all.totals, { edits: 4, vouchers: 4, users: 2, legacyDateOnly: 2 });
        assert.deepEqual(new Set(all.rows.map(row => row.VoucherNo.slice(marker.length))), new Set(['N1', 'N2', 'L1', 'L2']));
        const legacyStart = all.rows.find(row => row.VoucherNo === marker + 'L1');
        assert.equal(legacyStart.EditedAtUtc, '2026-10-23T19:00:00.000Z');
        assert.ok(all.rows.every(row => row.VoucherDateBefore === '2025-01-01' && row.VoucherDateAfter === '2025-02-01'));
        assert.ok(all.rows.every(row => row.VoucherExists === false), 'Deleted vouchers must retain their audit rows.');
        const native = all.rows.find(row => row.VoucherNo === marker + 'N2');
        assert.ok(native.Changes.some(change => change.Field === 'Debit' && change.Before === 100 && change.After === 120));
        assert.ok(!native.Changes.some(change => change.Field === 'VoucherDetailID'));
        assert.equal((await load({ changedBy: 'Audit_50%' })).totals.edits, 2);
        assert.equal((await load({ action: 'LEGACY_DATE_CHANGE' })).totals.edits, 2);
        assert.equal((await load({ voucherNo: marker + 'N2' })).totals.edits, 1);
        const raw = (await request().input('no', sql.NVarChar(50), marker + 'L1')
            .query('SELECT ChangedAt FROM dms_VoucherEditHistory WHERE VoucherNo=@no')).recordset[0];
        assert.equal(raw.ChangedAt.toISOString(), '2026-10-24T00:00:00.000Z', 'Legacy evidence must not be rewritten.');
        assert.deepEqual(await counts(), beforeCounts);
        console.log('PASS: native/legacy Pakistan midnight boundaries, actual edit date rather than voucher date, user/action/voucher filters, exact changes, deleted-voucher evidence and unchanged records.');
    } finally { await tx.rollback(); }
    const left = await pool.request().input('no', sql.NVarChar(100), marker + '%').query('SELECT COUNT(*) AS N FROM dms_VoucherEditHistory WHERE VoucherNo LIKE @no');
    assert.equal(left.recordset[0].N, 0); console.log('PASS: all synthetic audit entries rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.getPool = realGetPool; return sql.close(); });
