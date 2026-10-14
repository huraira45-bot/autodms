const mockQueries = [];
const mockTransactions = [];
let mockRows, mockHandler;
jest.mock('../config/db', () => {
    class Request {
        constructor(owner) { this.owner = owner; this.values = {}; }
        input(key, _type, value) { this.values[key] = value; return this; }
        async query(query) {
            mockQueries.push({ query, values: { ...this.values } });
            return mockHandler(query, this.values);
        }
    }
    const pool = { request: () => new Request(pool) };
    class Transaction {
        constructor() { this.begin = jest.fn(); this.commit = jest.fn(); this.rollback = jest.fn(); mockTransactions.push(this); }
    }
    return { getPool: jest.fn(async () => pool), sql: { Request, Transaction, Int: 'Int', NVarChar: () => 'Text' } };
});
jest.mock('../controllers/salesBookingController', () => ({ logBookingTransition: jest.fn() }));
const controller = require('../controllers/salesHistoricalReferenceController');
const historical = require('../controllers/salesHistoricalController');
const { logBookingTransition } = require('../controllers/salesBookingController');
const { applyVoucherFilters } = require('../services/historicalVoucherSearchService');
const result = rows => ({ recordset: rows, rowsAffected: [rows.length] });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const req = body => ({ params: { id: '10' }, body, query: {}, user: { userName: 'Sales Manager' } });
beforeEach(() => {
    jest.clearAllMocks(); mockQueries.length = 0; mockTransactions.length = 0;
    mockRows = { booking: { BookingID: 10, BookingNo: 'BK-2024-0010', Status: 'Closed', IsHistorical: true, PartyGLID: 101 },
        payment: [{ PaymentID: 31 }], voucher: [{ VoucherNo: 'BPV-0099' }], duplicate: [], reference: [{ ReferenceID: 5 }], removed: [{ VoucherID: 99 }] };
    mockHandler = async query => {
        if (/FROM\s+dms_SalesBookings/.test(query)) return result([mockRows.booking]);
        if (/SELECT PaymentID FROM dms_SalesPayments/.test(query)) return result(mockRows.payment);
        if (/SELECT VoucherNo FROM data_FinanceVoucherInfo WITH/.test(query)) return result(mockRows.voucher);
        if (/SELECT ReferenceID FROM dms_HistoricalVoucherReferences/.test(query)) return result(mockRows.duplicate);
        if (/INSERT INTO dms_HistoricalVoucherReferences/.test(query)) return result(mockRows.reference);
        if (/DELETE FROM dms_HistoricalVoucherReferences/.test(query)) return result(mockRows.removed);
        if (/SELECT DISTINCT/.test(query)) return result([{ VoucherTypeCode: 'BPV' }]);
        if (/SELECT r.ReferenceID/.test(query)) return result([{ ReferenceID: 5, VoucherNo: 'BPV-0099', Status: 'Draft' }]);
        if (/SELECT TOP 50/.test(query)) return result([{ VoucherID: 99, VoucherNo: 'BPV-0099', Status: 'Draft' }]);
        if (/FROM dms_SystemAccounts/.test(query)) return result([{ GLCAID: 205 }]);
        throw new Error('Unexpected SQL: ' + query);
    };
});
const mutations = () => mockQueries.filter(({ query }) => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(query));
function expectReferenceOnly() {
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0].query).toMatch(/(?:INSERT INTO|DELETE FROM) dms_HistoricalVoucherReferences/);
    expect(mutations()[0].query).not.toMatch(/dms_SalesPayments|dms_HistoricalMasterAllocations|data_FinanceVoucherDetail|dms_PartyLedger/);
}
it.each(['BOOKING', 'MASTER'])('attaches an unrelated %s reference without any financial write', async kind => {
    const res = response();
    await controller.add(req({ VoucherID: 99, ReferenceKind: kind }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expectReferenceOnly();
    expect(mutations()[0].values).toMatchObject({ bid: 10, vid: 99, kind, pid: null });
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
    expect(logBookingTransition).toHaveBeenCalledWith(mockTransactions[0], 10, 'Closed', 'Closed', expect.anything(), expect.stringContaining('totals unchanged'));
});
it('attaches a customer payment reference after checking booking ownership', async () => {
    const res = response();
    await controller.add(req({ VoucherID: 99, ReferenceKind: 'CUSTOMER', PaymentID: 31 }), res);
    expect(res.status).toHaveBeenCalledWith(201); expectReferenceOnly();
    expect(mockQueries.find(({ query }) => /SELECT PaymentID/.test(query)).values).toEqual({ pid: 31, bid: 10 });
});
it('rejects a payment from another booking', async () => {
    mockRows.payment = [];
    const res = response();
    await controller.add(req({ VoucherID: 99, ReferenceKind: 'CUSTOMER', PaymentID: 31 }), res);
    expect(res.status).toHaveBeenCalledWith(404); expect(mutations()).toHaveLength(0);
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
});
it('rejects duplicate references without writing', async () => {
    mockRows.duplicate = [{ ReferenceID: 5 }];
    const res = response(); await controller.add(req({ VoucherID: 99 }), res);
    expect(res.status).toHaveBeenCalledWith(409); expect(mutations()).toHaveLength(0);
    expect(mockTransactions[0].commit).not.toHaveBeenCalled();
});
it('rolls back the reference if its audit write fails', async () => {
    logBookingTransition.mockRejectedValueOnce(new Error('Audit unavailable'));
    const res = response(); await controller.add(req({ VoucherID: 99 }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
    expect(mockTransactions[0].commit).not.toHaveBeenCalled(); expectReferenceOnly();
});
it('removes only the specified booking reference without changing its voucher', async () => {
    const request = req(); request.params.referenceId = '5';
    const res = response(); await controller.remove(request, res);
    expectReferenceOnly(); expect(mutations()[0].values).toEqual({ bid: 10, rid: 5 });
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
});
it('cannot remove a reference belonging to another booking', async () => {
    mockRows.removed = []; const request = req(); request.params.referenceId = '5';
    const res = response(); await controller.remove(request, res);
    expect(res.status).toHaveBeenCalledWith(404); expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
    expect(mockTransactions[0].commit).not.toHaveBeenCalled();
});
it('lists current voucher status on references separately from payment links', async () => {
    const res = response(); await controller.list(req(), res);
    expect(res.json).toHaveBeenCalledWith([{ ReferenceID: 5, VoucherNo: 'BPV-0099', Status: 'Draft' }]);
    expect(mutations()).toHaveLength(0);
});
it('searches the whole voucher system with an exact type filter and literal voucher number', async () => {
    const request = req(); request.query = { search: '  BPV_00%  ', voucherType: 'BPV' };
    const res = response(); await controller.search(request, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ vouchers: [expect.objectContaining({ Status: 'Draft' })] }));
    const lookup = mockQueries.find(({ query }) => /SELECT TOP 50/.test(query));
    expect(lookup.values).toEqual({ voucherType: 'BPV', s: '%BPV~_00~%%', exact: 'BPV_00%' });
    expect(lookup.query).toContain('LTRIM(RTRIM(vt.Title))=@voucherType');
    expect(lookup.query).not.toMatch(/v.Status='Posted'|cap.CustomerAmount|cap.MasterAmount/);
    expect(mutations()).toHaveLength(0);
});
it('requires a number or type for a system search', async () => {
    const res = response(); await controller.search(req(), res);
    expect(res.status).toHaveBeenCalledWith(400); expect(mockQueries).toHaveLength(0);
});
it('loads all distinct system voucher type codes rather than hardcoding opening JV', async () => {
    const res = response(); await controller.types(req(), res);
    expect(res.json).toHaveBeenCalledWith([{ VoucherTypeCode: 'BPV' }]);
    expect(mockQueries[0].query).toContain('SELECT DISTINCT');
});
it.each(['search', 'add', 'list', 'remove'])('rejects non-historical bookings for %s', async action => {
    mockRows.booking.IsHistorical = false; const request = req({ VoucherID: 99 });
    request.query = { search: '0099' }; request.params.referenceId = '5';
    const res = response(); await controller[action](request, res);
    expect(res.status).toHaveBeenCalledWith(409); expect(mutations()).toHaveLength(0);
});
it.each([{ VoucherID: 0 }, { VoucherID: 99, ReferenceKind: 'INVALID' },
    { VoucherID: 99, ReferenceKind: 'CUSTOMER' }, { VoucherID: 99, ReferenceKind: 'MASTER', PaymentID: 31 }])
('validates reference inputs before opening a transaction: %j', async body => {
    const res = response(); await controller.add(req(body), res);
    expect(res.status).toHaveBeenCalledWith(400); expect(mockTransactions).toHaveLength(0);
});
it('escapes SQL LIKE wildcard characters without interpolating user text into SQL', () => {
    const request = { input: jest.fn().mockReturnThis() };
    const filter = applyVoucherFilters(request, { search: "JV[1]~_%'", voucherType: 'JV' }, true);
    expect(request.input).toHaveBeenCalledWith('s', expect.anything(), "%JV~[1]~~~_~%'%");
    expect(filter).not.toContain("JV[1]"); expect(filter).toContain("ESCAPE '~'");
    expect(() => applyVoucherFilters(request, { search: 'a'.repeat(101) })).toThrow('too long');
});
it.each(['linkableVouchers', 'linkableMasterVouchers'])('filters existing %s payment lookups by voucher type while retaining financial restrictions', async action => {
    const request = req(); request.query = { all: '1', search: '0099', voucherType: 'BPV' };
    const res = response(); await historical[action](request, res);
    expect(res.status).not.toHaveBeenCalled();
    const lookup = mockQueries.find(({ query }) => /SELECT TOP 50/.test(query));
    expect(lookup.values.voucherType).toBe('BPV');
    expect(lookup.query).toContain('LTRIM(RTRIM(vt.Title))=@voucherType');
    expect(lookup.query).toContain("v.Status='Posted'");
    expect(lookup.query).toMatch(/cap.(?:CustomerAmount|MasterAmount)>0/);
});
