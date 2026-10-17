jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: { DateTime: 'datetime', NVarChar: () => 'nvarchar' } }));
const { getPool } = require('../config/db');
const reports = require('../controllers/salesReportsController');
const router = require('../routes/salesReportsRoutes');
const response = () => ({ code: 200, status(n) { this.code=n; return this; }, json(body) { this.body=body; } });
const row = { BookingID: 7, BookingNo: 'BK-2026-0007', BookedOn: new Date('2026-10-01T00:00Z'),
    Status: 'Allocated', StandardPrice: 1000, NegotiatedPrice: 900, DiscountAmount: 100, AmountPaidToDate: 250,
    CancelledAt: null, CancellationReason: null };
function fixture(rows) {
    const values={},query=jest.fn(async()=>({recordset:rows}));
    getPool.mockResolvedValue({request:()=>({input(k,t,v){values[k]=v;return this;},query})});
    return {values,query};
}
const req = query => ({query:{from:'2026-10-01',to:'2026-10-31',...query}});
beforeEach(()=>jest.clearAllMocks());

test('regular register excludes cancelled bookings at SQL level before totals and pagination',async()=>{
    const {query}=fixture([row]),res=response();await reports.bookingRegister(req(),res);
    expect(query.mock.calls[0][0]).toContain("b.Status <> 'Cancelled'");
    expect(res.body.totals).toMatchObject({count:1,negotiated:900,paid:250,outstanding:650,byStatus:{Allocated:1}});
    expect(res.body.rows[0].BookingID).toBe(7);
});
test('query flags cannot opt cancelled bookings back into regular register',async()=>{
    const {query,values}=fixture([]),res=response();
    await reports.bookingRegister(req({cancelled:'true',includeCancelled:'1',status:'Cancelled'}),res);
    expect(query.mock.calls[0][0]).toContain("b.Status <> 'Cancelled'");
    expect(query.mock.calls[0][0]).toContain('b.Status = @st');expect(values.st).toBe('Cancelled');
    expect(res.body.totals.count).toBe(0);
});
test('cancelled register only includes final cancelled status and exposes cancellation information',async()=>{
    const {query}=fixture([{...row,Status:'Cancelled',CancelledAt:new Date('2026-10-17T00:00Z'),CancellationReason:'Customer withdrew'}]),res=response();
    await reports.cancelledBookingRegister(req(),res);
    expect(query.mock.calls[0][0]).toContain("b.Status = 'Cancelled'");
    expect(res.body.rows[0]).toMatchObject({Status:'Cancelled',CancelledAt:'2026-10-17',CancellationReason:'Customer withdrew',Outstanding:0});
    expect(res.body.totals).toMatchObject({count:1,negotiated:900,paid:250,outstanding:0,byStatus:{Cancelled:1}});
});
test.each(['bookingRegister','cancelledBookingRegister'])('%s preserves date filters and safely binds status',async method=>{
    const {query,values}=fixture([]),res=response();await reports[method](req({status:"x'"}),res);
    expect(query.mock.calls[0][0]).toContain('b.CreatedAt BETWEEN @from AND @to');
    expect(values.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(values.to).toBeInstanceOf(Date);expect(query.mock.calls[0][0]).not.toContain("x'");
});
test('both registers use the existing booking-register report permission',()=>{
    for(const path of ['/booking-register','/cancelled-booking-register']){
        const guard=router.stack.find(l=>l.route?.path===path).route.stack[0].handle;
        const denied=response(),next=jest.fn();guard({user:{groupId:2,permissions:[]}},denied,next);
        expect(denied.code).toBe(403);expect(next).not.toHaveBeenCalled();
        guard({user:{groupId:2,permissions:['report:booking_register']}},response(),next);expect(next).toHaveBeenCalledTimes(1);
    }
});
