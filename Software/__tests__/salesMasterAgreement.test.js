jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', MAX: 'max', NVarChar: () => 'nvarchar', Decimal: () => 'decimal',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class {
        constructor(tx) { this.tx = tx; this.values = {}; }
        input(key, type, value) { this.values[key] = value; return this; }
        query(query) { return this.tx.query(query, this.values); }
    },
} }));
const { getPool } = require('../config/db');
const { setMasterAgreedAmount } = require('../services/salesMasterAgreementService');
const { masterAmountDue } = require('../services/salesMasterAmount');
const controller = require('../controllers/salesBookingDiscountController');
const input = { bookingId: 6, amount: 3380000, expectedAmount: 3430700, reason: 'Master confirmed commercial vehicle settlement',
    user: { userId: 1, userName: 'Pricing Admin', modules: ['sales_admin_pricing'] } };
function transaction(changes = {}) {
    const original = { BookingID: 6, Status: 'Allocated', StandardPrice: 3430700, WholesalePrice: 3430700,
        NegotiatedPrice: 3380000, MasterPriceBeforeDiscount: 3430700, AmountPaidToDate: 3380000, PremiumAmount: 0,
        MasterAgreedAmount: null, ...changes };
    const tx = { booking: { ...original }, calls: [], delivery: [],
        begin: jest.fn(async () => {}), commit: jest.fn(async () => {}),
        rollback: jest.fn(async () => { tx.booking = { ...original }; }),
    };
    tx.query = jest.fn(async (query, values) => {
        tx.calls.push({ query, values });
        if (query.includes('SELECT b.*,v.WholesalePrice')) return { recordset: tx.missing ? [] : [{ ...tx.booking }] };
        if (query.includes('FROM data_FinanceVoucherInfo')) return { recordset: tx.delivery };
        if (query.startsWith('UPDATE dms_SalesBookings')) { tx.booking.MasterAgreedAmount = values.amount; return { rowsAffected: [1] }; }
        if (query.startsWith('INSERT INTO dms_SalesAuditLog') || query.startsWith('INSERT INTO dms_BookingStateTransitions')) {
            if (tx.failAudit) throw new Error('Audit failed'); return { rowsAffected: [1] };
        }
        throw new Error('Forbidden SQL: ' + query);
    });
    return tx;
}
const writes = tx => tx.calls.filter(c => /^\s*(UPDATE|INSERT|DELETE)/i.test(c.query));
describe('Explicit booking Master agreement without ledger posting', () => {
    test('BK-2026-0006 accepts 3,380,000 with zero Master shortfall and no second customer discount', async () => {
        const tx = transaction(); await setMasterAgreedAmount(tx, input);
        expect(masterAmountDue(tx.booking)).toBe(3380000);
        expect(masterAmountDue(tx.booking) - 3380000).toBe(0);
        expect(tx.booking).toMatchObject({ NegotiatedPrice: 3380000, AmountPaidToDate: 3380000, WholesalePrice: 3430700, MasterPriceBeforeDiscount: 3430700, Status: 'Allocated' });
        expect(tx.calls[0].query).toContain('UPDLOCK,HOLDLOCK');
        expect(writes(tx)).toHaveLength(3);
        expect(writes(tx).every(c => /^(UPDATE dms_SalesBookings|INSERT INTO dms_SalesAuditLog|INSERT INTO dms_BookingStateTransitions)/.test(c.query))).toBe(true);
        const audit = tx.calls.find(c => c.query.startsWith('INSERT INTO dms_SalesAuditLog'));
        expect(JSON.parse(audit.values.old).MasterAmountDue).toBe(3430700);
        expect(JSON.parse(audit.values.new).MasterAmountDue).toBe(3380000);
        expect(audit.values).toMatchObject({ uid: 1, reason: input.reason });
    });
    test('a customer discount alone still leaves the catalog Master amount unchanged', () => {
        expect(masterAmountDue(transaction().booking)).toBe(3430700);
    });
    test('agreements are specific to the booking, including variants with no rate', async () => {
        const tx = transaction({ WholesalePrice: 0 }); await setMasterAgreedAmount(tx, input);
        expect(masterAmountDue(tx.booking)).toBe(3380000); expect(masterAmountDue(transaction().booking)).toBe(3430700);
    });
    test('stale retries cannot duplicate the agreement audit', async () => {
        const tx = transaction(); await setMasterAgreedAmount(tx, input);
        await expect(setMasterAgreedAmount(tx, input)).rejects.toHaveProperty('statusCode', 409);
        expect(writes(tx)).toHaveLength(3);
    });
    test.each([0, -1, 3430701, '3380000.001', NaN, null, true])('rejects invalid / excessive amount %p', async amount => {
        const tx = transaction(); await expect(setMasterAgreedAmount(tx, { ...input, amount })).rejects.toHaveProperty('statusCode', 400);
        expect(writes(tx)).toHaveLength(0);
    });
    test.each(['Closed', 'GatePassIssued', 'Delivered', 'Cancelled', 'PendingApproval'])('refuses %s', async Status => {
        const tx = transaction({ Status }); await expect(setMasterAgreedAmount(tx, input)).rejects.toHaveProperty('statusCode', 409);
        expect(writes(tx)).toHaveLength(0);
    });
    test.each([{ DeliveryVoucherID: 10 }, { GatePassIssuedAt: '2026-10-15' }, { DeliveredAt: '2026-10-15' }])('rejects delivery evidence %p', async changes => {
        const tx = transaction(changes); await expect(setMasterAgreedAmount(tx, input)).rejects.toHaveProperty('statusCode', 409);
        expect(writes(tx)).toHaveLength(0);
    });
    test('rejects an existing delivery journal', async () => {
        const tx = transaction(); tx.delivery = [{ VoucherID: 10 }];
        await expect(setMasterAgreedAmount(tx, input)).rejects.toHaveProperty('statusCode', 409); expect(writes(tx)).toHaveLength(0);
    });
    test('requires Pricing Admin and a confirmation reason', async () => {
        const tx = transaction();
        await expect(setMasterAgreedAmount(tx, { ...input, user: { modules: ['sales_gm'] } })).rejects.toHaveProperty('statusCode', 403);
        await expect(setMasterAgreedAmount(tx, { ...input, reason: '' })).rejects.toHaveProperty('statusCode', 400);
        expect(tx.query).not.toHaveBeenCalled();
    });
    test('audit failure rolls back the Master amount', async () => {
        const tx = transaction(); tx.failAudit = true; getPool.mockResolvedValue({ tx });
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await controller.setMasterAmount({ params: { id: '6' }, body: { Amount: input.amount, ExpectedMasterAmount: input.expectedAmount, Reason: input.reason }, user: input.user }, res);
        expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledTimes(1);
        expect(tx.booking.MasterAgreedAmount).toBeNull();
    });
});
