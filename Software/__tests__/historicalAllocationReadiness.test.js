let mockBooking, mockVehicle, mockQueries, mockTransactions;
jest.mock('../config/db', () => {
    class Request {
        constructor(owner) { this.owner = owner; this.values = {}; }
        input(key, _type, value) { this.values[key] = value; return this; }
        async query(query) {
            mockQueries.push({ query, values: { ...this.values } });
            if (/FROM dms_SalesBookings b/.test(query)) return { recordset: [mockBooking] };
            if (/FROM dms_Vehicle WHERE/.test(query)) return { recordset: [mockVehicle] };
            return { recordset: [], rowsAffected: [1] };
        }
    }
    const pool = { request: () => new Request(pool) };
    class Transaction {
        constructor() { this.begin = jest.fn(); this.commit = jest.fn(); this.rollback = jest.fn(); mockTransactions.push(this); }
    }
    return { getPool: jest.fn(async () => pool), sql: { Request, Transaction, Int: 'Int', NVarChar: () => 'Text', MAX: 'MAX' } };
});
jest.mock('../controllers/salesDocumentController', () => ({ missingRequiredDocs: jest.fn() }));
jest.mock('../services/salesAuditService', () => ({ logAudit: jest.fn() }));
const lc = require('../controllers/salesLifecycleController');
const docs = require('../controllers/salesDocumentController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const req = () => ({ params: { id: '228' }, body: { VehicleID: 9 }, user: { userName: 'Manager' } });
const writes = () => mockQueries.filter(r => /\b(?:UPDATE|INSERT|DELETE)\b/i.test(r.query));
beforeEach(() => {
    jest.clearAllMocks(); mockQueries = []; mockTransactions = [];
    mockBooking = { BookingID: 228, Status: 'PendingBookingPayment', IsHistorical: true,
        AmountPaidToDate: 2993235, NegotiatedPrice: 2993235, MinimumBookingAmount: 600000,
        VehicleVariantID: 11, AllocatedVehicleID: null };
    mockVehicle = { VehicleID: 9, VariantID: 11, Status: 'AtDealer', AllocationType: 'Booked',
        CurrentBookingID: null, ChasisNo: 'TEST-KARVAN' };
    docs.missingRequiredDocs.mockResolvedValue([]);
});
it('reports the fully paid imported booking as ready while reading its historical flag', async () => {
    const res = response(); await lc.allocationReadiness(req(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ready: true, blockingReasons: [], minimumRequired: 600000 }));
    expect(mockQueries[0].query).toContain('b.IsHistorical'); expect(writes()).toHaveLength(0);
});
it('allocates the eligible historical pending booking and audits its actual previous state without financial postings', async () => {
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Allocated', BookingID: 228, VehicleID: 9 }));
    expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
    expect(writes().map(r => r.query)).toEqual([
        expect.stringContaining('UPDATE dms_SalesBookings'),
        expect.stringContaining('UPDATE dms_Vehicle'),
        expect.stringContaining('INSERT INTO dms_BookingStateTransitions'),
    ]);
    expect(writes()[2].values).toMatchObject({ from: 'PendingBookingPayment', to: 'Allocated' });
    expect(mockQueries[0].query).toContain('b.IsHistorical');
});
it.each([0,599999.99])('still blocks historical allocation below the minimum: %s', async amount => {
    mockBooking.AmountPaidToDate = amount;
    const ready = response(); await lc.allocationReadiness(req(), ready);
    expect(ready.json.mock.calls[0][0]).toMatchObject({ ready: false });
    expect(ready.json.mock.calls[0][0].blockingReasons.join(' ')).toContain('Minimum booking payment');
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.status).toHaveBeenCalledWith(412); expect(writes()).toHaveLength(0);
});
it('still requires a payment when the variant has no minimum', async () => {
    mockBooking.MinimumBookingAmount = 0; mockBooking.AmountPaidToDate = 0;
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.status).toHaveBeenCalledWith(412); expect(writes()).toHaveLength(0);
});
it('does not bypass normal booking confirmation', async () => {
    mockBooking.IsHistorical = false;
    const ready = response(); await lc.allocationReadiness(req(), ready);
    expect(ready.json.mock.calls[0][0].blockingReasons.join(' ')).toContain('PendingBookingPayment');
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.status).toHaveBeenCalledWith(409); expect(writes()).toHaveLength(0);
});
it.each(['Draft','PendingApproval','Cancelled','Closed','GatePassIssued'])('preserves historical status restrictions for %s', async status => {
    mockBooking.Status = status;
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.status).toHaveBeenCalledWith(409); expect(writes()).toHaveLength(0);
});
it.each(['CNIC','PBO'])('still requires %s for a booked unit', async missing => {
    docs.missingRequiredDocs.mockImplementation(async (_pool, _id, required) => required.includes(missing) ? [missing] : []);
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.status).toHaveBeenCalledWith(412);
    expect(res.json.mock.calls[0][0].error).toContain(missing); expect(writes()).toHaveLength(0);
});
it('requires CNIC in readiness and keeps a missing PBO conditional', async () => {
    docs.missingRequiredDocs.mockImplementation(async (_pool, _id, required) => required);
    const res = response(); await lc.allocationReadiness(req(), res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ ready: false, missingDocuments: ['CNIC'],
        conditionalDocuments: [expect.objectContaining({ DocType: 'PBO' })] });
});
it('preserves the existing open-allocation PBO exemption', async () => {
    mockVehicle.AllocationType = 'OpenAllocation';
    docs.missingRequiredDocs.mockImplementation(async (_pool, _id, required) => required.includes('PBO') ? ['PBO'] : []);
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Allocated' }));
});
it.each(['alreadyAllocated','wrongVariant','otherBooking','deliveredVehicle'])('preserves the vehicle check: %s', async problem => {
    if (problem === 'alreadyAllocated') mockBooking.AllocatedVehicleID = 8;
    if (problem === 'wrongVariant') mockVehicle.VariantID = 12;
    if (problem === 'otherBooking') mockVehicle.CurrentBookingID = 229;
    if (problem === 'deliveredVehicle') mockVehicle.Status = 'Delivered';
    const res = response(); await lc.allocateVehicle(req(), res);
    expect(res.status).toHaveBeenCalledWith(409); expect(writes()).toHaveLength(0);
});
