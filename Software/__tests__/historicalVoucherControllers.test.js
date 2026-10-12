const mockTransactions = [];
const mockQueries = [];
let mockState;
let mockQueryHandler;

jest.mock('../config/db', () => {
    class Request {
        constructor(owner) { this.owner = owner; this.values = {}; }
        input(key, _type, value) { this.values[key] = value; return this; }
        async query(query) {
            mockQueries.push({ query, values: { ...this.values }, owner: this.owner });
            return mockQueryHandler(query, this.values);
        }
    }
    const pool = { request: () => new Request(pool) };
    class Transaction {
        constructor() {
            this.begin = jest.fn().mockResolvedValue();
            this.commit = jest.fn().mockResolvedValue();
            this.rollback = jest.fn().mockResolvedValue();
            mockTransactions.push(this);
        }
        request() { return new Request(this); }
    }
    return {
        getPool: jest.fn(async () => pool),
        sql: { Request, Transaction, Int: 'Int', Bit: 'Bit', DateTime: 'DateTime',
            Decimal: jest.fn(() => 'Decimal'), NVarChar: jest.fn(() => 'NVarChar'), MAX: 'MAX' },
    };
});
jest.mock('../controllers/salesBookingController', () => ({ logBookingTransition: jest.fn() }));

const controller = require('../controllers/salesHistoricalController');
const { logBookingTransition } = require('../controllers/salesBookingController');
const { LOCK_VOUCHER_SQL, LINKABLE_VOUCHER_SQL } = require('../services/historicalVoucherAllocationService');

const result = (recordset = [], count = 0) => ({ recordset, rowsAffected: [count] });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const user = { employeeId: 7, userName: 'Accounts Clerk' };
const changes = () => mockQueries.filter(entry => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(entry.query));

beforeEach(() => {
    mockTransactions.length = 0;
    mockQueries.length = 0;
    jest.clearAllMocks();
    mockState = {
        booking: { BookingID: 10, BookingNo: 'BK-2024-0010', Status: 'Closed', IsHistorical: true,
            PartyID: 4, PartyName: 'Customer A', PartyGLID: 101, NegotiatedPrice: 1000 },
        payment: { PaymentID: 31, BookingID: 10, Amount: 300, PremiumPortion: 20,
            Status: 'Posted', VoucherID: null, VoucherNo: null, IsLinkedVoucher: false },
        voucher: { VoucherID: 20, VoucherNo: 'JV-OPENING-20', VoucherDate: '2024-05-01',
            Status: 'Posted', ReversesVoucherID: null, SourceDocType: null,
            TotalAmount: 10000, CustomerAmount: 400, LinkedAmount: 80 },
        allocations: [
            { BookingID: 10, VoucherID: 20, GLCAID: 205, Amount: 400 },
            { BookingID: 11, VoucherID: 20, GLCAID: 205, Amount: 600 },
        ],
        legacy: [],
    };
    mockQueryHandler = async (query, values) => {
        if (query === LOCK_VOUCHER_SQL || query === LINKABLE_VOUCHER_SQL) return result([mockState.voucher]);
        if (/FROM\s+dms_SystemAccounts/i.test(query)) return result([{ GLCAID: 205 }]);
        if (/SELECT BookingID FROM dms_SalesPayments/i.test(query)) return result([{ BookingID: mockState.payment.BookingID }]);
        if (/FROM\s+dms_SalesBookings b/i.test(query)) return result([mockState.booking]);
        if (/FROM\s+dms_SalesPayments WITH/i.test(query)) return result([mockState.payment]);
        if (/INSERT INTO dms_SalesPayments/i.test(query)) {
            mockState.insertedPayment = { ...values };
            return result([{ PaymentID: 32 }], 1);
        }
        if (/UPDATE dms_SalesPayments/i.test(query)) {
            mockState.payment = { ...mockState.payment, VoucherID: values.vid ?? null,
                VoucherNo: values.vno ?? null, LinkedVoucherGLCAID: values.gl ?? null,
                IsLinkedVoucher: !/IsLinkedVoucher=0/.test(query) };
            return result([], 1);
        }
        if (/FROM data_FinanceVoucherInfo WITH/i.test(query)) return result([mockState.voucher]);
        if (/DELETE FROM dms_HistoricalMasterAllocations/i.test(query)) {
            const before = mockState.allocations.length;
            mockState.allocations = mockState.allocations.filter(row =>
                row.BookingID !== values.b || row.VoucherID !== values.v || row.GLCAID !== values.gl);
            return result([], before - mockState.allocations.length);
        }
        if (/SELECT ISNULL\(SUM\(Debit-Credit\),0\) AS Amount FROM data_FinanceVoucherDetail/i.test(query)) {
            const Amount = mockState.legacy.filter(row =>
                row.BookingID === values.b && row.VoucherID === values.v && row.GLCAID === values.gl)
                .reduce((sum, row) => sum + (row.Debit || 0) - (row.Credit || 0), 0);
            return result([{ Amount }]);
        }
        if (/UPDATE data_FinanceVoucherDetail/i.test(query)) {
            let count = 0;
            for (const row of mockState.legacy) {
                if (row.BookingID === values.b && row.VoucherID === values.v && row.GLCAID === values.gl) {
                    row.BookingID = null;
                    count += 1;
                }
            }
            return result([], count);
        }
        if (/UPDATE dms_PartyLedger/i.test(query)) return result([], 1);
        throw new Error('Unexpected query in controller test: ' + query);
    };
});

