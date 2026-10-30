const mockQuery = jest.fn(), mockTrace = [];
jest.mock('../config/db', () => {
    class Request {
        constructor(parent) { this.parent = parent; this.values = {}; }
        input(key, _type, value) { this.values[key] = value; return this; }
        query(text) { mockTrace.push({ text, values: this.values, parent: this.parent }); return mockQuery(text, this.values); }
    }
    class Transaction {
        async begin() { this.begun = true; }
        async commit() { this.committed = true; }
        async rollback() { this.rolledBack = true; }
    }
    return { getPool: jest.fn(async () => ({})), sql: { Request, Transaction,
        Char: () => 'char', NVarChar: () => 'text', Decimal: () => 'decimal', Int: 'int', MAX: 'max',
        DateTime: 'date', ISOLATION_LEVEL: { SERIALIZABLE: 'serializable' } } };
});
const service = require('../services/salarySheetSnapshotService');
const controller = require('../controllers/hrSalaryController');
const { buildSalarySheetWorkbook } = require('../services/salarySheetExcel');
const XLSX = require('xlsx');
const sheet = () => ({ monthId: '2026-09', global: { LateFinePerMinute: 10 }, monthly: null, totalNet: 30000,
    rows: [{ EmployeeID: 1, Name: 'Original employee', DepartmentName: 'Original department',
        Employee: { EmployeeGLID: 11, BasicSalary: 30000 }, Entry: { Advance: 0 }, Attendance: null,
        Calc: { net: 30000, basic: 30000, prorated: 30000, cashShare: 30000, bankShare: 0 } }] });
const savedRow = () => ({ MonthID: '2026-09', SnapshotVersion: 1, SheetJSON: JSON.stringify(sheet()),
    SnapshotBasis: 'POSTED', CapturedAtUtc: '2026-10-01T05:00:00.000Z', CapturedByName: 'Accounts', FirstVoucherID: 7 });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
beforeEach(() => {
    mockTrace.length = 0; mockQuery.mockReset();
    mockQuery.mockImplementation(async () => ({ recordset: [] }));
});

