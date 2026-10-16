jest.mock('../config/db', () => ({
    getPool: jest.fn(),
    sql: { Int: 'int', Bit: 'bit', DateTime: 'datetime', DateTime2: 'datetime2', MAX: 'max',
        Decimal: () => 'decimal', NVarChar: () => 'nvarchar',
        Transaction: class { constructor(pool) { return pool.tx; } },
        Request: class {
            constructor(tx) { this.tx = tx; this.values = {}; }
            input(k, t, v) { this.values[k] = v; return this; }
            query(q) { return this.tx.query(q, this.values); }
        },
    },
}));
const { getPool } = require('../config/db');
const { withVoucherEditHistory } = require('../services/voucherEditHistoryService');
const accounts = require('../controllers/accountController');
const history = require('../controllers/voucherEditHistoryController');
const router = require('../routes/accountRoutes');
const clone = v => JSON.parse(JSON.stringify(v));
const user = { userId: 95, userName: 'Test cashier', groupId: 1 };
const today = new Date().toISOString().slice(0, 10);
const response = () => ({ code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; } });
function fixture(options = {}) {
    const header = { VoucherID: 7, VoucherNo: 'JV-AUDIT', VoucherDate: today, VoucherTypeID: 5,
        VoucherTypeCode: 'JV', Status: 'Posted', ReversesVoucherID: null, TotalAmount: 48000, Remarks: 'Original', ...options.header };
    const initial = { header, lines: [
        { VoucherDetailID: 1, VoucherID: 7, GLCAID: 10, Debit: 48000, Credit: 0, Narration: 'Original receipt', PartyID: 9, BookingID: 184, DepartmentID: 2, IsExpense: true },
        { VoucherDetailID: 2, VoucherID: 7, GLCAID: 11, Debit: 0, Credit: 48000 },
    ], charity: [], history: [], dates: [] };
    const tx = { state: clone(initial), calls: [], begin: jest.fn(async () => {}), commit: jest.fn(async () => {}),
        rollback: jest.fn(async () => { tx.state = clone(initial); }) };
    tx.query = jest.fn(async (q, v) => {
        tx.calls.push({ q, v });
        if (q.includes('SELECT v.VoucherID')) return { recordset: options.missing ? [] : [clone(tx.state.header)] };
        if (q.includes('SELECT d.*')) return { recordset: clone(tx.state.lines) };
        if (q.includes('SELECT VoucherAmount')) return { recordset: clone(tx.state.charity) };
        if (q.includes('DELETE FROM data_FinanceVoucherDetail')) tx.state.lines = [];
        else if (q.includes('INSERT INTO data_FinanceVoucherDetail')) tx.state.lines.push({ GLCAID: v.GL, Debit: v.Dr, Credit: v.Cr, Narration: v.Nar });
        else if (q.includes('UPDATE data_FinanceVoucherInfo')) {
            if ('dt' in v) tx.state.header.VoucherDate = v.dt;
            else Object.assign(tx.state.header, { VoucherDate: v.VoucherDate, VoucherTypeID: v.VTID, Remarks: v.Remarks, TotalAmount: v.Total });
        } else if (q.includes('UPDATE data_FinanceVoucherDetail')) {
            if (options.staleLine) return { recordset: [], rowsAffected: [0] };
            const updated = tx.state.lines.filter(l => 'vid' in v ? l.VoucherDetailID === v.id : l.Debit > 0);
            updated.forEach(l => { l.DepartmentID = v.dep ?? null; l.IsExpense = v.exp; });
            return { recordset: updated.map(l => ({ VoucherDetailID: l.VoucherDetailID })), rowsAffected: [] };
        } else if (q.includes('INSERT INTO dms_VoucherDateChanges')) tx.state.dates.push(clone(v));
        else if (q.includes('DELETE FROM dms_CharityTracking')) tx.state.charity = [];
        else if (q.includes('INSERT INTO dms_CharityTracking')) {
            if (options.failCharity) throw new Error('Charity update failed');
            tx.state.charity.push({ VoucherAmount: v.va, CharityAmount: v.ca });
        }
        else if (q.includes('INSERT INTO dms_VoucherEditHistory')) {
            if (options.failAudit) throw new Error('Audit insert failed');
            tx.state.history.push(clone(v));
        }
        return { recordset: [], rowsAffected: [1] };
    });
    const pool = { tx, request() { const values = {}; return { input(k, t, v) { values[k] = v; return this; }, async query(q) {
        if (q.includes('SELECT DepartmentID')) return { recordset: [{ DepartmentID: 3 }] };
        if (q.includes('SELECT VoucherDetailID')) return { recordset: [{ VoucherDetailID: 1 }] };
        return { recordset: [{ ...clone(header), VoucherType: header.VoucherTypeCode, ...options.prechecked }] };
    } }; } };
    getPool.mockResolvedValue(pool);
    return { pool, tx, initial };
}
function editRequest(extra = {}) {
    return { params: { id: '7' }, user, body: { VoucherDate: today, VoucherTypeID: 5, Remarks: 'Corrected', Reason: 'Correct actual receipt',
        Items: [{ GLCAID: 10, Debit: 0.01, Credit: 0 }, { GLCAID: 11, Debit: 0, Credit: 0.01 }], ...extra } };
}
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); });