it('records a shared opening voucher payment with its account snapshot and vehicle plus premium total', async () => {
    const res = response();
    await controller.recordPayment({ params: { id: '10' }, body: {
        Amount: 300, PremiumPortion: 20, PaymentMode: 'BankTransfer', VoucherID: 20,
    }, user }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockState.insertedPayment).toMatchObject({ bid: 10, amt: 300, prem: 20,
        vid: 20, vno: 'JV-OPENING-20', linked: 1, gl: 101 });
    expect(mockQueries.find(entry => entry.query === LINKABLE_VOUCHER_SQL).values).toEqual({ vid: 20, gl: 101 });
    expect(logBookingTransition).toHaveBeenCalledWith(mockTransactions[0], 10, 'Closed', 'Closed', user,
        expect.stringContaining('320'));
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
    expect(mockTransactions[0].rollback).not.toHaveBeenCalled();
    expect(changes()).toHaveLength(1);
});

it('rolls back when the booking amount plus premium exceeds the account remaining amount', async () => {
    mockState.voucher.LinkedAmount = 80.01;
    const res = response();
    await controller.recordPayment({ params: { id: '10' }, body: {
        Amount: 300, PremiumPortion: 20, PaymentMode: 'Cash', VoucherID: 20,
    }, user }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toContain('319.99');
    expect(mockState.insertedPayment).toBeUndefined();
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
    expect(mockTransactions[0].commit).not.toHaveBeenCalled();
    expect(changes()).toHaveLength(0);
});

it('rejects fractions of a cent before they can create an undercounted voucher allocation', async () => {
    const res = response();
    await controller.recordPayment({ params: { id: '10' }, body: {
        Amount: 100.006, PremiumPortion: 0.006, PaymentMode: 'Cash', VoucherID: 20,
    }, user }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockState.insertedPayment).toBeUndefined();
    expect(changes()).toHaveLength(0);
});

it('links an existing customer payment and stores the account used for the shared allocation', async () => {
    const res = response();
    await controller.linkPayment({ params: { paymentId: '31' }, body: { VoucherID: 20 }, user }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ PaymentID: 31, VoucherNo: 'JV-OPENING-20' }));
    expect(mockState.payment).toMatchObject({ VoucherID: 20, VoucherNo: 'JV-OPENING-20', LinkedVoucherGLCAID: 101 });
    expect(changes()[0].values).toEqual({ pid: 31, vid: 20, vno: 'JV-OPENING-20', gl: 101 });
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
    expect(changes()).toHaveLength(1);
});

