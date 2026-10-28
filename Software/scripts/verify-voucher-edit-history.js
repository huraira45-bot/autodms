/** Local SQL integration verification. All voucher/audit fixtures roll back. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const db = require('../config/db');
const { sql } = db;

(async () => {
    if (!['.', 'localhost', '127.0.0.1', require('os').hostname().toLowerCase()]
        .includes((process.env.DB_SERVER || '').split('\\')[0].toLowerCase())) {
        throw new Error('Run against the local development database only.');
    }
    const pool = await db.getPool(), tx = new sql.Transaction(pool), marker = 'VH-' + Date.now();
    const countHistory = async () => (await pool.request().query('SELECT COUNT(*) AS N FROM dms_VoucherEditHistory')).recordset[0].N;
    const existingHistory = await countHistory();
    await pool.request().query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '158_voucher_edit_history.sql'), 'utf8'));
    assert.equal(await countHistory(), existingHistory, 'Re-running migration must not duplicate legacy date history.');
    let failAudit = false;
    await tx.begin();
    const request = () => new sql.Request(tx);
    try {
        const lookup = await request().query(`SELECT TOP(1) Voucherid FROM GLVoucherType WHERE Title='JV';
            SELECT TOP(2) GLCAID FROM GLChartOFAccount WHERE isParent=0 ORDER BY GLCAID;
            SELECT TOP(1) UserID,UserName FROM GLUser ORDER BY UserID;
            SELECT TOP(1) DepartmentID FROM gen_DepartmentInfo ORDER BY DepartmentID`);
        assert.ok(lookup.recordsets.every(r => r.length), 'Local DB requires type, accounts, user and department fixtures.');
        const type = lookup.recordsets[0][0].Voucherid, accounts = lookup.recordsets[1], actor = lookup.recordsets[2][0];
        const dept = lookup.recordsets[3][0].DepartmentID;
        const created = await request().input('no', sql.NVarChar(50), marker).input('type', sql.Int, type).query(`
            INSERT INTO data_FinanceVoucherInfo (VoucherNo,VoucherDate,VoucherTypeID,Status,Posted,TotalAmount,Remarks)
            OUTPUT INSERTED.VoucherID VALUES (@no,GETDATE(),@type,'Draft',0,100,'History verification')`);
        const id = created.recordset[0].VoucherID;
        for (let i = 0; i < 2; i++) await request().input('id', sql.Int, id).input('gl', sql.Int, accounts[i].GLCAID)
            .input('dr', sql.Decimal(18, 2), i === 0 ? 100 : 0).input('cr', sql.Decimal(18, 2), i === 1 ? 100 : 0)
            .query(`INSERT INTO data_FinanceVoucherDetail(VoucherID,GLCAID,Debit,Credit) VALUES(@id,@gl,@dr,@cr)`);
        await request().input('id', sql.Int, id).query(`UPDATE data_FinanceVoucherInfo SET Status='Posted',Posted=1 WHERE VoucherID=@id`);

        // Use actual controller/service SQL on the outer fixture transaction.
        // Each service transaction becomes a SQL savepoint; its commit remains
        // inside the outer transaction, which is always rolled back below.
        const adapter = {
            ...sql,
            Transaction: class {
                async begin() { await request().query('SAVE TRANSACTION HistoryEditTest'); }
                async commit() {}
                async rollback() { await request().query('ROLLBACK TRANSACTION HistoryEditTest'); }
            },
            Request: class {
                constructor() { this.real = request(); }
                input(...args) { this.real.input(...args); return this; }
                query(query) {
                    if (failAudit && query.includes('INSERT INTO dms_VoucherEditHistory')) return Promise.reject(new Error('Forced audit failure'));
                    return this.real.query(query);
                }
            },
        };
        const mockedDb = { sql: adapter, getPool: async () => ({ request }) };
        function load(relative, extra = {}) {
            const filename = path.join(__dirname, '..', relative), candidate = new Module(filename, module);
            candidate.filename = filename; candidate.paths = Module._nodeModulePaths(path.dirname(filename));
            const realRequire = Module.createRequire(filename);
            candidate.require = name => name === '../config/db' ? mockedDb : extra[name] || realRequire(name);
            candidate._compile(fs.readFileSync(filename, 'utf8'), filename);
            return candidate.exports;
        }
        const service = load('services/voucherEditHistoryService.js');
        const controller = load('controllers/accountController.js', { '../services/voucherEditHistoryService': service });
        const historyController = load('controllers/voucherEditHistoryController.js');
        const user = { userId: actor.UserID, userName: actor.UserName, groupId: 1 };
        async function invoke(method, body, params = {}) {
            const res = { code: 200, status(n) { this.code = n; return this; }, json(v) { this.body = v; } };
            await controller[method]({ params: { id: String(id), ...params }, user, body }, res);
            return res;
        }
        const originalHeader = (await request().input('id', sql.Int, id).query('SELECT VoucherDate FROM data_FinanceVoucherInfo WHERE VoucherID=@id')).recordset[0];
        const body = { VoucherDate: originalHeader.VoucherDate, VoucherTypeID: type, Remarks: 'Edited in SQL test', Reason: 'Verify permanent audit',
            Items: [{ GLCAID: accounts[0].GLCAID, Debit: 125.25, Credit: 0 }, { GLCAID: accounts[1].GLCAID, Debit: 0, Credit: 125.25 }] };
        assert.equal((await invoke('updateVoucher', body)).code, 200);
        const rows = async () => (await request().input('id', sql.Int, id).query(`SELECT * FROM dms_VoucherEditHistory WHERE VoucherID=@id ORDER BY EditID`)).recordset;
        let trail = await rows();
        assert.equal(trail.length, 1);
        assert.equal(JSON.parse(trail[0].BeforeJSON).Header.TotalAmount, 100);
        assert.equal(JSON.parse(trail[0].AfterJSON).Header.TotalAmount, 125.25);
        assert.equal(trail[0].ChangedBy, actor.UserID);
        assert.ok(trail[0].ChangedAt instanceof Date);

        failAudit = true;
        const oldError = console.error; console.error = () => {};
        let rejected;
        try { rejected = await invoke('updateVoucher', { ...body, Remarks: 'MUST ROLL BACK' }); }
        finally { console.error = oldError; failAudit = false; }
        assert.equal(rejected.code, 400);
        assert.equal((await rows()).length, 1);
        const retained = (await request().input('id', sql.Int, id).query('SELECT Remarks FROM data_FinanceVoucherInfo WHERE VoucherID=@id')).recordset[0];
        assert.equal(retained.Remarks, 'Edited in SQL test');

        // Legacy BPVs often have the debit first. Both values must save and
        // appear in the audit trail once the editor permits changing them.
        const bpvType = (await request().query("SELECT TOP(1) Voucherid FROM GLVoucherType WHERE Title='BPV'")).recordset[0].Voucherid;
        const bpv = (await request().input('no', sql.NVarChar(50), marker + '-BPV').input('type', sql.Int, bpvType)
            .query(`INSERT data_FinanceVoucherInfo(VoucherNo,VoucherDate,VoucherTypeID,Status,Posted,TotalAmount,Remarks)
                OUTPUT INSERTED.VoucherID VALUES(@no,GETDATE(),@type,'Draft',0,100,'BPV both-line test')`)).recordset[0].VoucherID;
        for (let index = 0; index < 2; index++) await request().input('id', sql.Int, bpv).input('gl', sql.Int, accounts[index].GLCAID)
            .input('dr', sql.Decimal(18,2), index ? 0 : 100).input('cr', sql.Decimal(18,2), index ? 100 : 0)
            .query('INSERT data_FinanceVoucherDetail(VoucherID,GLCAID,Debit,Credit) VALUES(@id,@gl,@dr,@cr)');
        await request().input('id', sql.Int, bpv).query("UPDATE data_FinanceVoucherInfo SET Status='Posted',Posted=1 WHERE VoucherID=@id");
        const bpvDate = (await request().input('id', sql.Int, bpv).query('SELECT VoucherDate FROM data_FinanceVoucherInfo WHERE VoucherID=@id')).recordset[0].VoucherDate;
        assert.equal((await invoke('updateVoucher', { ...body, VoucherDate: bpvDate, VoucherTypeID: bpvType }, { id: String(bpv) })).code, 200);
        const bpvRead = await invoke('getVoucher', {}, { id: String(bpv) });
        assert.equal(bpvRead.code, 200); assert.equal(bpvRead.body.TotalAmount, 125.25);
        assert.deepEqual(bpvRead.body.lines.map(line => [line.Debit,line.Credit]), [[125.25,0],[0,125.25]]);
        const bpvAudit = (await request().input('id', sql.Int, bpv).query('SELECT BeforeJSON,AfterJSON FROM dms_VoucherEditHistory WHERE VoucherID=@id')).recordset;
        assert.equal(bpvAudit.length,1); assert.equal(JSON.parse(bpvAudit[0].BeforeJSON).Lines[0].Debit,100);
        assert.equal(JSON.parse(bpvAudit[0].AfterJSON).Lines[0].Debit,125.25);
        console.log('PASS: posted BPV with debit first saves both edited amounts, remains balanced, reloads correctly and retains before/after history.');

        assert.equal((await invoke('updateVoucherDate', { VoucherDate: '2026-09-01', Reason: 'Test date evidence' })).code, 200);
        const line = (await request().input('id', sql.Int, id).query('SELECT TOP(1) VoucherDetailID FROM data_FinanceVoucherDetail WHERE VoucherID=@id AND Debit>0')).recordset[0];
        assert.equal((await invoke('updateVoucherLineDepartment', { DepartmentID: dept, IsExpense: true }, { lineId: String(line.VoucherDetailID) })).code, 200);
        assert.equal((await invoke('bulkSetVoucherExpenseFlag', { IsExpense: false })).code, 200);
        trail = await rows();
        assert.deepEqual(trail.map(r => r.Action), ['VOUCHER_EDIT', 'DATE_CHANGE', 'LINE_DEPARTMENT_CHANGE', 'EXPENSE_FLAG_CHANGE']);
        assert.equal(JSON.parse(trail[2].AfterJSON).Lines.find(l => l.Debit > 0).DepartmentID, dept);
        assert.equal(JSON.parse(trail[3].AfterJSON).Lines.find(l => l.Debit > 0).IsExpense, false);

        const currentDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        const historyResponse = { code: 200, status(n) { this.code=n; return this; }, json(body) { this.body=body; } };
        await historyController.getVoucherEditHistory({ params: { id: String(id) }, query: { from: currentDay, to: currentDay } }, historyResponse);
        assert.equal(historyResponse.code, 200, JSON.stringify(historyResponse.body));
        assert.equal(historyResponse.body.total, 4);
        assert.equal(historyResponse.body.rows[0].Before.Header.VoucherNo, marker);

        let blocked = false;
        try { await request().input('id', sql.Int, id).query('UPDATE dms_VoucherEditHistory SET Reason=Reason WHERE VoucherID=@id'); }
        catch (err) { blocked = /cannot be changed or deleted/.test(err.message); }
        assert.ok(blocked, 'Append-only trigger must reject history modification.');
        console.log('PASS: idempotent migration, real SQL snapshots, actor, four edit paths, PKT history query, audit-failure rollback and append-only enforcement.');
    } finally {
        try { await tx.rollback(); } catch (err) { if (!['EABORT', 'ENOTBEGUN'].includes(err.code)) throw err; }
    }
    const left = await pool.request().input('no', sql.NVarChar(50), marker).query(`SELECT COUNT(*) AS N FROM data_FinanceVoucherInfo WHERE VoucherNo=@no;
        SELECT COUNT(*) AS N FROM dms_VoucherEditHistory WHERE VoucherNo=@no`);
    assert.ok(left.recordsets.every(r => r[0].N === 0), 'All fixture and audit records must roll back.');
    console.log('PASS: zero retained fixture vouchers or audit rows.');
})().catch(err => { console.error(err.message || err); process.exitCode = 1; }).finally(() => sql.close());