test('full posted edit records authenticated actor and actual before/after values, including lost associations', async () => {
    const { tx } = fixture(); const res = response();
    await accounts.updateVoucher(editRequest({ ChangedBy: 1, ChangedByName: 'Impersonated' }), res);
    expect(res.code).toBe(200); expect(tx.commit).toHaveBeenCalledTimes(1);
    const row = tx.state.history[0];
    expect(row.by).toBe(95); expect(row.name).toBe('Test cashier'); expect(row.reason).toBe('Correct actual receipt');
    expect(JSON.parse(row.before).Lines[0]).toMatchObject({ Debit: 48000, PartyID: 9, BookingID: 184 });
    expect(JSON.parse(row.after).Lines[0].Debit).toBe(0.01);
    expect(JSON.parse(row.after).Header.TotalAmount).toBe(0.01);
    expect(tx.calls.find(c => c.q.includes('SELECT v.VoucherID')).q).toContain('UPDLOCK, HOLDLOCK');
    expect(tx.calls.at(-1).q).toContain('INSERT INTO dms_VoucherEditHistory');
});

test('audit failure rolls back financial changes and reports failure', async () => {
    const { tx, initial } = fixture({ failAudit: true }); const res = response();
    await accounts.updateVoucher(editRequest(), res);
    expect(res.code).toBe(400); expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled(); expect(tx.state).toEqual(initial);
});

test('cash receipt charity state is included in persisted snapshots', async () => {
    const { tx } = fixture({ header: { VoucherTypeCode: 'CRV' } }); const res = response();
    await accounts.updateVoucher(editRequest({ IsCharitable: true, Items: [{ GLCAID: 10, Debit: 200 }, { GLCAID: 11, Credit: 200 }] }), res);
    expect(res.code).toBe(200);
    expect(JSON.parse(tx.state.history[0].before).Charity).toEqual([]);
    expect(JSON.parse(tx.state.history[0].after).Charity).toEqual([{ VoucherAmount: 200, CharityAmount: 2 }]);
});

test('charity reconciliation failure rolls back the voucher and leaves no successful trail', async () => {
    const { tx, initial } = fixture({ header: { VoucherTypeCode: 'CRV' }, failCharity: true }); const res = response();
    await accounts.updateVoucher(editRequest({ IsCharitable: true }), res);
    expect(res.code).toBe(400); expect(tx.state).toEqual(initial); expect(tx.commit).not.toHaveBeenCalled();
});

test.each(['', 'ab', 'x'.repeat(501), null])('full edit rejects missing/invalid reason %p', async reason => {
    const { tx } = fixture(); const res = response();
    await accounts.updateVoucher(editRequest({ Reason: reason }), res);
    expect(res.code).toBe(400); expect(tx.begin).not.toHaveBeenCalled();
});

test('state changed between precheck and locked read is rejected', async () => {
    const { tx } = fixture({ prechecked: { Status: 'Draft' } }); const res = response();
    await accounts.updateVoucher(editRequest(), res);
    expect(res.code).toBe(409); expect(tx.rollback).toHaveBeenCalled(); expect(tx.state.history).toHaveLength(0);
});

test('date-only edit records full snapshots and legacy date log in one transaction', async () => {
    const { tx } = fixture(); const res = response();
    await accounts.updateVoucherDate({ params: { id: '7' }, user, body: { VoucherDate: '2026-09-01', Reason: 'Correct business date' } }, res);
    expect(res.code).toBe(200); expect(tx.state.dates).toHaveLength(1);
    expect(tx.state.history[0].action).toBe('DATE_CHANGE');
    expect(JSON.parse(tx.state.history[0].before).Header.VoucherDate).toBe(today);
    expect(JSON.parse(tx.state.history[0].after).Header.VoucherDate).toContain('2026-09-01');
    expect(JSON.parse(tx.state.history[0].after).Lines).toHaveLength(2);
});

