jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: { DateTime2: 'datetime2', NVarChar: () => 'text' } }));
const fs = require('fs'), path = require('path'), vm = require('vm');
const { getPool } = require('../config/db');
const { filters, changes, formatEvent } = require('../services/voucherEditAuditReportService');
const controller = require('../controllers/voucherEditAuditReportController');
const router = require('../routes/reportsRoutes');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const snapshot = (amount = 100) => ({ Header: { VoucherID: 1, VoucherNo: 'JV-TEST', VoucherDate: '2026-10-14T00:00:00.000Z', VoucherTypeCode: 'JV', TotalAmount: amount, Remarks: 'Original' },
    Lines: [{ VoucherDetailID: 10, VoucherID: 1, GLCAID: 2, GLCode: 'TEST', GLTitle: 'Example', Debit: amount, Credit: 0, Narration: 'Original', DepartmentID: null, IsExpense: false }], Charity: [] });
const event = (change = {}) => ({ EditID: 1, VoucherID: 1, VoucherNo: 'JV-TEST', Action: 'VOUCHER_EDIT', Reason: 'Correction', ChangedBy: 5, ChangedByName: 'Cashier',
    EditedAtUtc: new Date('2026-10-23T19:30:00Z'), VoucherExists: true, BeforeJSON: JSON.stringify(snapshot()), AfterJSON: JSON.stringify(snapshot(120)), ...change });
function database(rows = []) {
    const values = {}, query = jest.fn(async () => ({ recordset: rows }));
    getPool.mockResolvedValue({ request: () => ({ input(key, type, value) { values[key] = value; return this; }, query }) });
    return { values, query };
}
beforeEach(() => jest.clearAllMocks());

