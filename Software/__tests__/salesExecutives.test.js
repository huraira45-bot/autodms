jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', Bit: 'bit', MAX: 'max', Decimal: () => 'decimal', NVarChar: () => 'nvarchar',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class { constructor(tx) { this.tx=tx;this.values={}; } input(k,t,v) { this.values[k]=v;return this; } query(q) { return this.tx.query(q,this.values); } },
} }));
jest.mock('../controllers/salesIncentiveController', () => ({ ...jest.requireActual('../controllers/salesIncentiveController'), accrueForBooking: jest.fn() }));
jest.mock('../services/masterBookingIncentiveService', () => ({ accrueAtBooking: jest.fn() }));
const { getPool } = require('../config/db');
const service = require('../services/salesExecutiveService');
const controller = require('../controllers/salesExecutiveController');
const bookings = require('../controllers/salesBookingController');
const historical = require('../controllers/salesHistoricalController');
const router = require('../routes/salesRoutes');
const admin = { groupId:1, userId:1, userName:'Admin', employeeId:3 };
const response = () => ({ code:200,status(code){this.code=code;return this;},json(body){this.body=body;} });
function fixture({ enabled = true, available = true, auditFailure = false, status = 'PendingPayment' } = {}) {
    const calls=[];
    const tx={begin:jest.fn(),commit:jest.fn(),rollback:jest.fn(),query:jest.fn(async(q,v)=>{
        calls.push({q,v});
        if(q.includes('SELECT IsEnabled')) return {recordset: enabled===null ? [] : [{IsEnabled:enabled}]};
        if(q.includes('FROM dbo.dms_SalesExecutives s WITH')) return {recordset: enabled && available ? [{EmployeeID:v.executive,EmployeeName:'Chosen executive'}] : []};
        if(q.includes('AS IsAvailable')) return {recordset:[{EmployeeID:v.id,EmployeeName:'Chosen executive',IsAvailable:available?1:0}]};
        if(q.includes('FROM dms_SalesBookings WITH')) return {recordset:[{BookingID:7,Status:status,CreatedBy_SalesExecutiveID:3}]};
        if(q.includes('AS nextNo')) return {recordset:[{nextNo:44}]};
        if(q.includes('OUTPUT INSERTED.BookingID')) return {recordset:[{BookingID:7}]};
        if(q.includes('OUTPUT INSERTED.RequestID')) return {recordset:[{RequestID:8}]};
        if(auditFailure && /INSERT (dbo.dms_SalesExecutiveChanges|dms_SalesAuditLog)/.test(q)) throw new Error('Audit unavailable');
        return {recordset:[]};
    })};
    const pool={tx,request(){const values={};return {input(k,t,v){values[k]=v;return this;},query:jest.fn(async q=>{
        calls.push({q,v:values});
        return {recordset:[{VariantID:2,ModelID:1,StandardPrice:1000,MinimumBookingAmount:0}]};
    })};}};
    getPool.mockResolvedValue(pool);return {pool,tx,calls};
}
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());

