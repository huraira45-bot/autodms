jest.mock('../config/db', () => ({
    getPool: jest.fn(),
    sql: { Transaction: class { constructor(pool) { return pool.tx; } }, Int: 'Int', MAX: 'MAX', NVarChar: n => `nvarchar(${n})`, Decimal: () => 'decimal', DateTime: 'datetime',
        Request: class {
            constructor(tx) { this.tx = tx; this.values = {}; }
            input(key, type, value) { this.values[key] = value; return this; }
            query(query) { return this.tx.query(query, this.values); }
        },
    },
}));
jest.mock('../utils/voucherNumbering', () => ({ nextVoucherNo: jest.fn().mockResolvedValue('BPV-REV-0099') }));
const { voidMasterPayment } = require('../services/masterPaymentVoidService');
const { postReversalVoucher } = require('../services/voucherReversalService');
const user = { userId: 1, userName: 'Test Accountant', employeeId: 9 };
const input = { bookingId: 7, voucherId: 20, reason: 'Wrong bank account', user };
const voucher = { VoucherID: 20, VoucherNo: 'BPV-0020', Status: 'Draft', TotalAmount: 200, ReversesVoucherID: null };
function transaction(rows) {
    const tx = { calls: [], query: jest.fn(async (query, values) => {
        tx.calls.push({ query, values });
        if (!rows.length) return { recordset: [], rowsAffected: [1] };
        const next = rows.shift();
        if (next instanceof Error) throw next;
        return { recordset: next, rowsAffected: [1] };
    }) };
    tx.request = () => new (require('../config/db').sql.Request)(tx);
    return tx;
}
const writes = tx => tx.calls.filter(c => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.query));

describe('Master payment void', () => {
    test('draft void removes only its voucher and stores actor, amount and reason', async () => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], [voucher], []]);
        const result = await voidMasterPayment(tx, input);
        expect(result.requiresApproval).toBe(false);
        const removed = tx.calls.filter(c => c.query.startsWith('DELETE'));
        expect(removed).toHaveLength(3);
        expect(removed.every(c => c.values.vid === 20)).toBe(true);
        const audit = tx.calls.find(c => c.query.includes('INSERT INTO dms_SalesAuditLog'));
        expect(audit.values).toMatchObject({ bid: 7, vid: 20, uid: 1, act: 'VoidMasterPayment', notes: input.reason });
        expect(JSON.parse(audit.values.old)).toMatchObject({ TotalAmount: 200, VoucherNo: 'BPV-0020' });
        expect(tx.calls[0].query).toContain('UPDLOCK, HOLDLOCK');
        expect(tx.calls[1].query).toContain("SourceDocType='PAY_MASTER' AND SourceDocID=@bid");
    });
    test.each([undefined, '', ' ab ', 123])('rejects invalid reason %p without touching SQL', async reason => {
        const tx = transaction([]);
        await expect(voidMasterPayment(tx, { ...input, reason })).rejects.toMatchObject({ statusCode: 400 });
        expect(tx.query).not.toHaveBeenCalled();
    });
    test.each([0, -1, 1.5, NaN])('rejects invalid voucher ID %p before touching SQL', async voucherId => {
        const tx = transaction([]);
        await expect(voidMasterPayment(tx, { ...input, voucherId })).rejects.toMatchObject({ statusCode: 400 });
        expect(tx.query).not.toHaveBeenCalled();
    });
    test('wrong booking or unrelated voucher is refused without writes', async () => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], []]);
        await expect(voidMasterPayment(tx, input)).rejects.toMatchObject({ statusCode: 404 });
        expect(writes(tx)).toHaveLength(0);
    });
    test.each(['Closed', 'Delivered', 'GatePassIssued'])('refuses delivery state %s without writes', async Status => {
        const tx = transaction([[{ BookingID: 7, Status }]]);
        await expect(voidMasterPayment(tx, input)).rejects.toMatchObject({ statusCode: 409 });
        expect(writes(tx)).toHaveLength(0);
    });
    test.each([{ Status: 'Reversed' }, { Status: 'Posted', ReversesVoucherID: 12 }])('refuses reversal history %p', async patch => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], [{ ...voucher, ...patch }]]);
        await expect(voidMasterPayment(tx, input)).rejects.toMatchObject({ statusCode: 409 });
        expect(writes(tx)).toHaveLength(0);
    });
    test('a payment posted before the locked read creates approval instead of being deleted', async () => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], [{ ...voucher, Status: 'Posted' }], [], [], [{ RequestID: 30 }]]);
        const result = await voidMasterPayment(tx, input);
        expect(result).toMatchObject({ requiresApproval: true, RequestID: 30 });
        expect(writes(tx).map(c => c.query)).toHaveLength(2);
        expect(writes(tx).every(c => c.query.includes('INSERT INTO'))).toBe(true);
        const request = tx.calls.find(c => c.query.includes('INSERT INTO dms_UnfinalizeRequests'));
        expect(request.values).toMatchObject({ vid: 20, uid: 1, reason: input.reason });
    });
    test('an open approval request blocks duplicates without writes', async () => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], [{ ...voucher, Status: 'Posted' }], [{ RequestID: 30 }]]);
        await expect(voidMasterPayment(tx, input)).rejects.toMatchObject({ statusCode: 409 });
        expect(writes(tx)).toHaveLength(0);
    });
    test('downstream allocation prevents a posted void request', async () => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], [{ ...voucher, Status: 'Posted' }], [], [{ VoucherNo: 'CRV-1', VoucherType: 'CRV', TotalAmount: 20 }]]);
        await expect(voidMasterPayment(tx, input)).rejects.toMatchObject({ statusCode: 409, blockers: expect.any(Array) });
        expect(writes(tx)).toHaveLength(0);
    });
    test('referenced draft is not deleted', async () => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], [voucher], [{ VoucherID: 55 }]]);
        await expect(voidMasterPayment(tx, input)).rejects.toMatchObject({ statusCode: 409 });
        expect(writes(tx)).toHaveLength(0);
    });
    test('audit failure propagates so the caller rolls back the whole void', async () => {
        const tx = transaction([[{ BookingID: 7, Status: 'Allocated' }], [voucher], [], [], [], [], new Error('Audit unavailable')]);
        await expect(voidMasterPayment(tx, input)).rejects.toThrow('Audit unavailable');
    });
});

