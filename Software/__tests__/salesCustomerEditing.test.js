jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', MAX: 'max', Bit: 'bit', DateTime: 'datetime', Date: 'date', Decimal: () => 'decimal', VarChar: () => 'varchar', NVarChar: () => 'nvarchar',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class { constructor(tx) { this.tx = tx; this.values = {}; } input(k, t, v) { this.values[k] = v; return this; } query(q) { return this.tx.query(q, this.values); } },
} }));
const { getPool } = require('../config/db');
const identity = require('../services/salesCustomerIdentityService');
const controller = require('../controllers/salesCustomerController');
const parties = require('../controllers/partyController');
const router = require('../routes/salesRoutes');
const admin = { userId: 1, userName: 'Admin tester', groupId: 1, modules: [] };
const initial = { BookingID: 7, Status: 'Closed', PartyID: 20, PartyName: 'Original customer', CNIC: null, NTNNO: null, PhoneOne: null, AddressOne: null };
const expected = () => Object.fromEntries(['PartyID', 'PartyName', 'CNIC', 'NTNNO', 'PhoneOne', 'AddressOne'].map(k => [k, initial[k]]));
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function fixture(options = {}) {
    let row = { ...initial, ...options.row };
    const tx = { begin: jest.fn(async () => {}), commit: jest.fn(async () => {}), rollback: jest.fn(async () => { row = { ...initial, ...options.row }; }),
        query: jest.fn(async (q, v) => {
            if (q.includes('ids.CNIC')) return { recordset: options.warnings || [] };
            if (q.includes('FROM dms_SalesBookings b')) return { recordset: options.missing ? [] : [{ ...row }] };
            if (q.includes('COUNT(*) AS N')) return { recordset: [{ N: 2 }] };
            if (q.includes('UPDATE gen_PartiesInfo')) Object.assign(row, { PartyName: v.name, CNIC: v.cnic, NTNNO: v.ntn, PhoneOne: v.phone, AddressOne: v.address });
            if (q.includes('INSERT INTO dms_SalesAuditLog') && options.failAudit) throw new Error('Audit unavailable');
            if (q.includes('CASE') && q.includes('AS Conflict')) return { recordset: options.phoneConflict || (q.includes('OR (CNIC') ? [{ Conflict: 'cnic', PartyName: 'Existing customer' }] : []) };
            if (q.includes('FROM GLChartOFAccount WHERE GLCAID')) return { recordset: [{ GLCAID: 55, GLCode: '201002999', GLTitle: 'Customer account', Status: 1, isParent: 0 }] };
            if (q.includes('WHERE PartyGLID = @gl')) return { recordset: options.heldGL || [] };
            if (q.includes('OUTPUT INSERTED.PartyID')) return { recordset: [{ PartyID: 30 }] };
            return { recordset: [], rowsAffected: [1] };
        }) };
    const pool = { tx, request: () => { const values = {}; return { input(k, t, v) { values[k] = v; return this; }, query(q) { return tx.query(q, values); } }; } };
    getPool.mockResolvedValue(pool); return { tx, row: () => row, pool };
}
const edit = (body = {}, user = admin) => ({ params: { id: '7' }, user, body: { PartyName: 'Corrected customer', CNIC: '3520212345671', NTNNO: '1234567-8', PhoneOne: '03001234567', AddressOne: 'New address', Expected: expected(), Reason: 'Correct customer details', ...body } });
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
test('normalizes formatted identifiers and rejects invalid lengths/types', () => {
    expect(identity.normaliseCNIC('3520212345671')).toBe('35202-1234567-1'); expect(identity.normaliseNTN('1234567-8')).toBe('12345678');
    expect(identity.normaliseCNIC('')).toBeNull(); expect(identity.normaliseNTN(null)).toBeNull();
    expect(() => identity.normaliseCNIC('1234')).toThrow(); expect(() => identity.normaliseNTN('1234')).toThrow(); expect(() => identity.normaliseCNIC([])).toThrow();
});
test('identity checks include both matches, normalize legacy punctuation and exclude the current customer using bound parameters', async () => {
    const { tx, pool } = fixture({ warnings: [{ PartyID: 21, PartyName: "O'Brien", CNICMatch: true, NTNMatch: true }] });
    const warnings = await identity.identityWarnings(pool.request(), { CNIC: '35202-1234567-1', NTNNO: '1234567-8', excludeId: 20 });
    expect(warnings[0].fields).toEqual(['CNIC', 'NTN']); expect(warnings[0].message).toContain('You can still save');
    expect(tx.query.mock.calls[0][1]).toEqual({ identityCnic: '3520212345671', identityNtn: '12345678', identityExclude: 20 });
    expect(tx.query.mock.calls[0][0]).toContain('REPLACE(REPLACE(p.CNIC');
});
test('sales customer creation succeeds with duplicate CNIC/NTN and returns warnings', async () => {
    const { tx } = fixture({ warnings: [{ PartyID: 21, PartyName: 'Existing', CNICMatch: true, NTNMatch: true }] }), res = response();
    await parties.createSalesCustomer({ body: { PartyName: 'New customer', PartyGLID: 55, CNIC: '3520212345671', NTNNO: '12345678' } }, res);
    expect(res.code).toBe(201); expect(res.body.warnings).toHaveLength(1); expect(res.body.PartyID).toBe(30);
    const dup = tx.query.mock.calls.find(([q]) => q.includes('AS Conflict'))[0]; expect(dup).not.toContain('OR (CNIC');
});
test('general party create retains its duplicate guard; a body flag cannot bypass it', async () => {
    fixture(); const res = response(); await parties.createParty({ body: { PartyName: 'Customer', PartyGLID: 55, CNIC: '3520212345671', allowDuplicateIdentity: true } }, res);
    expect(res.code).toBe(409);
});
test('sales creation retains phone and account ownership checks', async () => {
    fixture({ phoneConflict: [{ Conflict: 'phone', PartyName: 'Existing' }] }); const res = response();
    await parties.createSalesCustomer({ body: { PartyName: 'Customer', PartyGLID: 55, PhoneOne: '03001234567' } }, res); expect(res.code).toBe(409);
    fixture({ heldGL: [{ PartyID: 21, PartyName: 'Account holder' }] }); const gl = response();
    await parties.createSalesCustomer({ body: { PartyName: 'Customer', PartyGLID: 55 } }, gl); expect(gl.code).toBe(409); expect(gl.body.error).toContain('Each party has its own account');
});
test('admin edits a closed booking customer with a duplicate identity, actual stored audit, and no financial changes', async () => {
    const { tx, row } = fixture({ warnings: [{ PartyID: 21, PartyName: 'Existing', CNICMatch: true, NTNMatch: true }] }), res = response();
    await controller.update(edit(), res); expect(res.code).toBe(200); expect(tx.commit).toHaveBeenCalled(); expect(res.body.warnings).toHaveLength(1);
    expect(row().CNIC).toBe('35202-1234567-1'); expect(row().NTNNO).toBe('12345678'); expect(row().Status).toBe('Closed');
    const audit = tx.query.mock.calls.find(([q]) => q.includes('INSERT INTO dms_SalesAuditLog'));
    expect(JSON.parse(audit[1].old)).toEqual(expected()); expect(JSON.parse(audit[1].next).PartyName).toBe('Corrected customer'); expect(audit[1].uid).toBe(1);
    expect(tx.query.mock.calls[0][0]).toContain('UPDLOCK,HOLDLOCK');
    expect(tx.query.mock.calls.some(([q]) => /FinanceVoucher|PartyLedger|UPDATE dms_SalesBookings|UPDATE GLChart|SalesPayments/.test(q))).toBe(false);
});
test.each([{ userId: 5, userName: 'Executive', groupId: 5, modules: ['sales_executive'] }, { groupId: 5, permissions: ['crm_parties:edit'], modules: ['crm_parties'] }])('non-admin cannot edit the customer through booking: %j', async user => {
    fixture(); const res = response(); await controller.update(edit({}, user), res); expect(res.code).toBe(403); expect(getPool).not.toHaveBeenCalled();
});
test('sales settings admin can edit; reads indicate all bookings using this customer', async () => {
    const { tx } = fixture(), res = response(); await controller.get({ params: { id: '7' }, user: { modules: ['sales_admin_settings'] } }, res);
    expect(res.code).toBe(200); expect(res.body.linkedBookings).toBe(2); expect(res.body.customer).toEqual(expected()); expect(tx.query).toHaveBeenCalledTimes(2);
});
test.each([{ Expected: { ...expected(), PartyID: 99 } }, { Expected: { ...expected(), PartyName: 'Stale name' } }])('stale form or reassigned customer cannot overwrite the new record', async body => {
    const { tx } = fixture(), res = response(); await controller.update(edit(body), res); expect(res.code).toBe(409); expect(tx.rollback).toHaveBeenCalled(); expect(tx.query).toHaveBeenCalledTimes(1);
});
test('audit failure rolls back the customer correction', async () => {
    const { tx, row } = fixture({ failAudit: true }), res = response(); await controller.update(edit(), res);
    expect(res.code).toBe(500); expect(tx.rollback).toHaveBeenCalled(); expect(tx.commit).not.toHaveBeenCalled(); expect(row().PartyName).toBe(initial.PartyName);
});
test('saving unchanged details returns warnings without manufacturing an audit edit', async () => {
    const { tx } = fixture(), res = response();
    const { PartyID, ...details } = expected(); await controller.update(edit(details), res);
    expect(res.code).toBe(200); expect(res.body.message).toContain('No customer details changed');
    expect(tx.commit).not.toHaveBeenCalled(); expect(tx.query.mock.calls.some(([q]) => /UPDATE|INSERT/.test(q))).toBe(false);
});
test('missing customer returns 404; invalid booking IDs reject without DB access', async () => {
    fixture({ missing: true }); const res = response(); await controller.update(edit(), res); expect(res.code).toBe(404);
    getPool.mockClear(); const bad = response(); await controller.update({ ...edit(), params: { id: '7junk' } }, bad); expect(bad.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});
test.each([{ PartyGLID: 999 }, { PartyID: 99 }, { PartyName: '' }, { Reason: '' }, { CNIC: '1234' }, { NTNNO: '1234' }, { Expected: null }])('invalid or unrelated fields reject before opening a transaction: %j', async body => {
    fixture(); const res = response(); await controller.update(edit(body), res); expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});
test('customer edit routes allow admin and deny a sales executive', () => {
    const guard = router.stack.find(l => l.route?.path === '/bookings/:id/customer' && l.route.methods.put).route.stack[0].handle;
    const next = jest.fn(); guard({ user: admin }, response(), next); expect(next).toHaveBeenCalledTimes(1);
    const res = response(); guard({ user: { modules: ['sales_executive'] } }, res, jest.fn()); expect(res.code).toBe(403);
});
test('creating booking customers retains the existing customer-insert permission', () => {
    const guard = router.stack.find(l => l.route?.path === '/customers' && l.route.methods.post).route.stack[0].handle;
    const next = jest.fn(); guard({ user: { groupId: 2, permissions: ['crm_parties:insert'] } }, response(), next); expect(next).toHaveBeenCalledTimes(1);
    const res = response(); guard({ user: { groupId: 2, permissions: ['sales_executive'] } }, res, jest.fn()); expect(res.code).toBe(403);
});
