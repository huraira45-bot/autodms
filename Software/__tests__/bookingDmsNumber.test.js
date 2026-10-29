jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', Date: 'date', MAX: 'max', Decimal: () => 'decimal', NVarChar: () => 'nvarchar',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class { constructor(tx) { this.tx = tx; this.values = {}; } input(k, t, v) { this.values[k] = v; return this; } query(q) { return this.tx.query(q, this.values); } },
} }));
jest.mock('../controllers/salesIncentiveController', () => ({ accrueForBooking: jest.fn() }));
const { getPool } = require('../config/db');
const { parseDmsBookingNumber } = require('../services/bookingDmsNumberService');
const booking = require('../controllers/salesBookingController');
const historical = require('../controllers/salesHistoricalController');
const reports = require('../controllers/salesReportsController');
const incentive = require('../controllers/salesIncentiveController');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const user = { userId: 1, employeeId: 3, userName: 'Sales executive', modules: ['sales_executive'] };
const body = { PartyID: 1, VehicleVariantID: 2, NegotiatedPrice: 1000, DMSBookingNumber: ' 001005/00001234-A ' };
function fixture({ minimum = 0, failAudit = false } = {}) {
    const tx = { calls: [], begin: jest.fn(async () => {}), commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}),
        query: jest.fn(async (q, v) => {
            tx.calls.push({ q, v });
            if (q.includes('AS nextNo')) return { recordset: [{ nextNo: 42 }] };
            if (q.includes('OUTPUT INSERTED.BookingID')) return { recordset: [{ BookingID: 7 }] };
            if (q.includes('OUTPUT INSERTED.RequestID')) return { recordset: [{ RequestID: 9 }] };
            if (failAudit && q.includes('INSERT INTO dms_SalesAuditLog')) throw new Error('Synthetic audit failure');
            return { recordset: [] };
        }) };
    getPool.mockResolvedValue({ tx, request: () => ({ input() { return this; }, async query() { return { recordset: [{ VariantID: 2, ModelID: 1, StandardPrice: 1000, MinimumBookingAmount: minimum }] }; } }) });
    return tx;
}
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
test('external reference preserves leading zeros, separators and case, trimming surrounding whitespace', () => {
    expect(parseDmsBookingNumber(body.DMSBookingNumber)).toBe('001005/00001234-A');
    expect(parseDmsBookingNumber('x'.repeat(100))).toHaveLength(100);
});
test.each([undefined, null, '', '   ', 12345, {}, 'x'.repeat(101), '1005/\n0001', '1005/\u00000001'])('new bookings reject invalid DMS number %p before opening SQL', async value => {
    const res = response(); await booking.createBooking({ user, body: { ...body, DMSBookingNumber: value, IsHistorical: true } }, res);
    expect(res.code).toBe(400); expect(res.body.error).toMatch(/DMS booking number/); expect(getPool).not.toHaveBeenCalled();
});
test.each([{ price: 1000, minimum: 0, state: 'PendingPayment' }, { price: 1000, minimum: 100, state: 'PendingBookingPayment' },
    { price: 900, minimum: 100, state: 'PendingApproval' }])('new booking persists DMS number and retains normal workflow: %j', async ({ price, minimum, state }) => {
    const tx = fixture({ minimum }), res = response();
    await booking.createBooking({ user, body: { ...body, NegotiatedPrice: price, NegotiationReason: 'Approved customer request' } }, res);
    expect(res.code).toBe(201); expect(res.body).toMatchObject({ BookingID: 7, BookingNo: expect.stringMatching(/^BK-\d{4}-0042$/), DMSBookingNumber: '001005/00001234-A', Status: state });
    const insert = tx.calls.find(c => c.q.includes('OUTPUT INSERTED.BookingID')); expect(insert.q).toContain('DMSBookingNumber'); expect(insert.v.dms).toBe('001005/00001234-A');
    const audit = tx.calls.find(c => c.q.includes('DMSBookingNumberRecorded')); expect(JSON.parse(audit.v.next)).toEqual({ DMSBookingNumber: '001005/00001234-A' }); expect(audit.v.uid).toBe(user.userId);
    expect(tx.commit).toHaveBeenCalled(); expect(tx.rollback).not.toHaveBeenCalled();
    expect(incentive.accrueForBooking).toHaveBeenCalledTimes(price < 1000 ? 0 : 1);
});
test('failed DMS audit rolls back booking creation', async () => {
    const tx = fixture({ failAudit: true }), res = response(); await booking.createBooking({ user, body }, res);
    expect(res.code).toBe(500); expect(tx.rollback).toHaveBeenCalled(); expect(tx.commit).not.toHaveBeenCalled(); expect(incentive.accrueForBooking).not.toHaveBeenCalled();
});
test('historical booking creation still works without a DMS number', async () => {
    const tx = fixture(), res = response(); const { DMSBookingNumber, ...legacy } = body;
    await historical.createBooking({ user, body: { ...legacy, Status: 'PendingPayment', BookingDate: '2026-01-01' } }, res);
    expect(res.code).toBe(201); expect(tx.commit).toHaveBeenCalled();
});
test.each([false, true])('DMS reference is returned and searched using bound parameters (cancelled=%s)', async cancelled => {
    const calls = [], values = {}, rows = [{ BookingID: 7, DMSBookingNumber: '001005/00001234-A' }];
    getPool.mockResolvedValue({ request: () => ({ input(k, t, v) { values[k] = v; return this; }, async query(q) { calls.push(q); return { recordset: rows }; } }) });
    const res = response(); await (cancelled ? booking.listCancelledBookings : booking.listBookings)({ query: { search: "001005/'" } }, res);
    expect(res.code).toBe(200); expect(res.body[0].DMSBookingNumber).toBe(rows[0].DMSBookingNumber); expect(calls[0]).toContain('b.DMSBookingNumber LIKE @q'); expect(values.q).toBe("%001005/'%"); expect(calls[0]).not.toContain("001005/'");
});
test.each([false, true])('booking register preserves external numbers and legacy blanks (cancelled=%s)', async cancelled => {
    getPool.mockResolvedValue({ request: () => ({ input() { return this; }, async query() { return { recordset: [{ BookingID: 7, DMSBookingNumber: '001005/00001234-A' }, { BookingID: 8, DMSBookingNumber: null }] }; } }) });
    const res = response(); await (cancelled ? reports.cancelledBookingRegister : reports.bookingRegister)({ query: {} }, res);
    expect(res.code).toBe(200); expect(res.body.rows.map(r => r.DMSBookingNumber)).toEqual(['001005/00001234-A', '']);
});