test('full edit that changes date also writes legacy date history', async () => {
    const { tx } = fixture(); const res = response();
    await accounts.updateVoucher(editRequest({ VoucherDate: '2026-09-01' }), res);
    expect(res.code).toBe(200); expect(tx.state.dates).toHaveLength(1); expect(tx.state.history).toHaveLength(1);
});

test.each([['updateVoucherLineDepartment', { DepartmentID: 3, IsExpense: true }, 'LINE_DEPARTMENT_CHANGE'],
    ['bulkSetVoucherExpenseFlag', { IsExpense: false }, 'EXPENSE_FLAG_CHANGE']])('%s records line metadata changes', async (method, body, action) => {
    const { tx } = fixture(); const res = response();
    await accounts[method]({ params: { id: '7', lineId: '1' }, user, body }, res);
    expect(res.code).toBe(200); expect(tx.state.history[0].action).toBe(action);
    expect(JSON.parse(tx.state.history[0].before).Lines[0].DepartmentID).toBe(2);
    expect(JSON.parse(tx.state.history[0].after).Lines[0].DepartmentID).toBe(method === 'bulkSetVoucherExpenseFlag' ? null : 3);
});

test('stale line edit rolls back without producing a successful history entry', async () => {
    const { tx } = fixture({ staleLine: true }); const res = response();
    await accounts.updateVoucherLineDepartment({ params: { id: '7', lineId: '1' }, user, body: { DepartmentID: 3 } }, res);
    expect(res.code).toBe(409); expect(tx.commit).not.toHaveBeenCalled(); expect(tx.state.history).toHaveLength(0);
});

test('missing voucher and missing authenticated actor cannot commit an edit', async () => {
    const { pool, tx } = fixture({ missing: true });
    await expect(withVoucherEditHistory(pool, { user, body: {} }, 7, 'DATE_CHANGE', async () => {})).rejects.toMatchObject({ status: 404 });
    expect(tx.commit).not.toHaveBeenCalled();
    const next = fixture();
    await expect(withVoucherEditHistory(next.pool, { body: {} }, 7, 'DATE_CHANGE', async () => {})).rejects.toMatchObject({ status: 401 });
    expect(next.tx.rollback).toHaveBeenCalled();
});

test('history filters use bound parameters, PKT inclusive dates, stable pagination and parsed snapshots', async () => {
    const calls = [], values = {};
    getPool.mockResolvedValue({ request: () => ({ input(k,t,v) { values[k] = v; return this; }, async query(q) {
        calls.push(q); return { recordset: q.includes('COUNT(*)') ? [{ Total: 1 }] : [{ EditID: 1, BeforeJSON: '{"Header":{}}', AfterJSON: '{"Header":{}}' }] };
    } }) });
    const res = response();
    await history.getVoucherEditHistory({ params: {}, query: { voucherNo: "CRV-'", changedBy: 'Cashier', from: '2026-10-14', to: '2026-10-14', offset: '10' } }, res);
    expect(res.code).toBe(200); expect(res.body.rows[0].Before).toEqual({ Header: {} });
    expect(values.from.toISOString()).toBe('2026-10-13T19:00:00.000Z');
    expect(values.to.toISOString()).toBe('2026-10-14T19:00:00.000Z');
    expect(values.no).toBe("%CRV-'%"); expect(calls.join()).not.toContain("CRV-'");
    expect(calls.at(-1)).toContain('ORDER BY EditID DESC'); expect(values.offset).toBe(10);
});

test.each([{ from: '2026-02-30' }, { from: '2026-10-16', to: '2026-10-14' }, { limit: '1000' }, { offset: '-1' }])('invalid history filters rejected: %p', async query => {
    const res = response(); await history.getVoucherEditHistory({ params: {}, query }, res); expect(res.code).toBe(400);
});

test('history routes enforce view/report permissions and precede voucher-id lookup', () => {
    const paths = router.stack.filter(l => l.route).map(l => l.route.path);
    expect(paths.indexOf('/vouchers/edit-history')).toBeLessThan(paths.indexOf('/vouchers/:id'));
    for (const path of ['/vouchers/edit-history', '/vouchers/:id/edit-history']) {
        const layer = router.stack.find(l => l.route?.path === path);
        const res = response(), next = jest.fn();
        layer.route.stack[0].handle({ user: { groupId: 2, permissions: [] } }, res, next);
        expect(res.code).toBe(403); expect(next).not.toHaveBeenCalled();
    }
});
