jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: { Int: 'int' } }));
jest.mock('../controllers/systemAccountsController', () => ({ resolveRole: jest.fn().mockResolvedValue(999) }));
const { getPool } = require('../config/db');
const { bookingAccountReconciliation } = require('../controllers/salesReportsController');
const { historicalPayOrderSql } = require('../services/masterPaymentPositionService');
const { bookingAccountReconciliationQuery } = require('../services/bookingPaymentReportQuery');

beforeEach(() => jest.clearAllMocks());

test('batched reconciliation preserves gross debit/credit totals and the independent GL comparison', async () => {
    const query = jest.fn()
        .mockResolvedValueOnce({ recordset: [
            { BookingID: 1, PaidToMaster: 120, SettledAtDelivery: 20 },
            { BookingID: 2, PaidToMaster: 50, SettledAtDelivery: 50 },
        ] })
        .mockResolvedValueOnce({ recordset: [{ Balance: 110 }] });
    getPool.mockResolvedValue({ request: () => ({ input() { return this; }, query }) });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await bookingAccountReconciliation({}, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sumOfBookings: 100, glBalance: 110, difference: 10, reconciled: false }));
    expect(res.json.mock.calls[0][0].rows).toEqual([
        expect.objectContaining({ PaidToMaster: 120, SettledAtDelivery: 20, Outstanding: 100 }),
        expect.objectContaining({ PaidToMaster: 50, SettledAtDelivery: 50, Outstanding: 0 }),
    ]);
    expect(query.mock.calls[0][0]).toContain('INTO #BookingReconciliationOrders');
    expect(query.mock.calls[1][0]).toContain("v.Status IN ('Posted','Reversed')");
});

test('reconciliation batches historical capacity once and retains delivery and reversal entries', () => {
    const query = bookingAccountReconciliationQuery();
    expect(query.match(/AS Requested/g)).toHaveLength(1);
    expect(query).toContain("b.Status NOT IN ('Closed','Cancelled','CancellationApproved')");
    expect(query).toContain('SUM(Debit) AS PaidToMaster,SUM(Credit) AS SettledAtDelivery');
    expect(query).not.toContain("AND ISNULL(v.SourceDocType,'')<>'SALES_DELIVERY'");
    expect(query).not.toContain('SUM(mp.Dr)');
});

test('shared pay-order matching counts candidates across direct/separate branches before eligibility and capacity', () => {
    const query = historicalPayOrderSql('@gl');
    expect(query).toContain('COUNT(*) OVER (PARTITION BY matched.PaymentID) AS AccountCount');
    expect(query.indexOf('AS AccountCount')).toBeLessThan(query.indexOf('WHERE master.AccountCount=1'));
    expect(query).toContain('master.VoucherID=p.VoucherID');
    expect(query).toContain('master.GLCAID=p.HistoricalMasterGLCAID AND master.VoucherDate<=p.VoucherDate');
    expect(query).not.toContain('CROSS APPLY');
    expect(query).toContain('candidate.Requested<=candidate.Available');
});
