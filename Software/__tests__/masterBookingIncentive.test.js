jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', Date: 'date', MAX: 'max', Decimal: () => 'decimal', NVarChar: () => 'nvarchar',
    Request: class { constructor(tx) { this.tx = tx; this.values = {}; } input(k, t, v) { this.values[k] = v; return this; } query(q) { return this.tx.query(q, this.values); } },
} }));
jest.mock('../utils/voucherNumbering', () => ({ nextVoucherNo: jest.fn(async () => 'JV-TEST-1') }));
jest.mock('../services/voucherReversalService', () => ({ postReversalVoucher: jest.fn(async () => ({ reversalId: 99 })) }));
const { getPool } = require('../config/db');
const { createRate, validateRate } = require('../services/masterIncentiveRateService');
const { accrueAtBooking, reverseOnCancellation } = require('../services/masterBookingIncentiveService');
const aging = require('../controllers/masterIncentiveAgingController');
const { postReversalVoucher } = require('../services/voucherReversalService');
const admin = { userId: 1, userName: 'Admin', groupId: 1 };
const policy = { VariantID: 2, EffectiveFrom: '2026-10-01', EffectiveTo: '2026-10-31', AmountPerBooking: '250.00' };
const b = { BookingID: 7, BookingNo: 'BK-2026-0007', DMSBookingNumber: 'DMS-7', VehicleVariantID: 2, IsHistorical: false, Status: 'PendingApproval', MasterIncentiveRateID: null, RateDate: '2026-10-29' };
const rate = { RateID: 3, VariantID: 2, EffectiveFrom: '2026-10-01', EffectiveTo: '2026-10-31', AmountPerBooking: 250 };
const accounts = [{ RoleKey: 'MASTER_INCENTIVE_RECEIVABLE', GLCAID: 10 }, { RoleKey: 'MASTER_INCENTIVE_INCOME', GLCAID: 11 }];
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
function tx(options = {}) {
    const t = { calls: [], query: jest.fn(async (q, v) => {
        t.calls.push({ q, v });
        if (options.failAt && q.includes(options.failAt)) throw new Error('Synthetic audit failure');
        if (q.includes('SELECT BookingID,BookingNo,DMSBookingNumber')) return { recordset: [{ ...b, ...options.booking }] };
        if (q.includes('SELECT VariantID FROM')) return { recordset: [{ VariantID: 2 }] };
        if (q.includes('SELECT TOP(1) RateID')) return { recordset: options.overlap ? [rate] : [] };
        if (q.includes('SELECT RateID,VariantID')) return { recordset: options.rates || [{ ...rate, ...options.rate }] };
        if (q.includes('FROM dms_SystemAccounts')) return { recordset: options.accounts || accounts };
        if (q.includes('FROM GLVoucherType')) return { recordset: [{ Voucherid: 1 }] };
        if (q.includes('OUTPUT INSERTED.RateID')) return { recordset: [{ RateID: 3 }] };
        if (q.includes('OUTPUT INSERTED.VoucherID')) return { recordset: [{ VoucherID: 20 }] };
        if (q.includes('SELECT AccrualID FROM @new')) return { recordset: [{ AccrualID: 30 }] };
        if (q.includes('SELECT * FROM dms_SalesIncentiveAccruals')) return { recordset: options.accruals || [{ AccrualID: 30, Status: 'Accrued', AmountAccrued: 250 }] };
        if (q.includes('SELECT * FROM data_FinanceVoucherInfo')) return { recordset: options.vouchers || [{ VoucherID: 20, VoucherNo: 'JV-20', Status: 'Posted' }] };
        if (q.includes('SELECT TOP(1) VoucherDetailID')) return { recordset: options.linked ? [{ VoucherDetailID: 31 }] : [] };
        return { recordset: [] };
    }) }; return t;
}
beforeEach(() => jest.clearAllMocks());
test('rate dates are inclusive and amounts keep cents; zero rates are valid', () => {
    expect(validateRate(policy)).toMatchObject({ variantId: 2, amount: 250 }); expect(validateRate({ ...policy, AmountPerBooking: 0 }).amount).toBe(0);
});
test.each([{ EffectiveFrom: '2026-02-30' }, { EffectiveTo: '2026-09-30' }, { VariantID: 0 }, { AmountPerBooking: '' }, { AmountPerBooking: -1 }, { AmountPerBooking: 1.001 }])('invalid rate rejected: %j', change => {
    expect(() => validateRate({ ...policy, ...change })).toThrow();
});
test('rate creation retains old rows, serializes overlapping date checks and audits the new policy', async () => {
    const t = tx(); expect(await createRate(t, policy, admin)).toMatchObject({ RateID: 3 });
    expect(t.calls.find(c => c.q.includes('SELECT TOP(1) RateID')).q).toContain('UPDLOCK,HOLDLOCK');
    expect(t.calls.find(c => c.q.includes('MasterIncentiveRateCreated')).v.uid).toBe(1);
    expect(t.calls.some(c => /DELETE|UPDATE dms_MasterIncentiveRates/.test(c.q))).toBe(false);
    await expect(createRate(tx({ overlap: true }), policy, admin)).rejects.toMatchObject({ status: 409 });
});
test('sales staff cannot alter Master rate setup', async () => {
    await expect(createRate(tx(), policy, { ...admin, groupId: 2, modules: ['sales_executive'] })).rejects.toMatchObject({ status: 403 });
});
test('booking save accrues even with discount approval pending, snapshots rate/accounts, and leaves balanced JV Draft', async () => {
    const t = tx(); expect(await accrueAtBooking(t, 7, admin)).toMatchObject({ RateID: 3, Amount: 250, VoucherID: 20 });
    const header = t.calls.find(c => c.q.includes('OUTPUT INSERTED.VoucherID')); expect(header.q).toContain("'Draft',0");
    const lines = t.calls.find(c => c.q.includes('INSERT INTO data_FinanceVoucherDetail')); expect(lines.v).toMatchObject({ amount: 250, recv: 10, income: 11 });
    const row = t.calls.find(c => c.q.includes('SELECT AccrualID FROM @new')); expect(JSON.parse(row.v.snapshot)).toMatchObject({ RateID: 3, Receivable: { GLCAID: 10 }, Income: { GLCAID: 11 } });
    expect(t.calls.some(c => /MasterInvoice|SalesDocuments|UPDATE data_FinanceVoucherInfo/.test(c.q))).toBe(false);
});
test.each([{ IsHistorical: true }, { MasterIncentiveRateID: 3 }])('no historical or duplicate booking accrual: %j', booking => {
    const t = tx({ booking }); return expect(accrueAtBooking(t, 7, admin)).resolves.toHaveProperty('skipped');
});
test('missing rate or incomplete/same-account mapping stops the save instead of silently skipping the voucher', async () => {
    await expect(accrueAtBooking(tx({ rates: [] }), 7, admin)).rejects.toMatchObject({ status: 409 });
    for (const a of [[], [{ ...accounts[0] }, { ...accounts[1], GLCAID: 10 }]]) await expect(accrueAtBooking(tx({ accounts: a }), 7, admin)).rejects.toMatchObject({ status: 409 });
});
test('an explicit zero policy is remembered without an incentive row or voucher', async () => {
    const t = tx({ rate: { AmountPerBooking: 0 } }); expect(await accrueAtBooking(t, 7, admin)).toMatchObject({ Amount: 0, AccrualID: null, VoucherID: null });
    expect(t.calls.some(c => c.q.includes('INSERT INTO data_FinanceVoucherInfo'))).toBe(false);
});
test('posted cancellation mirrors voucher once and marks only Master accruals reversed', async () => {
    const t = tx(); await reverseOnCancellation(t, 7, admin, 'Duplicate booking');
    expect(postReversalVoucher).toHaveBeenCalledWith(20, admin, t);
    const update = t.calls.find(c => c.q.includes('UPDATE dms_SalesIncentiveAccruals')); expect(update.q).toContain("EarnerType='Master'");
    expect(t.calls.some(c => /UPDATE dms_Vehicle|DELETE FROM dms_MasterIncentiveReceipts/.test(c.q))).toBe(false);
});
test('unposted draft is voided with complete audit snapshot and no reversal GL voucher', async () => {
    const t = tx({ vouchers: [{ VoucherID: 20, VoucherNo: 'JV-20', Status: 'Draft' }] }); await reverseOnCancellation(t, 7, admin, 'Duplicate booking');
    expect(postReversalVoucher).not.toHaveBeenCalled(); const history = t.calls.find(c => c.v.action === 'MasterIncentiveDraftVoided');
    expect(JSON.parse(history.v.old)).toMatchObject({ header: { VoucherID: 20, Status: 'Draft' }, detail: [] });
    expect(t.calls.some(c => c.q.includes('DELETE FROM data_FinanceVoucherInfo'))).toBe(true);
});
test('referenced drafts cannot be voided and audit failures propagate for transaction rollback', async () => {
    await expect(reverseOnCancellation(tx({ linked: true, vouchers: [{ VoucherID: 20, Status: 'Draft' }] }), 7, admin, 'Reason')).rejects.toMatchObject({ status: 409 });
    await expect(accrueAtBooking(tx({ failAt: 'INSERT INTO dms_SalesAuditLog' }), 7, admin)).rejects.toThrow('Synthetic');
});
test('aging is booking-wise, groups balances by exact age boundaries, exposes drafts and amounts owed back', async () => {
    const values = {}, queries = [];
    const rows = [30, 31, 60, 61, 90, 91].map((AgeDays, i) => ({ BookingID: i + 1, Accrued: 250, Received: 50, PostedAccrued: i ? 250 : 0, DraftVouchers: i ? 0 : 1, AgeDays, DMSBookingNumber: 'DMS-' + i }));
    rows.push({ BookingID: 20, Accrued: 0, Reversed: 250, Received: 100, PostedAccrued: 0, AgeDays: 1 });
    getPool.mockResolvedValue({ request: () => ({ input(k, t, v) { values[k] = v; return this; }, async query(q) { queries.push(q); return { recordset: rows }; } }) });
    const res = response(); await aging.report({ query: { asOf: '2026-10-29', search: "O'Neil" } }, res);
    expect(res.code).toBe(200); expect(res.body.totals).toMatchObject({ bookings: 7, outstanding: 1200, refundDue: 100 });
    expect(res.body.rows.slice(0, 6).map(r => r.Bucket)).toEqual(['0-30', '31-60', '31-60', '61-90', '61-90', '91+']);
    expect(res.body.rows[0].LedgerState).toBe('Awaiting finalization'); expect(values.search).toBe("%O'Neil%"); expect(queries[0]).not.toContain("O'Neil");
    expect(queries[0]).toContain('b.IsHistorical=0'); expect(queries[0]).toContain('b.DMSBookingNumber');
});
