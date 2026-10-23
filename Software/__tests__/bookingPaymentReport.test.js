jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: { Int: 'int', Date: 'date', NVarChar: () => 'nvarchar' } }));
jest.mock('../controllers/systemAccountsController', () => ({ resolveRole: jest.fn() }));
const { getPool } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const controller = require('../controllers/bookingPaymentReportController');
const { masterPositionSql } = require('../services/masterPaymentPositionService');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const base = { BookingID: 1, BookingNo: 'BK-1', BookingDate: new Date('2026-10-01T00:00Z'), Status: 'Allocated',
    IsHistorical: false, NegotiatedPrice: 100, AmountPaidToDate: 100, WholesalePrice: 100, MasterLedgerRemitted: 100 };
function database(rows, recordsets) {
    const values = {}, query = jest.fn(async () => ({ recordset: rows, recordsets }));
    getPool.mockResolvedValue({ request: () => ({ input(key, type, value) { values[key] = value; return this; }, query }) });
    return { query, values };
}
async function report(rows, filters = {}) {
    const db = database(rows), res = response();
    await controller.report({ query: filters }, res);
    expect(res.code).toBe(200);
    return { ...db, ...res.body };
}
beforeEach(() => { jest.clearAllMocks(); resolveRole.mockResolvedValue(999); });

test.each([
    [100, 100, 'complete', 0, 0], [100, 40, 'partial', 60, 0], [100, 0, 'unpaid', 100, 0],
    [100, 120, 'complete', 0, 20], [100, -20, 'unpaid', 120, 0], [0, 0, 'unpriced', 0, 0],
    [100, 99.99, 'partial', 0.01, 0], [100.01, 100.01, 'complete', 0, 0],
])('customer due %s / received %s correctly distinguishes full, partial, unpaid and excess', async (price, paid, status, remaining, overpaid) => {
    const { rows } = await report([{ ...base, NegotiatedPrice: price, AmountPaidToDate: paid }]);
    expect(rows[0]).toMatchObject({ VehiclePrice: price, VehiclePaid: paid, CustomerPaymentStatus: status, CustomerRemaining: remaining, CustomerOverpaid: overpaid });
});

test('customer and Master filters combine independently with AND, including remaining balances', async () => {
    const fixtures = [base, { ...base, BookingID: 2, MasterLedgerRemitted: 30 },
        { ...base, BookingID: 3, AmountPaidToDate: 20, MasterLedgerRemitted: 0 }, { ...base, BookingID: 4, MasterLedgerRemitted: 0 }];
    expect((await report(fixtures, { customerPayment: 'complete', masterPayment: 'partial' })).rows.map(r => r.BookingID)).toEqual([2]);
    expect((await report(fixtures, { customerPayment: 'complete', masterPayment: 'remaining' })).rows.map(r => r.BookingID)).toEqual([2, 4]);
    expect((await report(fixtures, { customerPayment: 'partial', masterPayment: 'unpaid' })).rows.map(r => r.BookingID)).toEqual([3]);
    expect((await report(fixtures, { masterPayment: 'complete' })).rows.map(r => r.BookingID)).toEqual([1]);
});

test('discounted customer price does not reduce Master due without an accepted Master agreement', async () => {
    const { rows } = await report([{ ...base, NegotiatedPrice: 80, AmountPaidToDate: 80, MasterLedgerRemitted: 80 },
        { ...base, BookingID: 2, NegotiatedPrice: 80, AmountPaidToDate: 80, MasterLedgerRemitted: 80, MasterAgreedAmount: 80 }]);
    expect(rows[0]).toMatchObject({ CustomerPaymentStatus: 'complete', MasterDue: 100, MasterRemaining: 20, MasterPaymentStatus: 'partial' });
    expect(rows[1]).toMatchObject({ MasterDue: 80, MasterRemaining: 0, MasterPaymentStatus: 'complete' });
});

test.each([
    [{ IsHistorical: true, HistoricalMasterApprovedAmount: 100, MasterLedgerRemitted: 40 }, 100, true],
    [{ IsHistorical: true, HistoricalMasterApprovedAmount: 60, MasterLedgerRemitted: 100 }, 100, false],
    [{ IsHistorical: false, HistoricalMasterApprovedAmount: 100, MasterLedgerRemitted: 40 }, 40, false],
])('historical approval counts once, using the greater of approval and remittance', async (fields, paid, used) => {
    const { rows } = await report([{ ...base, ...fields }]);
    expect(rows[0]).toMatchObject({ MasterPaid: paid, MasterApprovalUsed: used, MasterLedgerRemitted: fields.MasterLedgerRemitted });
});