describe('Master payment reversal', () => {
    test.each(['Closed', 'Delivered', 'GatePassIssued'])('approval cannot reverse Master payment after booking reaches %s', async Status => {
        const tx = transaction([[{ VoucherID: 20, VoucherNo: 'BPV-0020', Status: 'Posted', SourceDocType: 'PAY_MASTER', SourceDocID: 7 }], [{ Status }]]);
        await expect(postReversalVoucher(20, user, tx)).rejects.toThrow('booking reached delivery');
        expect(writes(tx)).toHaveLength(0);
    });
    test('second execution after waiting for the booking lock cannot post a second reversal', async () => {
        const tx = transaction([[{ VoucherID: 20, VoucherNo: 'BPV-0020', Status: 'Posted', SourceDocType: 'PAY_MASTER', SourceDocID: 7 }], [{ Status: 'Allocated' }], [{ Status: 'Reversed' }]]);
        await expect(postReversalVoucher(20, user, tx)).rejects.toThrow('already been reversed');
        expect(writes(tx)).toHaveLength(0);
    });
    test('mirror preserves booking and allocation tags and reverses both balanced lines', async () => {
        const tx = transaction([
            [{ VoucherID: 20, VoucherNo: 'BPV-0020', Status: 'Posted', VoucherTypeID: 3, TotalAmount: 200, SourceDocType: 'PAY_MASTER', SourceDocID: 7 }],
            [{ Status: 'Allocated' }], [{ Status: 'Posted' }],
            [{ GLCAID: 10, Debit: 200, Credit: 0, BookingID: 7, AllocatedToVoucherID: 99 }, { GLCAID: 11, Debit: 0, Credit: 200, BookingID: 7 }],
            [], [{ Title: 'BPV' }], [{ VoucherID: 21 }],
        ]);
        await expect(postReversalVoucher(20, user, tx)).resolves.toMatchObject({ reversalId: 21 });
        const mirrors = tx.calls.filter(c => c.query.includes('INSERT INTO data_FinanceVoucherDetail'));
        expect(mirrors).toHaveLength(2);
        expect(mirrors.map(c => c.values.bid)).toEqual([7, 7]);
        expect(mirrors[0].values).toMatchObject({ dr: 0, cr: 200, alloc: 99 });
        expect(mirrors[1].values).toMatchObject({ dr: 200, cr: 0 });
        const header = tx.calls.find(c => c.query.includes('INSERT INTO data_FinanceVoucherInfo'));
        expect(header.values).toMatchObject({ src: 'PAY_MASTER', srcId: 7, rev: 20 });
    });
});

describe('Posting versus draft void', () => {
    test.each([0, 1])('conditional draft posting handles affected rows %i', async affected => {
        const { getPool } = require('../config/db');
        const tx = transaction([]);
        tx.begin = jest.fn().mockResolvedValue();
        tx.commit = jest.fn().mockResolvedValue();
        tx.rollback = jest.fn().mockResolvedValue();
        tx.query.mockResolvedValue({ recordset: [], rowsAffected: [affected] });
        getPool.mockResolvedValue({ tx, request: () => ({ input() { return this; }, query: async () => ({ recordset: [{ Status: 'Draft' }] }) }) });
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json: jest.fn() };
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await require('../controllers/finalizeController').finalize({ params: { entity: 'VOUCHER', id: '20' }, user: { ...user, modules: ['finalize'] } }, res);
            if (affected === 0) {
                expect(res.statusCode).toBe(409);
                expect(tx.rollback).toHaveBeenCalledTimes(1);
                expect(tx.commit).not.toHaveBeenCalled();
            } else {
                expect(res.statusCode).toBe(200);
                expect(tx.commit).toHaveBeenCalledTimes(1);
                expect(tx.rollback).not.toHaveBeenCalled();
            }
        } finally { logged.mockRestore(); }
    });
});
