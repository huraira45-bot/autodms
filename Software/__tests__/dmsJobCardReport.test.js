jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: { NVarChar: () => 'text', DateTime: 'datetime' } }));
const { getPool } = require('../config/db');
const { report } = require('../controllers/dmsJobCardReportController');
const router = require('../routes/serviceReportsRoutes');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function database(rows = []) {
    const values = {}, query = jest.fn(async () => ({ recordset: rows }));
    getPool.mockResolvedValue({ request: () => ({ input(key, type, value) { values[key] = value; return this; }, query }) });
    return { values, query };
}
beforeEach(() => jest.clearAllMocks());

test.each([undefined, '', '  '])('empty DMS number prompts for search without querying SQL: %p', async number => {
    const res = response(); await report({ query: { number } }, res);
    expect(res.body).toMatchObject({ searchRequired: true, rows: [], count: 0 });
    expect(getPool).not.toHaveBeenCalled();
});

test.each(['', '  ', undefined])('blank number with dates browses recorded DMS numbers: %p', async number => {
    const rows = [{ JobCardId: 3, DMSJobCardNo: '00042', IsFinalized: true }];
    const { values, query } = database(rows), res = response();
    await report({ query: { number, from: '2026-10-01', to: '2026-10-30', match: 'exact' } }, res);
    expect(res.body).toMatchObject({ rows, count: 1, number: '', searchRequired: false });
    expect(Object.keys(values).sort()).toEqual(['from', 'to']);
    const statement = query.mock.calls[0][0];
    const where = statement.split('WHERE ')[1].split('ORDER BY ')[0].trim();
    expect(where).toContain('j.DMSJobCardNo');
    expect(where).toContain("N'') IS NOT NULL AND j.JobCardDate >= @from AND j.JobCardDate <= @to");
    expect(statement).not.toContain('@exact');
    expect(statement).not.toContain('LIKE');
});

test.each([{ from: '2026-10-01' }, { to: '2026-10-30' }])('date-only search waits for a complete range: %p', async dates => {
    const res = response(); await report({ query: { number: '', ...dates } }, res);
    expect(res.body.searchRequired).toBe(true); expect(getPool).not.toHaveBeenCalled();
});

test('date-only search retains finalization filtering', async () => {
    const { query } = database(), res = response();
    await report({ query: { from: '2026-10-01', to: '2026-10-30', finalized: 'finalized' } }, res);
    expect(res.body.searchRequired).toBe(false);
    expect(query.mock.calls[0][0]).toContain('AND j.IsFinalized = 1');
});

test('all dates and all draft/finalized states are included; duplicate DMS numbers retain every job card', async () => {
    const rows = [{ JobCardId: 1, DMSJobCardNo: '00042', IsFinalized: false },
        { JobCardId: 2, DMSJobCardNo: '00042', IsFinalized: true, JobStatusText: 'Closed' }];
    const { values, query } = database(rows), res = response();
    await report({ query: { number: ' 00042 ' } }, res);
    expect(res.body).toMatchObject({ rows, count: 2, number: '00042', searchRequired: false, from: '', to: '', finalized: 'all' });
    expect(values).toEqual({ number: '%00042%', exact: '00042' });
    const statement = query.mock.calls[0][0];
    const where = statement.split('WHERE ')[1].split('ORDER BY ')[0];
    expect(where.trim()).toContain("N'') IS NOT NULL AND j.DMSJobCardNo LIKE @number ESCAPE '~'");
    expect(statement).not.toMatch(/TOP\s+\d+|SUM\(|PartyLedger|FinanceVoucher/i);
    expect(statement).toContain('WHEN j.DMSJobCardNo = @exact THEN 0');
});

test('exact match preserves leading zeros and punctuation as a bound SQL parameter', async () => {
    const { values, query } = database(), res = response();
    const number = "00/JV-42%' OR 1=1--";
    await report({ query: { number, match: 'exact' } }, res);
    expect(values).toEqual({ exact: number });
    expect(query.mock.calls[0][0]).toContain('AND j.DMSJobCardNo = @exact');
    expect(query.mock.calls[0][0]).not.toContain(number);
});

test('contains treats SQL wildcard characters as literal number characters', async () => {
    const { values } = database(), res = response();
    await report({ query: { number: "O'Brien_50%[west]~" } }, res);
    expect(values.number).toBe("%O'Brien~_50~%~[west~]~~%");
});

test('date filters use job-card date and include the entire end day', async () => {
    const { values, query } = database(), res = response();
    await report({ query: { number: '42', from: '2024-02-29', to: '2024-02-29', finalized: 'draft' } }, res);
    expect(res.code).toBe(200);
    expect(values.from.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(values.to.toISOString()).toBe('2024-02-29T23:59:59.997Z');
    expect(query.mock.calls[0][0]).toContain('j.JobCardDate >= @from AND j.JobCardDate <= @to');
    expect(query.mock.calls[0][0]).toContain('(j.IsFinalized = 0 OR j.IsFinalized IS NULL)');
});

test('finalized-only filtering is explicit', async () => {
    const { query } = database(), res = response();
    await report({ query: { number: '42', finalized: 'finalized' } }, res);
    expect(query.mock.calls[0][0]).toContain('AND j.IsFinalized = 1');
});

test.each([
    { number: null }, { number: {} }, { number: ['42'] }, { number: 'x'.repeat(51) },
    { match: 'invalid' }, { match: ['exact'] }, { finalized: 'closed' },
    { from: '2026-02-29' }, { to: '2026-02-30' }, { from: '1752-12-31' },
    { from: '2026-10-02', to: '2026-10-01' }, { to: '2026-10-30T12:00' }, { from: ['2026-10-01'] },
])('invalid filters fail before SQL: %p', async invalid => {
    const res = response(); await report({ query: { number: '42', ...invalid } }, res);
    expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});

test('connection errors remain errors rather than a misleading empty search', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    getPool.mockRejectedValue(new Error('Connection unavailable'));
    const res = response(); await report({ query: { number: '42' } }, res);
    expect(res.code).toBe(500); expect(res.body.error).toBe('Connection unavailable'); log.mockRestore();
});

const guard = router.stack.find(layer => layer.route?.path === '/dms-job-cards').route.stack[0].handle;
test.each(['report:job_card_register', 'workshop_jobs:view'])('%s can read the lookup', permission => {
    const res = response(), next = jest.fn();
    guard({ user: { groupId: 2, permissions: [permission] } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
});
test('main Admin can read; unrelated or edit-only roles cannot bypass view permission', () => {
    const next = jest.fn(); guard({ user: { groupId: 1 } }, response(), next);
    expect(next).toHaveBeenCalledTimes(1);
    for (const permissions of [[], ['workshop_jobs:edit'], ['report:booking_register']]) {
        const res = response(), denied = jest.fn();
        guard({ user: { groupId: 2, permissions } }, res, denied);
        expect(res.code).toBe(403); expect(denied).not.toHaveBeenCalled();
    }
});
