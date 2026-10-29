jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', Date: 'date', DateTime: 'datetime', MAX: 'max', Decimal: () => 'decimal', NVarChar: () => 'nvarchar',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class {
        constructor(tx) { this.tx=tx; this.values={}; }
        input(k,t,v) { this.values[k]=v; return this; }
        query(q) { return this.tx.query(q,this.values); }
    },
} }));
jest.mock('../controllers/salesIncentiveController', () => ({ accrueForBooking: jest.fn() }));
jest.mock('../services/masterBookingIncentiveService', () => ({ accrueAtBooking: jest.fn(), reverseOnCancellation: jest.fn() }));
const { getPool } = require('../config/db');
const { parseDeliveryMonth, deliveryMonthKey, setDeliveryMonth } = require('../services/bookingDeliveryMonthService');
const controller = require('../controllers/bookingDeliveryMonthController');
const balances = require('../controllers/customerVehicleBalanceController');
const normal = require('../controllers/salesBookingController');
const historical = require('../controllers/salesHistoricalController');
const user = { userId: 1, userName: 'Sales user', employeeId: 3, modules: ['sales_executive'], groupTitle: 'Sales' };
const input = { bookingId: 7, month: '2027-01', expectedMonth: null, reason: 'Customer delivery commitment', user };
const response = () => ({ code: 200, status(code) { this.code=code; return this; }, json(body) { this.body=body; } });
function fixture(options={}) {
    const initial = { BookingID: 7, Status: 'PendingPayment', PromisedDeliveryMonth: null, ...options.booking };
    const tx = { booking: { ...initial }, calls: [], begin: jest.fn(async()=>{}), commit: jest.fn(async()=>{}),
        rollback: jest.fn(async()=>{ tx.booking={...initial}; }) };
    tx.query=jest.fn(async(q,v)=>{
        tx.calls.push({q,v});
        if(q.includes('SELECT BookingID,Status,PromisedDeliveryMonth')) return {recordset: options.missing ? [] : [{...tx.booking}]};
        if(q.includes('UPDATE dms_SalesBookings SET PromisedDeliveryMonth')) tx.booking.PromisedDeliveryMonth=v.month;
        if(q.includes('INSERT INTO dms_SalesAuditLog') && options.failAudit) throw new Error('Audit failure');
        if(q.includes('AS nextNo')) return {recordset:[{nextNo:42}]};
        if(q.includes('OUTPUT INSERTED.BookingID')) return {recordset:[{BookingID:7}]};
        return {recordset:[],rowsAffected:[1]};
    });
    const pool={tx,request(){return {input(){return this;},query:async()=>({recordset:[{VariantID:2,ModelID:1,StandardPrice:1000,MinimumBookingAmount:0}]})};}};
    getPool.mockResolvedValue(pool);return {tx,pool};
}
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
test.each([undefined,null,''])('optional promise month stays unset: %p', v=>expect(parseDeliveryMonth(v)).toBeNull());
test('promise is a month, stored as the first calendar day without local timezone drift',()=>{
    expect(parseDeliveryMonth('2027-01').toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(deliveryMonthKey(parseDeliveryMonth('2027-01'))).toBe('2027-01');
});
test.each(['2026-00','2026-13','2026-1','2026-10-14','0000-01',123,{},'invalid'])('invalid promise month rejected: %p',v=>expect(()=>parseDeliveryMonth(v)).toThrow());
test('existing booking month update locks, audits old/new values and only changes scheduling metadata',async()=>{
    const {tx}=fixture();expect(await setDeliveryMonth(tx,input)).toEqual({changed:true,PromisedDeliveryMonth:'2027-01'});
    expect(tx.calls[0].q).toContain('UPDLOCK,HOLDLOCK');
    const audit=tx.calls.find(c=>c.q.includes('INSERT INTO dms_SalesAuditLog'));
    expect(JSON.parse(audit.v.old)).toEqual({PromisedDeliveryMonth:null});
    expect(JSON.parse(audit.v.next)).toEqual({PromisedDeliveryMonth:'2027-01'});
    expect(audit.v.uid).toBe(1);expect(tx.calls.some(c=>/Finance|PartyLedger|SalesPayments|NegotiatedPrice|AmountPaidToDate/.test(c.q))).toBe(false);
});
test('promise can be cleared; completed historical bookings can have their record corrected',async()=>{
    const {tx}=fixture({booking:{Status:'Closed',PromisedDeliveryMonth:new Date('2026-10-01T00:00Z')}});
    expect(await setDeliveryMonth(tx,{...input,month:null,expectedMonth:'2026-10'})).toEqual({changed:true,PromisedDeliveryMonth:null});
});
test('stale expected month prevents overwriting another user change',async()=>{
    const {tx}=fixture({booking:{PromisedDeliveryMonth:new Date('2026-10-01T00:00Z')}});
    await expect(setDeliveryMonth(tx,input)).rejects.toMatchObject({status:409});expect(tx.calls).toHaveLength(1);
});
test('saving the same month does not create artificial audit changes',async()=>{
    const {tx}=fixture();expect((await setDeliveryMonth(tx,{...input,month:null})).changed).toBe(false);expect(tx.calls).toHaveLength(1);
});
test.each([['unauthorized',{user:{modules:['sales_reports']}},403],['missing booking',{},404],['invalid reason',{reason:'x'},400]])('%s is rejected',async(label,change,status)=>{
    const {tx}=fixture({missing:label==='missing booking'});await expect(setDeliveryMonth(tx,{...input,...change})).rejects.toMatchObject({status});
});
test('audit failure rolls back the promise update',async()=>{
    const {tx}=fixture({failAudit:true}),res=response();
    await controller.update({params:{id:'7'},user,body:{PromisedDeliveryMonth:'2027-01',ExpectedMonth:null,Reason:'Customer requested'}},res);
    expect(res.code).toBe(500);expect(tx.rollback).toHaveBeenCalled();expect(tx.commit).not.toHaveBeenCalled();expect(tx.booking.PromisedDeliveryMonth).toBeNull();
});
test('update requires explicit current/new month to prevent accidental clearing',async()=>{
    const res=response();await controller.update({params:{id:'7'},user,body:{PromisedDeliveryMonth:null}},res);expect(res.code).toBe(400);
});
test.each([['normal',normal],['historical',historical]])('%s creation stores the optional month',async(label,api)=>{
    const {tx}=fixture(),res=response();
    await api.createBooking({user,body:{PartyID:1,VehicleVariantID:2,NegotiatedPrice:1000,DMSBookingNumber:'1005/70000001',Status:'PendingPayment',BookingDate:'2026-01-01',PromisedDeliveryMonth:'2026-12'}},res);
    expect(res.code).toBe(201);
    const insert=tx.calls.find(c=>c.q.includes('OUTPUT INSERTED.BookingID'));
    expect(insert.q).toContain('PromisedDeliveryMonth');expect(insert.v.promise.toISOString()).toBe('2026-12-01T00:00:00.000Z');
});
test.each([normal,historical])('creation rejects invalid promise before DB access',async api=>{
    const res=response();await api.createBooking({body:{PromisedDeliveryMonth:'2026-13'}},res);expect(res.code).toBe(400);expect(getPool).not.toHaveBeenCalled();
});
test('balance query excludes cancelled and fully paid, uses discounted vehicle price and bound filters',async()=>{
    const values={},queries=[];
    getPool.mockResolvedValue({request:()=>({input(k,t,v){values[k]=v;return this;},async query(q){queries.push(q);return {recordset:[
        {BookingID:1,BookingDate:new Date('2026-01-01Z'),PromisedDeliveryMonth:new Date('2026-12-01Z'),VehiclePrice:1000.25,VehiclePaid:500.10,Outstanding:500.15},
        {BookingID:2,BookingDate:new Date('2026-01-01Z'),PromisedDeliveryMonth:null,VehiclePrice:10,VehiclePaid:0,Outstanding:10},
    ]};}})});
    const res=response();await balances.report({query:{from:'2026-01-01',to:'2026-10-16',month:'2026-12',search:"x'",status:'Allocated'}},res);
    expect(res.code).toBe(200);expect(res.body.totals.outstanding).toBe(510.15);
    expect(res.body.rows[0].PromisedDeliveryMonth).toBe('2026-12');
    expect(queries[0]).toContain("b.Status<>'Cancelled'");expect(queries[0]).toContain('b.NegotiatedPrice > ISNULL(b.AmountPaidToDate,0)');
    expect(queries[0]).not.toMatch(/SUM\(|Master|PremiumAmount/);expect(queries[0]).not.toContain("x'");expect(values.search).toBe("%x'%");
    expect(values.month.toISOString()).toBe('2026-12-01T00:00:00.000Z');
});
test.each([{month:'2026-13'},{month:'2026-12',unpromised:'1'},{from:'2026-02-30'},{from:'2026-11-01',to:'2026-01-01'}])('invalid balance filters fail clearly: %p',async query=>{
    const res=response();await balances.report({query},res);expect(res.code).toBe(400);expect(getPool).not.toHaveBeenCalled();
});