it('does not relink a payment that was voided before the locked reread', async () => {
    mockState.payment.Status = 'Reversed';
    const res = response();
    await controller.linkPayment({ params: { paymentId: '31' }, body: { VoucherID: 20 }, user }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
    expect(mockQueries.some(entry => entry.query === LINKABLE_VOUCHER_SQL)).toBe(false);
    expect(changes()).toHaveLength(0);
});

it('unlinks only the selected payment and clears its account snapshot without editing the voucher', async () => {
    mockState.payment = { ...mockState.payment, VoucherID: 20, VoucherNo: 'JV-OPENING-20',
        IsLinkedVoucher: true, LinkedVoucherGLCAID: 101 };
    const res = response();
    await controller.unlinkPayment({ params: { paymentId: '31' }, user }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockState.payment).toMatchObject({ VoucherID: null, VoucherNo: null, IsLinkedVoucher: false,
        LinkedVoucherGLCAID: null });
    expect(changes()).toHaveLength(1);
    expect(changes()[0].values).toEqual({ pid: 31 });
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
});

it('unlinks this booking from a shared Master voucher while preserving another booking allocation', async () => {
    const res = response();
    await controller.unlinkMasterPayment({ params: { id: '10' }, body: { VoucherID: 20 }, user }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockState.allocations).toEqual([{ BookingID: 11, VoucherID: 20, GLCAID: 205, Amount: 600 }]);
    const removed = changes().find(entry => /DELETE FROM dms_HistoricalMasterAllocations/.test(entry.query));
    expect(removed.values).toEqual({ v: 20, gl: 205, b: 10 });
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
    expect(changes().some(entry => /UPDATE dms_PartyLedger/.test(entry.query))).toBe(false);
});

it('keeps legacy Master links removable but clears only the selected booking tags', async () => {
    mockState.allocations = [];
    mockState.legacy = [
        { BookingID: 10, VoucherID: 20, GLCAID: 205, Debit: 400, Credit: 0 },
        { BookingID: 11, VoucherID: 20, GLCAID: 205, Debit: 600, Credit: 0 },
    ];
    const res = response();
    await controller.unlinkMasterPayment({ params: { id: '10' }, body: { VoucherID: 20 }, user }, res);
    expect(mockState.legacy.map(row => row.BookingID)).toEqual([null, 11]);
    expect(changes().find(entry => /UPDATE dms_PartyLedger/.test(entry.query)).values)
        .toEqual({ v: 20, gl: 205, b: 10 });
    expect(changes().filter(entry => /data_FinanceVoucherDetail|dms_PartyLedger/.test(entry.query))
        .every(entry => !/SET\s+(?:Debit|Credit)\b/i.test(entry.query))).toBe(true);
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
});

it('refuses to unlink an automatically created delivery credit voucher', async () => {
    mockState.voucher.SourceDocType = 'SALES_DELIVERY';
    mockState.allocations = [];
    mockState.legacy = [{ BookingID: 10, VoucherID: 20, GLCAID: 205, Debit: 0, Credit: 1000 }];
    const res = response();
    await controller.unlinkMasterPayment({ params: { id: '10' }, body: { VoucherID: 20 }, user }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockState.legacy[0].BookingID).toBe(10);
    expect(changes()).toHaveLength(0);
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
});

it('rolls back a Master unlink that has no matching allocation or legacy booking tags', async () => {
    mockState.allocations = mockState.allocations.filter(row => row.BookingID !== 10);
    const res = response();
    await controller.unlinkMasterPayment({ params: { id: '10' }, body: { VoucherID: 20 }, user }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockState.allocations).toEqual([{ BookingID: 11, VoucherID: 20, GLCAID: 205, Amount: 600 }]);
    expect(logBookingTransition).not.toHaveBeenCalled();
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
    expect(mockTransactions[0].commit).not.toHaveBeenCalled();
});

it('rolls back a linked payment when the audit write fails', async () => {
    logBookingTransition.mockRejectedValueOnce(new Error('Audit write failed'));
    const res = response();
    await controller.linkPayment({ params: { paymentId: '31' }, body: { VoucherID: 20 }, user }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Audit write failed' });
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
    expect(mockTransactions[0].commit).not.toHaveBeenCalled();
});


it('refuses a manual pure-credit voucher without removing its legacy booking tags', async () => {
    mockState.allocations = [];
    mockState.legacy = [
        { BookingID: 10, VoucherID: 20, GLCAID: 205, Debit: 0, Credit: 1000 },
        { BookingID: 11, VoucherID: 20, GLCAID: 205, Debit: 0, Credit: 400 },
    ];
    const res = response();
    await controller.unlinkMasterPayment({ params: { id: '10' }, body: { VoucherID: 20 }, user }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockState.legacy.map(row => row.BookingID)).toEqual([10, 11]);
    expect(changes().some(entry => /UPDATE data_FinanceVoucherDetail|UPDATE dms_PartyLedger/.test(entry.query))).toBe(false);
    expect(logBookingTransition).not.toHaveBeenCalled();
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
    expect(mockTransactions[0].commit).not.toHaveBeenCalled();
});
it('locks the shared voucher before locking the existing payment row', async () => {
    const res=response();
    await controller.linkPayment({params:{paymentId:'31'},body:{VoucherID:20},user},res);
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
    const headerIndex=mockQueries.findIndex(entry=>entry.query===LOCK_VOUCHER_SQL);
    const paymentIndex=mockQueries.findIndex(entry=>/FROM\s+dms_SalesPayments WITH/.test(entry.query));
    const capacityIndex=mockQueries.findIndex(entry=>entry.query===LINKABLE_VOUCHER_SQL);
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(paymentIndex).toBeGreaterThan(headerIndex);
    expect(capacityIndex).toBeGreaterThan(paymentIndex);
});
