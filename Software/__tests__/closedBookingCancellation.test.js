jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', MAX: 'max', NVarChar: () => 'nvarchar',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class { constructor(tx) { this.tx = tx; this.values = {}; } input(k, t, v) { this.values[k] = v; return this; } query(q) { return this.tx.query(q, this.values); } },
} }));
const { getPool } = require('../config/db');
jest.mock('../services/masterBookingIncentiveService', () => ({ reverseOnCancellation: jest.fn() }));
const { cancelClosedBooking } = require('../services/closedBookingCancellationService');
const controller = require('../controllers/closedBookingCancellationController');
const router = require('../routes/salesRoutes');
const admin = { groupId: 1, userId: 1, userName: 'Administrator', groupTitle: 'Administrator', modules: [], permissions: [] };
const input = { bookingId: 7, reason: 'Duplicate closed booking entered', user: admin };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
function fixture(options = {}) {
    const original = { BookingID: 7, Status: 'Closed', CancelledAt: null, CancellationReason: null, ...options.booking };
    const tx = { booking: { ...original }, calls: [], begin: jest.fn(async () => {}), commit: jest.fn(async () => {}),
        rollback: jest.fn(async () => { tx.booking = { ...original }; }),
        query: jest.fn(async (q, v) => {
            tx.calls.push({ q, v });
            if (options.failAt && q.includes(options.failAt)) throw new Error('Synthetic audit failure');
            if (q.includes('SELECT BookingID,Status,CancelledAt')) return { recordset: options.missing ? [] : [{ ...tx.booking }] };
            if (q.includes('UPDATE dms_SalesBookings')) {
                if (options.staleUpdate) return { recordset: [] };
                tx.booking = { ...tx.booking, Status: 'Cancelled', CancelledAt: new Date('2026-10-29T08:00:00Z'), CancellationReason: v.reason };
                return { recordset: [{ CancelledAt: tx.booking.CancelledAt }] };
            }
            return { recordset: [] };
        }) };
    getPool.mockResolvedValue({ tx }); return tx;
}
beforeEach(() => jest.clearAllMocks());
test.each([false, true])('Admin cancels a closed booking (historical=%s), retaining financial and delivery references', async IsHistorical => {
    const retained = { IsHistorical, AllocatedVehicleID: 12, GatePassIssuedAt: '2026-10-01', DeliveredAt: '2026-10-01', ClosedAt: '2026-10-02',
        AmountPaidToDate: 1000, AmountPaidToMaster: 1000, NegotiatedPrice: 1000, DeliveryVoucherID: 23, MasterInvoiceVoucherID: 24 };
    const tx = fixture({ booking: retained });
    expect(await cancelClosedBooking(tx, input)).toMatchObject({ Status: 'Cancelled' });
    expect(tx.booking).toMatchObject(retained); expect(tx.calls[0].q).toContain('UPDLOCK,HOLDLOCK');
    expect(tx.calls).toHaveLength(4);
    const audit = tx.calls.find(c => c.q.includes('INSERT INTO dms_SalesAuditLog'));
    expect(audit.v).toMatchObject({ id: 7, uid: 1, name: admin.userName, reason: input.reason });
    expect(JSON.parse(audit.v.old).Status).toBe('Closed'); expect(JSON.parse(audit.v.next)).toMatchObject({ Status: 'Cancelled', CancellationReason: input.reason });
    expect(tx.calls.some(c => /UPDATE dms_Vehicle|DELETE|INSERT INTO dms_SalesBookingCancellations|UPDATE dms_SalesIncentive|FinanceVoucher|PartyLedger/.test(c.q))).toBe(false);
});
test.each([undefined, 2, 3, '1'])('non-main-Admin group %p is denied even with every sales role', async groupId => {
    const tx = fixture();
    await expect(cancelClosedBooking(tx, { ...input, user: { ...admin, groupId, modules: ['sales_admin_settings', 'admin_unfinalize', 'sales_gm', 'sales_admin_pricing'] } })).rejects.toMatchObject({ status: 403 });
    expect(tx.calls).toHaveLength(0);
});
test('authenticated Admin identity is required for attribution', async () => {
    await expect(cancelClosedBooking(fixture(), { ...input, user: { groupId: 1 } })).rejects.toMatchObject({ status: 401 });
});
test.each(['Cancelled', 'Delivered', 'GatePassIssued', 'PendingPayment', 'PendingCancelApproval', 'CancellationApproved'])('refuses stale or non-Closed status %s', async Status => {
    const tx = fixture({ booking: { Status } }); await expect(cancelClosedBooking(tx, input)).rejects.toMatchObject({ status: 409 }); expect(tx.calls).toHaveLength(1);
});
test.each([{ bookingId: 0 }, { bookingId: 7.5 }, { bookingId: 2147483648 }, { reason: 'abc' }, { reason: 12345 }, { reason: 'a'.repeat(501) }])('rejects invalid input before SQL: %j', async change => {
    const tx = fixture(); await expect(cancelClosedBooking(tx, { ...input, ...change })).rejects.toMatchObject({ status: 400 }); expect(tx.calls).toHaveLength(0);
});
test('missing booking is 404; a failed guarded update is 409 and has no audit', async () => {
    await expect(cancelClosedBooking(fixture({ missing: true }), input)).rejects.toMatchObject({ status: 404 });
    const tx = fixture({ staleUpdate: true }); await expect(cancelClosedBooking(tx, input)).rejects.toMatchObject({ status: 409 }); expect(tx.calls).toHaveLength(2);
});
test.each(['INSERT INTO dms_SalesAuditLog', 'INSERT INTO dms_BookingStateTransitions'])('failure in %s rolls back the cancellation', async failAt => {
    const tx = fixture({ failAt }), res = response();
    await controller.cancel({ params: { id: 7 }, body: { Reason: input.reason }, user: admin }, res);
    expect(res.code).toBe(500); expect(tx.rollback).toHaveBeenCalled(); expect(tx.commit).not.toHaveBeenCalled(); expect(tx.booking.Status).toBe('Closed');
});
test('saved cancellation cannot be repeated or create duplicate history', async () => {
    const tx = fixture(); await cancelClosedBooking(tx, input);
    await expect(cancelClosedBooking(tx, input)).rejects.toMatchObject({ status: 409 });
    expect(tx.calls.filter(c => c.q.includes('INSERT INTO dms_SalesAuditLog'))).toHaveLength(1);
});
test('controller commits successful cancellations and rejects non-Admin without opening the database', async () => {
    const denied = response(); await controller.cancel({ user: { ...admin, groupId: 2 } }, denied); expect(denied.code).toBe(403); expect(getPool).not.toHaveBeenCalled();
    const tx = fixture(), res = response(); await controller.cancel({ params: { id: '7' }, body: { Reason: input.reason }, user: admin }, res);
    expect(res.code).toBe(200); expect(tx.commit).toHaveBeenCalledTimes(1); expect(tx.rollback).not.toHaveBeenCalled();
});
test('route grants the main Admin access without a sales module and rejects other roles', () => {
    const guard = router.stack.find(l => l.route?.path === '/bookings/:id/cancel-closed').route.stack[0].handle;
    const next = jest.fn(); guard({ user: admin }, response(), next); expect(next).toHaveBeenCalledTimes(1);
    const denied = response(); guard({ user: { ...admin, groupId: 2, modules: ['sales_admin_settings'] } }, denied, jest.fn()); expect(denied.code).toBe(403);
});
