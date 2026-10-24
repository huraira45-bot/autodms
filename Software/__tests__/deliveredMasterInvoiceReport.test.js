jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: { Date: 'date', NVarChar: () => 'text' } }));
const { getPool } = require('../config/db');
const controller = require('../controllers/deliveredMasterInvoiceReportController');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
function database(rows = []) {
    const values = {}, query = jest.fn(async () => ({ recordset: rows }));
    getPool.mockResolvedValue({ request: () => ({ input(key, type, value) { values[key] = value; return this; }, query }) });
    return { values, query };
}
beforeEach(() => jest.clearAllMocks());

test('report requires actual delivery evidence, excludes historical/cancelled and requires an active invoice file to clear pending', async () => {
    const rows = [{ BookingID: 7, Status: 'Closed', DeliveryDate: '2026-10-23' }];
    const { query } = database(rows), res = response();
    await controller.report({ query: {} }, res);
    expect(res.code).toBe(200); expect(res.body).toMatchObject({ rows, total: 1 });
    const statement = query.mock.calls[0][0];
    expect(statement).toContain('ISNULL(b.IsHistorical,0)=0');
    expect(statement).toContain("b.Status<>'Cancelled'");
    expect(statement).toContain('dates.DeliveryAt IS NOT NULL');
    expect(statement).toContain('COALESCE(b.DeliveredAt,b.GatePassIssuedAt,pass.IssuedAt)');
    expect(statement).toContain("gp.DocType='BOOKING'");
    expect(statement).toContain('gp.RevokedAt IS NULL');
    expect(statement).toContain('NOT EXISTS (SELECT 1 FROM dms_BookingMasterInvoices');
    expect(statement).toContain('document.BookingID=b.BookingID');
    expect(statement).toContain("document.DocType='MasterInvoice'");
    expect(statement).toContain('document.DeletedAt IS NULL');
    expect(statement).toContain("NULLIF(LTRIM(RTRIM(document.FilePath)),'') IS NOT NULL");
    expect(statement).not.toMatch(/b\.Status\s*=/);
    expect(statement).not.toMatch(/PartyLedger|SalesPayments|FinanceVoucher/);
});
test.each(['36302-1234567-8', '3630212345678', '36302 1234567 8'])('CNIC search accepts formatting and also matches CNIC embedded in a customer name: %s', async search => {
    const { values, query } = database(), res = response();
    await controller.report({ query: { search } }, res);
    expect(values.cnic).toBe('%3630212345678%');
    expect(query.mock.calls[0][0]).toContain("REPLACE(REPLACE(p.PartyName,'-',''),' ','') LIKE @cnic");
    expect(res.body.total).toBe(0);
});
test('name search binds apostrophes and treats SQL wildcard characters literally', async () => {
    const search = "O'Brien_50%[west]~", { query, values } = database(), res = response();
    await controller.report({ query: { search } }, res);
    expect(values.search).toBe("%O'Brien~_50~%~[west~]~~%");
    expect(values.cnic).toBeUndefined();
    expect(query.mock.calls[0][0]).toContain("p.PartyName LIKE @search ESCAPE '~'");
    expect(query.mock.calls[0][0]).not.toContain(search);
});
test('delivery date bounds include both calendar days, even for a one-day period', async () => {
    const { query, values } = database(), res = response();
    await controller.report({ query: { from: '2026-10-23', to: '2026-10-23' } }, res);
    expect(values.from.toISOString()).toBe('2026-10-23T00:00:00.000Z');
    expect(values.to.toISOString()).toBe('2026-10-23T00:00:00.000Z');
    expect(query.mock.calls[0][0]).toContain('CAST(dates.DeliveryAt AS DATE)>=@from');
    expect(query.mock.calls[0][0]).toContain('CAST(dates.DeliveryAt AS DATE)<=@to');
});
test.each([{ from: '2026-02-30' }, { from: '0000-01-01' }, { to: '2026-13-01' },
    { from: '2026-10-24', to: '2026-10-23' }, { search: ['name'] }, { search: 'x'.repeat(151) }])('invalid filters fail before DB access: %j', async query => {
    const res = response(); await controller.report({ query }, res);
    expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});
test('DB errors are surfaced as report errors', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getPool.mockRejectedValue(new Error('Database unavailable'));
    const res = response(); await controller.report({ query: {} }, res);
    expect(res.code).toBe(500); expect(res.body.error).toBe('Database unavailable'); spy.mockRestore();
});