test.each([null,undefined,'',true,{},[3],0,-1,'3x',1.5,2147483648])('rejects invalid employee id %p',id=>expect(()=>service.employeeId(id)).toThrow());
test('setup is allowed for main admin or sales settings, refused for sales executive alone',()=>{
    for(const user of [admin,{modules:['sales_admin_settings']},{permissions:['sales_admin_settings']}]) {
        const next=jest.fn();service.requireManager({user},response(),next);expect(next).toHaveBeenCalled();
    }
    const res=response(),next=jest.fn();service.requireManager({user:{modules:['sales_executive']}},res,next);
    expect(res.code).toBe(403);expect(next).not.toHaveBeenCalled();
});
test.each([['/executives/setup','get'],['/executives/:id','put']])('setup API %s enforces manager permissions', (path,verb)=>{
    const route=router.stack.find(l=>l.route?.path===path && l.route.methods[verb]).route;
    const res=response(),next=jest.fn();route.stack[0].handle({user:{modules:['sales_executive']}},res,next);
    expect(res.code).toBe(403);expect(next).not.toHaveBeenCalled();
    route.stack[0].handle({user:admin},response(),next);expect(next).toHaveBeenCalled();
});
test('roster options are limited to enabled, active non-resigned employees without requiring HR permission', async()=>{
    const {calls}=fixture(),res=response();await controller.options({},res);
    expect(calls[0].q).toMatch(/s.IsEnabled=1/);expect(calls[0].q).toMatch(/e.IsActive=1 AND e.ResignDate IS NULL/);
    expect(calls[0].q).not.toMatch(/e\.\*|CNIC|Salary|GLv/);
    const next=jest.fn();router.stack.find(l=>l.route?.path==='/executives').route.stack[0].handle({user:{permissions:['sales_executive']}},response(),next);
    expect(next).toHaveBeenCalled();
});
test('enabling a new executive records the actor, without writing bookings or accounting', async()=>{
    const {tx,calls}=fixture({enabled:null});await service.setEnabled(tx,10,true,admin);
    expect(calls.find(c=>c.q.includes('INSERT dbo.dms_SalesExecutives')).v).toMatchObject({id:10,enabled:true,uid:1});
    expect(calls.find(c=>c.q.includes('INSERT dbo.dms_SalesExecutiveChanges')).v).toMatchObject({old:null,enabled:true});
    expect(calls.some(c=>/UPDATE.*Bookings|GLvMAIN|Accrual/.test(c.q))).toBe(false);
});
test('disabling an executive preserves booking history and audits the prior flag', async()=>{
    const {tx,calls}=fixture();await service.setEnabled(tx,10,false,admin);
    expect(calls.find(c=>c.q.includes('INSERT dbo.dms_SalesExecutiveChanges')).v).toMatchObject({old:true,enabled:false});
    expect(calls.filter(c=>/UPDATE|INSERT/.test(c.q))).toHaveLength(2);
});
test('setup rejects inactive staff, malformed boolean and unauthorized caller', async()=>{
    const {tx}=fixture({available:false});
    await expect(service.setEnabled(tx,10,true,admin)).rejects.toMatchObject({status:400});
    await expect(service.setEnabled(tx,10,'false',admin)).rejects.toMatchObject({status:400});
    await expect(service.setEnabled(tx,10,true,{modules:['sales_executive']})).rejects.toMatchObject({status:403});
});
test('setup audit failure rolls back the change',async()=>{
    const {tx}=fixture({enabled:null,auditFailure:true}),res=response();
    await controller.save({user:admin,params:{id:10},body:{IsEnabled:true}},res);
    expect(res.code).toBe(500);expect(tx.rollback).toHaveBeenCalled();expect(tx.commit).not.toHaveBeenCalled();
});
const body={PartyID:1,VehicleVariantID:2,NegotiatedPrice:1000,DMSBookingNumber:'DMS-001',BookingDate:'2026-01-01',Status:'PendingPayment',SalesExecutiveID:10};
test.each([bookings,historical])('booking creation rejects a forged non-roster salesperson before inserting a booking',async api=>{
    const {tx,calls}=fixture({enabled:false}),res=response();await api.createBooking({user:admin,body},res);
    expect(res.code).toBe(400);expect(res.body.error).toMatch(/enabled Sales Executive/);expect(tx.rollback).toHaveBeenCalled();
    expect(calls.some(c=>c.q.includes('INSERT INTO dms_SalesBookings'))).toBe(false);
});
test.each([bookings,historical])('booking creation uses selected executive while audit retains the real operator',async api=>{
    const {tx,calls}=fixture(),res=response();await api.createBooking({user:admin,body},res);
    expect(res.code).toBe(201);expect(tx.commit).toHaveBeenCalled();
    expect(calls.find(c=>c.q.includes('OUTPUT INSERTED.BookingID')).v).toMatchObject({exe:10,exeN:'Chosen executive'});
    const timeline=calls.find(c=>c.q.includes('INSERT INTO dms_BookingStateTransitions'));expect(timeline.v).toMatchObject({emp:3,name:'Admin'});
    const dms=calls.find(c=>c.q.includes('DMSBookingNumberRecorded'));if(dms)expect(dms.v.emp).toBe(3);
});
test('new booking discount proposer is the operator rather than selected salesperson',async()=>{
    const {calls}=fixture(),res=response();await bookings.createBooking({user:admin,body:{...body,NegotiatedPrice:900,NegotiationReason:'Customer approved discount'}},res);
    expect(res.code).toBe(201);expect(calls.find(c=>c.q.includes('OUTPUT INSERTED.RequestID')).v).toMatchObject({exe:3,exeN:'Admin'});
});
test('admin without linked employee can select an executive for a normal-price booking; discounts still require a real proposer',async()=>{
    const {calls}=fixture(),user={...admin,employeeId:null},res=response();
    await bookings.createBooking({user,body},res);expect(res.code).toBe(201);
    expect(calls.find(c=>c.q.includes('OUTPUT INSERTED.BookingID')).v.exe).toBe(10);
    const discountRes=response();await bookings.createBooking({user,body:{...body,NegotiatedPrice:900,NegotiationReason:'Customer asked'}},discountRes);
    expect(discountRes.code).toBe(400);expect(discountRes.body.error).toMatch(/linked employee/);
});
test('reassignment rejects disabled executive, and closed booking restrictions remain',async()=>{
    let f=fixture({enabled:false}),res=response();await bookings.changeSalesExecutive({user:admin,params:{id:7},body:{SalesExecutiveID:10}},res);
    expect(res.code).toBe(400);expect(f.tx.rollback).toHaveBeenCalled();
    f=fixture({status:'Closed'});res=response();await bookings.changeSalesExecutive({user:admin,params:{id:7},body:{SalesExecutiveID:10}},res);
    expect(res.code).toBe(409);expect(f.tx.rollback).toHaveBeenCalled();
});
test('reassignment audits selected employee and commits atomically; audit failure rolls back',async()=>{
    for(const auditFailure of [false,true]) {
        const {tx,calls}=fixture({auditFailure}),res=response();
        await bookings.changeSalesExecutive({user:admin,params:{id:7},body:{SalesExecutiveID:10}},res);
        expect(res.code).toBe(auditFailure?500:200);
        expect(calls.find(c=>c.q.includes('UPDATE dms_SalesBookings')).v).toMatchObject({exe:10,exeN:'Chosen executive'});
        expect(auditFailure?tx.rollback:tx.commit).toHaveBeenCalled();
    }
});
test('missing migration gives an actionable error instead of offering all employees',()=>{
    const res=response();service.sendError(res,{number:208,message:"Invalid object name 'dbo.dms_SalesExecutives'."});
    expect(res.code).toBe(503);expect(res.body.error).toContain('168_sales_executives.sql');
});
