jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', Date: 'date', MAX: 'max', NVarChar: () => 'nvarchar',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class { constructor(tx) { this.tx = tx; this.values = {}; } input(k, t, v) { this.values[k] = v; return this; } query(q) { return this.tx.query(q, this.values); } },
} }));
const { getPool } = require('../config/db');
const { parseBookingDate, dayKey, setBookingDate } = require('../services/bookingDateService');
const controller = require('../controllers/bookingDateController');
const historical = require('../controllers/salesHistoricalController');
const router = require('../routes/salesRoutes');
const user = { groupId: 1, userId: 5, userName: 'Sales admin', employeeId: 3, modules: [], permissions: ['sales_booking_date'], groupTitle: 'Admin' };
const input = { bookingId: 7, date: '2026-10-27', expectedDate: null, reason: 'Correct the date of the deal', user, now: new Date('2026-10-27T21:00:00Z') };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
function fixture(options = {}) {
    const original = { BookingID: 7, Status: 'PendingPayment', BookingDate: null, CreatedAt: new Date('2026-10-26T23:30:00Z'), ...options.booking };
    const tx = { booking: { ...original }, calls: [], begin: jest.fn(async () => {}), commit: jest.fn(async () => {}), rollback: jest.fn(async () => { tx.booking = { ...original }; }),
        query: jest.fn(async (q, v) => {
            tx.calls.push({ q, v });
            if (q.includes('SELECT BookingID,Status,BookingDate,CreatedAt')) return { recordset: options.missing ? [] : [{ ...tx.booking }] };
            if (q.includes('UPDATE dms_SalesBookings SET BookingDate')) tx.booking.BookingDate = v.date;
            if (options.failAt && q.includes(options.failAt)) throw new Error('Synthetic write failure');
            return { recordset: [], rowsAffected: [1] };
        }) };
    getPool.mockResolvedValue({ tx }); return tx;
}
beforeEach(() => jest.clearAllMocks());
test('calendar date parsing preserves the selected day and rejects invalid formats/ranges', () => {
    expect(dayKey(parseBookingDate('2024-02-29'))).toBe('2024-02-29');
    for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-28T00:00Z', '1752-12-31', '0000-01-01', null, 123])
        expect(() => parseBookingDate(value)).toThrow();
});
test.each(['PendingPayment', 'Closed', 'Delivered', 'Cancelled'])('regular/historical correction works in %s without changing entry time or status', async status => {
    const tx = fixture({ booking: { Status: status } }); const result = await setBookingDate(tx, input);
    expect(result).toEqual({ changed: true, BookingDate: '2026-10-27' }); expect(tx.booking.CreatedAt.toISOString()).toBe('2026-10-26T23:30:00.000Z'); expect(tx.booking.Status).toBe(status);
    const update = tx.calls.find(c => c.q.includes('UPDATE dms_SalesBookings')); expect(update.q).not.toMatch(/CreatedAt\s*=|HistoricalEnteredAt\s*=|AmountPaid|Price|PartyID\s*=/);
    expect(tx.calls[0].q).toContain('UPDLOCK,HOLDLOCK');
    const audit = tx.calls.find(c => c.q.includes('INSERT INTO dms_SalesAuditLog'));
    expect(JSON.parse(audit.v.old)).toEqual({ BookingDate: null, EffectiveBookingDate: '2026-10-26' }); expect(audit.v.uid).toBe(5); expect(audit.v.reason).toBe(input.reason);
    expect(tx.calls.find(c => c.q.includes('INSERT INTO dms_BookingStateTransitions')).v.state).toBe(status);
    expect(tx.calls.some(c => /FinanceVoucher|PartyLedger|SalesPayments|IncentiveAccrual/.test(c.q))).toBe(false);
});
test('future validation uses the Pakistan calendar day at midnight', async () => {
    const tx = fixture(); await expect(setBookingDate(tx, { ...input, date: '2026-10-28' })).resolves.toMatchObject({ changed: true });
    await expect(setBookingDate(tx, { ...input, date: '2026-10-29' })).rejects.toMatchObject({ status: 400 });
});
test('saving an unchanged explicit date creates no audit entry', async () => {
    const tx = fixture({ booking: { BookingDate: parseBookingDate(input.date) } });
    expect(await setBookingDate(tx, { ...input, expectedDate: input.date })).toEqual({ changed: false, BookingDate: input.date }); expect(tx.calls).toHaveLength(1);
});
test('stale expected dates reject before any writes', async () => {
    const tx = fixture({ booking: { BookingDate: parseBookingDate('2026-10-25') } });
    await expect(setBookingDate(tx, input)).rejects.toMatchObject({ status: 409 }); expect(tx.calls).toHaveLength(1);
});
test.each([{ groupId: 1, userId: 1, userName: 'Admin', modules: [], permissions: ['sales_booking_date'] }])('Admin with explicit date right can correct dates: %j', async actor => {
    await expect(setBookingDate(fixture(), { ...input, user: actor })).resolves.toMatchObject({ changed: true });
});
test.each(['sales_executive', 'sales_agm', 'sales_reports', 'finance_vouchers', 'sales_gm', 'sales_admin_settings', 'sales_booking_date'])('%s does not gain Admin-only date-edit permission', async role => {
    const tx = fixture(); await expect(setBookingDate(tx, { ...input, user: { ...user, groupId: 2, modules: [role] } })).rejects.toMatchObject({ status: 403 }); expect(tx.calls).toHaveLength(0);
});
test('revoking the date right also denies the main Admin', async () => {
    const tx = fixture(); await expect(setBookingDate(tx, { ...input, user: { ...user, permissions: [] } })).rejects.toMatchObject({ status: 403 }); expect(tx.calls).toHaveLength(0);
});
test.each([{ reason: 'x' }, { expectedDate: undefined }, { bookingId: -7 }, { date: '2026-02-30' }])('bad input is rejected: %j', async change => {
    const tx = fixture(); await expect(setBookingDate(tx, { ...input, ...change })).rejects.toMatchObject({ status: 400 }); expect(tx.calls).toHaveLength(0);
});
test('missing booking is 404', async () => { await expect(setBookingDate(fixture({ missing: true }), input)).rejects.toMatchObject({ status: 404 }); });
test.each(['INSERT INTO dms_SalesAuditLog', 'INSERT INTO dms_BookingStateTransitions'])('failed %s rolls back the date', async failAt => {
    const tx = fixture({ failAt }), res = response();
    await controller.update({ params: { id: 7 }, user, body: { BookingDate: input.date, ExpectedDate: null, Reason: input.reason } }, res);
    expect(res.code).toBe(500); expect(tx.rollback).toHaveBeenCalled(); expect(tx.commit).not.toHaveBeenCalled(); expect(tx.booking.BookingDate).toBeNull();
});
test('older forms require refreshing; historical alias uses the same safe implementation', async () => {
    const res = response(); await controller.update({ body: { BookingDate: input.date } }, res); expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
    expect(historical.setBookingDate).toBe(controller.update);
});
test('both date routes require main Admin plus the explicit date right', () => {
    for (const path of ['/bookings/:id/date', '/historical/bookings/:id/date']) {
        const guard = router.stack.find(l => l.route?.path === path).route.stack[0].handle;
        const next = jest.fn(); guard({ user }, response(), next); expect(next).toHaveBeenCalledTimes(1);
        for (const actor of [{ groupId: 1, permissions: [] }, { groupId: 2, permissions: ['sales_booking_date', 'sales_gm'] }]) {
            const res = response(); guard({ user: actor }, res, jest.fn()); expect(res.code).toBe(403);
        }
    }
});
test('Admin Rights exposes the dedicated admin-only checkbox and rejects granting it to another role', async () => {
    const registry = require('../config/permissions'), permissions = require('../controllers/permissionController');
    expect(registry.SECTIONS.flatMap(section => section.items).find(item => item.key === 'sales_booking_date')).toMatchObject({ kind: 'workflow', adminOnly: true });
    expect(registry.expandAllPermissionKeys()).toContain('sales_booking_date');
    const res = response(); await permissions.setRolePermissions({ params: { groupId: '2' }, body: { permissions: ['sales_booking_date'] } }, res);
    expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});
