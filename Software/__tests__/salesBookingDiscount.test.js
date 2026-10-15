jest.mock('../config/db', () => ({
    getPool: jest.fn(),
    sql: { Int: 'int', MAX: 'max', Decimal: () => 'decimal', NVarChar: () => 'nvarchar',
        Transaction: class { constructor(pool) { return pool.tx; } },
        Request: class {
            constructor(tx) { this.tx = tx; this.values = {}; }
            input(key, type, value) { this.values[key] = value; return this; }
            query(query) { return this.tx.query(query, this.values); }
        },
    },
}));
const { getPool } = require('../config/db');
const { applyBookingDiscount, DISCOUNT_STATES } = require('../services/salesBookingDiscountService');
const { masterAmountDue } = require('../services/salesMasterAmount');
const controller = require('../controllers/salesBookingDiscountController');
const user = { userId: 1, userName: 'Pricing Admin', modules: ['sales_admin_pricing'] };
const input = { bookingId: 7, amount: '100.25', expectedPrice: 1000, reason: 'Agreed customer concession', user };
function transaction(changes = {}) {
    const original = { BookingID: 7, Status: 'Allocated', StandardPrice: 1200, NegotiatedPrice: 1000,
        MasterPriceBeforeDiscount: null, AmountPaidToDate: 500, PremiumAmount: 20, ...changes };
    const tx = { booking: { ...original }, calls: [], pending: [], delivery: [],
        begin: jest.fn(async () => {}), commit: jest.fn(async () => {}),
        rollback: jest.fn(async () => { tx.booking = { ...original }; }),
    };
    tx.query = jest.fn(async (query, values) => {
        tx.calls.push({ query, values });
        if (query.startsWith('SELECT * FROM dms_SalesBookings')) return { recordset: tx.missing ? [] : [{ ...tx.booking }] };
        if (query.includes('FROM dms_NegotiationRequests')) return { recordset: tx.pending };
        if (query.includes('FROM data_FinanceVoucherInfo')) return { recordset: tx.delivery };
        if (query.startsWith('UPDATE dms_SalesBookings')) {
            tx.booking.MasterPriceBeforeDiscount ??= tx.booking.NegotiatedPrice;
            tx.booking.NegotiatedPrice = values.price; return { rowsAffected: [1] };
        }
        if (query.startsWith('INSERT INTO dms_SalesAuditLog')) {
            if (tx.failAudit) throw new Error('Audit insert failed');
            return { rowsAffected: [1] };
        }
        if (query.startsWith('INSERT INTO dms_BookingStateTransitions')) return { rowsAffected: [1] };
        throw new Error('Forbidden unexpected SQL: ' + query);
    });
    return tx;
}
const writes = tx => tx.calls.filter(c => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.query));
describe('Locked booking discount without ledger posting', () => {
    test('reduces only customer price, keeps payments, premium, state and Master fallback, with mandatory audit', async () => {
        const tx = transaction();
        const result = await applyBookingDiscount(tx, input);
        expect(result).toMatchObject({ NegotiatedPrice: 899.75, DiscountAmount: 300.25 });
        expect(tx.booking).toMatchObject({ Status: 'Allocated', AmountPaidToDate: 500, PremiumAmount: 20, MasterPriceBeforeDiscount: 1000 });
        expect(tx.calls[0].query).toContain('UPDLOCK,HOLDLOCK');
        expect(writes(tx)).toHaveLength(3);
        expect(writes(tx).every(c => /^(UPDATE dms_SalesBookings|INSERT INTO dms_SalesAuditLog|INSERT INTO dms_BookingStateTransitions)/.test(c.query))).toBe(true);
        const audit = tx.calls.find(c => c.query.startsWith('INSERT INTO dms_SalesAuditLog'));
        expect(audit.values).toMatchObject({ bid: 7, uid: 1, name: 'Pricing Admin', emp: null, reason: input.reason });
        expect(JSON.parse(audit.values.new)).toMatchObject({ AdditionalDiscount: 100.25, NegotiatedPrice: 899.75 });
    });
    test.each(DISCOUNT_STATES)('works from %s without moving the state', async Status => {
        const tx = transaction({ Status }); await applyBookingDiscount(tx, input); expect(tx.booking.Status).toBe(Status);
    });
    test('stale retry cannot apply the discount twice', async () => {
        const tx = transaction(); await applyBookingDiscount(tx, input);
        await expect(applyBookingDiscount(tx, input)).rejects.toHaveProperty('statusCode', 409);
        expect(tx.booking.NegotiatedPrice).toBe(899.75);
        expect(writes(tx)).toHaveLength(3);
    });
    test('a second reviewed discount preserves the first Master snapshot', async () => {
        const tx = transaction(); await applyBookingDiscount(tx, input);
        await applyBookingDiscount(tx, { ...input, expectedPrice: 899.75, amount: 99.75 });
        expect(tx.booking.NegotiatedPrice).toBe(800); expect(tx.booking.MasterPriceBeforeDiscount).toBe(1000);
    });
    test.each(['Closed', 'Cancelled', 'GatePassIssued', 'Delivered', 'Draft', 'PendingApproval', 'Unknown'])(
        'refuses %s before writes', async Status => {
            const tx = transaction({ Status }); await expect(applyBookingDiscount(tx, input)).rejects.toHaveProperty('statusCode', 409);
            expect(writes(tx)).toHaveLength(0);
        });
    test.each([{ DeliveryVoucherID: 42 }, { DeliveredAt: '2026-01-01' }, { GatePassIssuedAt: '2026-01-01' }, { ClosedAt: '2026-01-01' }])(
        'refuses delivery evidence even with a stale active status: %p', async changes => {
            const tx = transaction(changes); await expect(applyBookingDiscount(tx, input)).rejects.toHaveProperty('statusCode', 409);
            expect(writes(tx)).toHaveLength(0);
        });
    test.each(['pending', 'delivery'])('blocks existing %s document', async field => {
        const tx = transaction(); tx[field] = [{ id: 1 }];
        await expect(applyBookingDiscount(tx, input)).rejects.toHaveProperty('statusCode', 409);
        expect(writes(tx)).toHaveLength(0);
    });
    test.each([0, -1, 1000, 1001, '1.001', null, true, '', Infinity])('rejects invalid discount %p', async amount => {
        const tx = transaction(); await expect(applyBookingDiscount(tx, { ...input, amount })).rejects.toHaveProperty('statusCode', 400);
        expect(writes(tx)).toHaveLength(0);
    });
    test.each([undefined, '', 'abc', 'x'.repeat(501)])('requires a useful reason: %p', async reason => {
        const tx = transaction(); await expect(applyBookingDiscount(tx, { ...input, reason })).rejects.toHaveProperty('statusCode', 400);
        expect(tx.query).not.toHaveBeenCalled();
    });
    test('ordinary sales permission does not authorize discounting', async () => {
        const tx = transaction(); await expect(applyBookingDiscount(tx, { ...input, user: { modules: ['sales_gm', 'sales_executive'] } }))
            .rejects.toHaveProperty('statusCode', 403);
        expect(tx.query).not.toHaveBeenCalled();
    });
    test('a missing booking returns 404', async () => {
        const tx = transaction(); tx.missing = true;
        await expect(applyBookingDiscount(tx, input)).rejects.toHaveProperty('statusCode', 404);
    });
    test('fully paid bookings keep the full recorded payment after discount', async () => {
        const tx = transaction({ AmountPaidToDate: 1000, IsHistorical: true }); await applyBookingDiscount(tx, input);
        expect(tx.booking.AmountPaidToDate).toBe(1000); expect(tx.booking.NegotiatedPrice).toBe(899.75);
    });
    test('audit failure rolls back the price change through the controller', async () => {
        const tx = transaction(); tx.failAudit = true; getPool.mockResolvedValue({ tx });
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await controller.apply({ params: { id: '7' }, body: { DiscountAmount: 100.25, ExpectedNegotiatedPrice: 1000, Reason: input.reason }, user }, res);
        expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledTimes(1);
        expect(tx.booking.NegotiatedPrice).toBe(1000); expect(tx.booking.MasterPriceBeforeDiscount).toBeNull();
    });
    test.each([
        [{ WholesalePrice: 1200, MasterPriceBeforeDiscount: 1000, NegotiatedPrice: 800 }, 1200],
        [{ WholesalePrice: 0, MasterPriceBeforeDiscount: 1000, NegotiatedPrice: 800 }, 1000],
        [{ WholesalePrice: null, NegotiatedPrice: 800 }, 800],
    ])('Master amount stays independent of customer discount: %p', (booking, expected) => {
        expect(masterAmountDue(booking)).toBe(expected);
    });
});
