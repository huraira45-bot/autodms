jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: { NVarChar: () => 'text' } }));
const { getPool } = require('../config/db');
const report = require('../controllers/accountBookingReportController');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
function database(rows = []) {
    const values = {}, query = jest.fn(async () => ({ recordset: rows }));
    getPool.mockResolvedValue({ request: () => ({ input(key, type, value) { values[key] = value; return this; }, query }) });
    return { values, query };
}
beforeEach(() => jest.clearAllMocks());

test.each([undefined, '', '  '])('empty search prompts for an account without loading the chart or bookings: %p', async search => {
    const res = response(); await report.report({ query: { search } }, res);
    expect(res.code).toBe(200); expect(res.body).toMatchObject({ searchRequired: true, rows: [], totals: { accounts: 0, bookings: 0 } });
    expect(getPool).not.toHaveBeenCalled();
});
test('account lookup follows actual customer account IDs and retains every booking status', async () => {
    const rows = [{ AccountID: 5, BookingID: 10, Status: 'Closed', IsHistorical: true },
        { AccountID: 5, BookingID: 11, Status: 'Cancelled' }, { AccountID: 6, BookingID: null }];
    const { values, query } = database(rows), res = response();
    await report.report({ query: { search: '  201002  ' } }, res);
    expect(values).toEqual({ search: '%201002%', exact: '201002' });
    expect(res.body).toMatchObject({ rows, search: '201002', searchRequired: false,
        totals: { accounts: 2, linkedAccounts: 1, unlinkedAccounts: 1, bookings: 2 } });
    const statement = query.mock.calls[0][0];
    expect(statement).toContain('p.PartyGLID=a.GLCAID');
    expect(statement).toContain('LEFT JOIN dms_SalesBookings b ON b.PartyID=p.PartyID');
    expect(statement).toContain('a.GLTitle LIKE @search');
    expect(statement).toContain('WHEN a.GLCode=@exact THEN 0');
    expect(statement).not.toMatch(/b\.Status\s*[=<>]|b\.IsHistorical\s*=/);
    expect(statement).not.toMatch(/PartyLedger|FinanceVoucher|SalesPayments|TOP\s+\d+/i);
});
test('totals count accounts and bookings distinctly when an account has several customer records', async () => {
    database([{ AccountID: 5, PartyID: 1, BookingID: 10 }, { AccountID: 5, PartyID: 2, BookingID: 11 },
        { AccountID: 5, PartyID: 3, BookingID: null }, { AccountID: 6, PartyID: null, BookingID: null }]);
    const res = response(); await report.report({ query: { search: 'Family' } }, res);
    expect(res.body.totals).toEqual({ accounts: 2, linkedAccounts: 1, unlinkedAccounts: 1, bookings: 2 });
    expect(res.body.rows).toHaveLength(4);
});
test('literal account-title search safely handles SQL punctuation', async () => {
    const { values, query } = database(), res = response();
    await report.report({ query: { search: "O'Brien_50%[west]~" } }, res);
    expect(values.search).toBe("%O'Brien~_50~%~[west~]~~%");
    expect(values.exact).toBe("O'Brien_50%[west]~");
    expect(query.mock.calls[0][0]).not.toContain("O'Brien");
    expect(res.body.totals).toEqual({ accounts: 0, linkedAccounts: 0, unlinkedAccounts: 0, bookings: 0 });
});
test.each([null, {}, ['name'], 42, 'x'.repeat(151)])('malformed account search is rejected before DB access: %p', async search => {
    const res = response(); await report.report({ query: { search } }, res);
    expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});
test('database failures do not appear as an unlinked account', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    getPool.mockRejectedValue(new Error('Connection unavailable'));
    const res = response(); await report.report({ query: { search: 'Account' } }, res);
    expect(res.code).toBe(500); expect(res.body.error).toBe('Connection unavailable'); errorLog.mockRestore();
});