test('all primary filters are bound, and closed bookings remain included while cancelled ones are excluded', async () => {
    const { query, values, rows } = await report([{ ...base, Status: 'Closed' }], {
        modelId: '5', variantId: '7', salespersonId: '9', from: '2026-10-01', to: '2026-10-24', search: "O'Brien",
    });
    expect(values).toMatchObject({ gl: 999, modelId: 5, variantId: 7, salespersonId: 9, search: "%O'Brien%" });
    expect(values.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    const statement = query.mock.calls[0][0];
    expect(statement).toContain('b.VehicleModelID=@modelId'); expect(statement).toContain('b.VehicleVariantID=@variantId');
    expect(statement).toContain('b.CreatedBy_SalesExecutiveID=@salespersonId');
    expect(statement).toContain("b.Status<>'Cancelled'"); expect(statement).not.toContain("'Closed'");
    expect(statement).toContain('CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)<=@to');
    expect(statement).not.toContain("O'Brien"); expect(rows[0].Status).toBe('Closed');
});

test('remittance query preserves reversals and direct pay orders but excludes delivery settlement and its reversal', () => {
    const regular = masterPositionSql('b.BookingID', '@gl');
    const remitted = masterPositionSql('b.BookingID', '@gl', { excludeDelivery: true });
    expect(regular).not.toContain("AND ISNULL(v.SourceDocType,'')<>'SALES_DELIVERY'");
    expect(remitted).toContain("AND ISNULL(v.SourceDocType,'')<>'SALES_DELIVERY'");
    expect(remitted).toContain("ISNULL(original.SourceDocType,'')<>'SALES_DELIVERY'");
    expect(remitted).toContain("v.Status IN ('Posted','Reversed')");
    expect(remitted).toContain("p.PaymentMode='PayOrder'");
    expect(remitted).toContain('dms_HistoricalMasterAllocations');
});

test('totals use only matching rows and keep overpayments separate from balances owed on other bookings', async () => {
    const fixtures = [{ ...base, AmountPaidToDate: 120 }, { ...base, BookingID: 2, AmountPaidToDate: 40, MasterLedgerRemitted: 20 }];
    const { totals } = await report(fixtures);
    expect(totals).toMatchObject({ count: 2, VehiclePrice: 200, VehiclePaid: 160, CustomerRemaining: 60, CustomerOverpaid: 20, MasterDue: 200, MasterPaid: 120, MasterRemaining: 80 });
    expect((await report(fixtures, { customerPayment: 'partial' })).totals).toMatchObject({ count: 1, VehiclePrice: 100, VehiclePaid: 40 });
});

test.each([
    { from: '2026-02-30' }, { from: '24/10/2026' }, { from: '2026-10-24', to: '2026-10-01' },
    { modelId: '0' }, { variantId: '1;DROP' }, { salespersonId: '-1' }, { modelId: ['1'] }, { variantId: '2147483648' },
    { customerPayment: 'yes' }, { masterPayment: 'Complete' }, { customerPayment: ['complete'] },
])('invalid filters return 400 before querying: %j', async query => {
    const res = response(); await controller.report({ query }, res);
    expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});

test('missing Master account configuration is surfaced instead of reporting every Master payment as zero', async () => {
    database([]); resolveRole.mockRejectedValue(Object.assign(new Error('Configure Master account'), { code: 'SYSTEM_ACCOUNT_NOT_CONFIGURED' }));
    const res = response(); await controller.report({ query: {} }, res);
    expect(res.code).toBe(409); expect(res.body.error).toBe('Configure Master account');
});

test('lookup options include booked legacy entries without depending on sales-management permissions', async () => {
    const lists = [[{ ModelID: 4, ModelName: 'Old model' }], [{ VariantID: 8, ModelID: 4 }], [{ SalespersonID: 3 }]];
    const { query } = database([], lists), res = response(); await controller.options({}, res);
    expect(res.body).toEqual({ models: lists[0], variants: lists[1], salespeople: lists[2] });
    expect(query.mock.calls[0][0]).not.toContain('IsActive'); expect(query.mock.calls[0][0]).toContain("b.Status<>'Cancelled'");
});