test.each(['2026-01', '2026-12', '1753-01', '9999-12'])('accepts payroll month %s', month => {
    expect(service.validateMonth(month)).toBe(month);
});
test.each([null, undefined, 202609, [], {}, '2026-00', '2026-13', '2026-9', '1752-12', '2026-09-01'])('rejects malformed month %p before SQL', async month => {
    await expect(service.getSnapshot({}, month)).rejects.toMatchObject({ status: 400 });
    expect(mockQuery).not.toHaveBeenCalled();
});
test('loads all figures and employee details from saved JSON without reading current employees', async () => {
    mockQuery.mockResolvedValue({ recordset: [savedRow()] });
    const result = await controller._buildSheet({}, '2026-09');
    expect(result).toMatchObject({ ...sheet(), isFrozen: true, legacyPosted: false,
        snapshot: { basis: 'POSTED', firstVoucherId: 7, capturedBy: 'Accounts' } });
    expect(mockTrace).toHaveLength(1); expect(mockTrace[0].text).not.toContain('gen_EmployeeInfo');
    result.rows[0].Name = 'Changed client copy';
    expect((await service.getSnapshot({}, '2026-09')).rows[0].Name).toBe('Original employee');
});
test('legacy baselines are labelled captured after posting', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ...savedRow(), SnapshotBasis: 'LEGACY_CURRENT' }] });
    expect(await service.getSnapshot({}, '2026-09')).toMatchObject({ isFrozen: true, legacyPosted: true,
        snapshot: { basis: 'LEGACY_CURRENT' } });
});
test('corrupt or incompatible snapshots fail instead of silently recalculating payroll', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ ...savedRow(), SnapshotVersion: 2 }] });
    await expect(controller._buildSheet({}, '2026-09')).rejects.toThrow('saved salary sheet is invalid');
    expect(mockTrace).toHaveLength(1);
});
test('snapshot save retains complete rows and actor, in the voucher transaction', async () => {
    const tx = {}, original = sheet(); let saved;
    mockQuery.mockImplementation(async (text, values) => {
        if (text.includes('INSERT hr_SalarySheetSnapshots')) { saved = values; return { recordset: [] }; }
        return { recordset: saved ? [{ ...savedRow(), SheetJSON: saved.json }] : [] };
    });
    await service.freezeSnapshot(tx, original, { userId: 9, userName: 'Accounts' }, 'POSTED', 7);
    expect(saved).toMatchObject({ m: '2026-09', basis: 'POSTED', voucher: 7, actor: 9, name: 'Accounts' });
    expect(JSON.parse(saved.json)).toEqual(original);
    expect(mockTrace.every(item => item.parent === tx)).toBe(true);
});
test('posting or capturing again cannot replace an existing snapshot', async () => {
    mockQuery.mockResolvedValue({ recordset: [savedRow()] });
    const changed = sheet(); changed.rows[0].Calc.net = 90000;
    const result = await service.freezeSnapshot({}, changed, {}, 'POSTED', 99);
    expect(result.rows[0].Calc.net).toBe(30000);
    expect(mockTrace).toHaveLength(1);
});
test('snapshot write failures propagate so voucher posting can roll back', async () => {
    mockQuery.mockImplementation(async text => {
        if (text.includes('INSERT hr_SalarySheetSnapshots')) throw new Error('Storage failure');
        return { recordset: [] };
    });
    await expect(service.freezeSnapshot({}, sheet(), {}, 'POSTED', 7)).rejects.toThrow('Storage failure');
});
test('salary edits are rejected for frozen months without changing entries', async () => {
    mockQuery.mockImplementation(async text => ({ recordset: text.includes('SELECT * FROM hr_SalarySheetSnapshots') ? [savedRow()] : [] }));
    const res = response(); await controller.saveSalaryEntry({ body: { EmployeeID: 1, MonthID: '2026-09', Advance: 100 }, user: {} }, res);
    expect(res.code).toBe(423);
    expect(mockTrace.some(item => item.text.includes('MERGE hr_SalaryEntries'))).toBe(false);
    expect(mockTrace[0].parent.rolledBack).toBe(true);
});
test('previously posted months are read-only even before baseline capture', async () => {
    mockQuery.mockImplementation(async text => ({ recordset: text.includes('FROM hr_SalaryPostings p') ? [{ PostingType: 'ACCRUAL', VoucherStatus: 'Reversed' }] : [] }));
    await expect(service.assertEditable({}, '2026-09')).rejects.toMatchObject({ status: 423 });
});
test('unposted months still accept partial salary entry updates', async () => {
    const res = response(); await controller.saveSalaryEntry({ body: { EmployeeID: 1, MonthID: '2026-09', Advance: 100 }, user: {} }, res);
    expect(res.code).toBe(200); expect(res.body.updated).toEqual(['Advance']);
    const merge = mockTrace.find(item => item.text.includes('MERGE hr_SalaryEntries'));
    expect(merge.text).toContain('UPDATE SET Advance=@Advance,');
    expect(merge.text).not.toContain('UPDATE SET MessAmountOverride');
    expect(merge.parent.committed).toBe(true);
});
test('posting is serialized for each month with a transaction-owned application lock', async () => {
    const tx = {}; await service.lockMonth(tx, '2026-09');
    expect(mockTrace[0].values.resource).toBe('salary-sheet:2026-09');
    expect(mockTrace[0].text).toContain("@LockOwner='Transaction'");
    expect(mockTrace[0].text).toContain("@LockMode='Exclusive'");
});
test('Excel contains the saved payroll figures and labels legacy baselines', () => {
    const original = { ...sheet(), isFrozen: true, snapshot: { basis: 'LEGACY_CURRENT', capturedAt: '2026-10-30T01:00:00Z' } };
    const workbook = XLSX.read(buildSalarySheetWorkbook(original), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Salary Sheet'], { header: 1 });
    expect(rows.some(row => String(row[0]).includes('captured after posting'))).toBe(true);
    const employee = rows.find(row => row[1] === 'Original employee');
    expect(employee[4]).toBe(30000); expect(employee[20]).toBe(30000);
});