test('edit-day defaults use Pakistan time regardless of execution-host timezone', () => {
    const f = filters({}, new Date('2026-10-23T20:00:00Z'));
    expect(f.fromDay).toBe('2026-10-24'); expect(f.toDay).toBe('2026-10-24');
    expect(f.from.toISOString()).toBe('2026-10-23T19:00:00.000Z');
    expect(f.to.toISOString()).toBe('2026-10-24T19:00:00.000Z');
    expect(f.legacyFrom.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(f.legacyTo.toISOString()).toBe('2026-10-25T00:00:00.000Z');
});
test('one supplied edit date means that complete Pakistan calendar day', () => {
    expect(filters({ from: '2026-10-14' }).toDay).toBe('2026-10-14');
    expect(filters({ to: '2026-10-14' }).fromDay).toBe('2026-10-14');
});
test('header and line amounts show the actual saved before/after values', () => {
    const result = changes(snapshot(), snapshot(120));
    expect(result).toEqual(expect.arrayContaining([{ Section: 'Voucher', Field: 'Total amount', Before: 100, After: 120 },
        { Section: 'Line 1', Field: 'Debit', Before: 100, After: 120 }]));
});
test('regenerated row IDs and lookup-label changes do not fabricate financial edits', () => {
    const before = snapshot(), after = snapshot(); after.Lines[0].VoucherDetailID = 999;
    after.Lines[0].GLTitle = 'Renamed account'; after.Lines[0].DepartmentName = 'Current department label';
    expect(changes(before, after)).toEqual([]);
});
test('account, department, expense and narration changes are identified', () => {
    const before = snapshot(), after = snapshot(); Object.assign(after.Lines[0], { GLCAID: 3, GLCode: 'NEW', GLTitle: 'New account', DepartmentID: 7, DepartmentName: 'Workshop', IsExpense: true, Narration: 'Corrected' });
    const diff = changes(before, after);
    expect(diff).toEqual(expect.arrayContaining([
        { Section: 'Line 1', Field: 'Account', Before: 'TEST Example', After: 'NEW New account' },
        { Section: 'Line 1', Field: 'Department', Before: null, After: 'Workshop' },
        { Section: 'Line 1', Field: 'Expense flag', Before: false, After: true },
        { Section: 'Line 1', Field: 'Narration', Before: 'Original', After: 'Corrected' },
    ]));
});
test('stable IDs distinguish added/removed lines instead of comparing an unrelated row', () => {
    const before = snapshot(), after = snapshot();
    before.Lines.push({ VoucherDetailID: 20, GLCAID: 4, GLCode: 'REMOVED', Debit: 0, Credit: 100 });
    after.Lines.push({ VoucherDetailID: 30, GLCAID: 5, GLCode: 'ADDED', Debit: 0, Credit: 100 });
    const diff = changes(before, after); expect(diff.filter(c => c.Field === 'Line removed')).toHaveLength(1);
    expect(diff.filter(c => c.Field === 'Line added')).toHaveLength(1);
});
test('date-only legacy records do not invent missing line details or charity changes', () => {
    const row = formatEvent(event({ Action: 'LEGACY_DATE_CHANGE', BeforeJSON: '{"Header":{"VoucherDate":"2026-10-13"}}', AfterJSON: '{"Header":{"VoucherDate":"2026-10-14"}}' }));
    expect(row.Coverage).toBe('Earlier date-only record');
    expect(row.Changes).toEqual([{ Section: 'Voucher', Field: 'Voucher date', Before: '2026-10-13', After: '2026-10-14' }]);
});
test('manual charity changes are included and deleted vouchers retain their evidence', () => {
    const after = snapshot(); after.Charity = [{ VoucherAmount: 100, CharityAmount: 1 }];
    const row = formatEvent(event({ VoucherExists: false, AfterJSON: JSON.stringify(after) }));
    expect(row.VoucherExists).toBe(false); expect(row.Changes).toContainEqual({ Section: 'Voucher', Field: 'Manual charity', Before: null, After: '1 on 100' });
});
test('the report binds actual edit-day bounds/user/voucher/action and normalizes legacy local timestamps without rewriting evidence', async () => {
    const { values, query } = database([event(), event({ EditID: 2, VoucherID: 2, Action: 'LEGACY_DATE_CHANGE', ChangedBy: 0 })]), res = response();
    await controller.report({ query: { from: '2026-10-24', to: '2026-10-24', changedBy: "O'Brien_%", voucherNo: 'CPV-1', action: 'VOUCHER_EDIT' } }, res);
    expect(res.code).toBe(200); expect(res.body.totals).toEqual({ edits: 2, vouchers: 2, users: 1, legacyDateOnly: 1 });
    expect(values.changedBy).toBe("%O'Brien~_~%%"); expect(values.voucherNo).toBe('%CPV-1%'); expect(values.action).toBe('VOUCHER_EDIT');
    expect(values.from.toISOString()).toBe('2026-10-23T19:00:00.000Z'); expect(values.legacyFrom.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    const statement = query.mock.calls[0][0];
    expect(statement).toContain("h.Action<>'LEGACY_DATE_CHANGE'"); expect(statement).toContain('h.ChangedAt>=@legacyFrom');
    expect(statement).toContain('DATEADD(minute,-300,h.ChangedAt)'); expect(statement).not.toContain("O'Brien");
    expect(statement).not.toMatch(/VoucherDate\s*(?:>=|BETWEEN)|UPDATE|DELETE|INSERT/i);
});
test.each([{ from: '2026-02-30' }, { from: '0000-01-01' }, { from: '2026-10-25', to: '2026-10-24' },
    { changedBy: ['cashier'] }, { voucherNo: 'x'.repeat(51) }, { action: 'POSTED' }])('invalid audit filters reject before DB access: %j', async query => {
    const res = response(); await controller.report({ query }, res); expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});
test('missing history setup gives an actionable error instead of an empty audit', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {}); getPool.mockRejectedValue(Object.assign(new Error('Missing table'), { number: 208 }));
    const res = response(); await controller.report({ query: {} }, res); expect(res.code).toBe(503); expect(res.body.error).toContain('158_voucher_edit_history.sql'); log.mockRestore();
});
test('report guard accepts audit or existing voucher-view permission, and rejects unauthorized users', () => {
    const guard = router.stack.find(layer => layer.route?.path === '/voucher-edit-audit').route.stack[0].handle;
    for (const permissions of [['report:voucher_audit'], ['finance_vouchers:view']]) {
        const next = jest.fn(); guard({ user: { groupId: 2, permissions } }, response(), next); expect(next).toHaveBeenCalledTimes(1);
    }
    const res = response(), next = jest.fn(); guard({ user: { groupId: 2, permissions: ['sales_reports'] } }, res, next); expect(res.code).toBe(403); expect(next).not.toHaveBeenCalled();
});
test('the dedicated edit report is discoverable for either authorized role', () => {
    const source = fs.readFileSync(path.join(__dirname, '../frontend/src/navigationConfig.js'), 'utf8')
        .replace(/import\s*{([\s\S]*?)}\s*from 'lucide-react';/, (_, names) => `const { ${names.replace(/(\w+) as (\w+)/g, '$1: $2')} } = icons;`)
        .replace(/export (const|function) /g, '$1 ');
    const context = { icons: new Proxy({}, { get: () => () => null }), module: { exports: {} } };
    vm.runInNewContext(source + '\nmodule.exports={getVisibleReports};', context);
    for (const permission of ['report:voucher_audit', 'finance_vouchers:view'])
        expect(context.module.exports.getVisibleReports(() => false, key => key === permission).some(item => item.path === '/reports/voucher-edit-audit')).toBe(true);
});
