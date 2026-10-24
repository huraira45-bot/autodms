const mockEvents=[],mockQueries=[];let mockBooking,mockVehicle,mockMapped,mockChangedVehicle,mockRows;
jest.mock('../config/db',()=>{
    class Request {
        constructor(owner){this.owner=owner;this.values={};}
        input(key,type,value){this.values[key]=value;return this;}
        async query(q){
            mockQueries.push({q,values:{...this.values}});
            if(q.includes('UPDATE v SET') && q.includes('FROM @updated'))return {recordset:mockRows.map(row=>({VehicleID:row.VehicleID}))};
            if(q.includes('INSERT INTO dms_GatePasses')){mockEvents.push('pass');return {recordset:[{GatePassID:501}]};}
            if(q.includes('seq_GatePassNo'))return {recordset:[{n:99}]};
            if(q.includes('FROM dms_SystemAccounts'))return {recordset:mockMapped?[{GLCAID:999}]:[]};
            if(/FROM\s+dms_SalesBookings/.test(q) && q.includes('UPDLOCK'))return {recordset:[{...mockBooking,AllocatedVehicleID:mockChangedVehicle||mockBooking.AllocatedVehicleID}]};
            if(/FROM\s+dms_SalesBookings/.test(q) && !q.includes('deliveredBooking'))return {recordset:[mockBooking]};
            if(q.includes('SELECT v.VehicleID') && q.includes('deliveredBooking'))return {recordset:mockRows};
            if(q.includes('FROM dms_Vehicle WITH'))return {recordset:mockVehicle?[mockVehicle]:[]};
            if(q.includes('SELECT ChasisNo, EngineNo'))return {recordset:[{ChasisNo:'TEST-CHASSIS'}]};
            if(q.includes('IsDeliveryLocked'))return {recordset:mockRows};
            return {recordset:[],rowsAffected:[1]};
        }
    }
    class Transaction {
        constructor(){this.request=()=>new Request(this);}
        async begin(){mockEvents.push('begin');}async commit(){mockEvents.push('commit');}async rollback(){mockEvents.push('rollback');}
    }
    const pool={request:()=>new Request(pool)};
    return {getPool:jest.fn(async()=>pool),sql:{Request,Transaction,Int:'int',NVarChar:()=> 'text',Decimal:()=> 'decimal'}};
});
jest.mock('../services/masterPaymentPositionService',()=>({loadMasterPosition:jest.fn(async()=>[{Net:1000}])}));
jest.mock('../services/salesDeliveryPostingService',()=>({postDeliveryVoucher:jest.fn(async()=>777)}));
jest.mock('../services/vehicleDeliveryLockService',()=>({
    ...jest.requireActual('../services/vehicleDeliveryLockService'),markVehicleDelivered:jest.fn(async()=>{mockEvents.push('delivered');}),
}));
const locks=require('../services/vehicleDeliveryLockService');
const actualLocks=jest.requireActual('../services/vehicleDeliveryLockService');
const lifecycle=require('../controllers/salesLifecycleController');
const catalog=require('../controllers/salesCatalogController');
const response=()=>({code:200,status(code){this.code=code;return this;},json(data){this.data=data;}});
const req=()=>({params:{id:'8'},body:{},user:{userId:1,groupId:1,userName:'Admin'}});
let errorLog;
beforeEach(()=>{
    jest.clearAllMocks();mockEvents.length=0;mockQueries.length=0;mockMapped=true;mockChangedVehicle=null;
    mockBooking={BookingID:8,Status:'Allocated',AllocatedVehicleID:90,NegotiatedPrice:1000,AmountPaidToDate:1000,MasterAgreedAmount:1000,WholesalePrice:1000};
    mockVehicle={VehicleID:90,Status:'Allocated',CurrentBookingID:8,SoldDeliveredAt:null};mockRows=[];
    locks.markVehicleDelivered.mockImplementation(async()=>{mockEvents.push('delivered');});
    errorLog=jest.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>errorLog.mockRestore());

test('gate pass with draft delivery voucher marks vehicle delivered before committing, while accounting stays pending',async()=>{
    const res=response();await lifecycle.issueGatePass(req(),res);
    expect(res.code).toBe(200);expect(res.data).toMatchObject({GatePassID:501,PendingReview:true,BookingClosed:false});
    expect(mockEvents).toEqual(['begin','pass','delivered','commit']);
    expect(locks.markVehicleDelivered).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({vehicleId:90,bookingId:8}));
    expect(mockQueries.some(({q})=>q.includes("Status='GatePassIssued',GatePassIssuedAt=GETDATE()"))).toBe(true);
});
test('gate pass also delivers immediately when no GL roles are mapped',async()=>{
    mockMapped=false;const res=response();await lifecycle.issueGatePass(req(),res);
    expect(res.code).toBe(200);expect(res.data.BookingClosed).toBe(true);
    expect(mockEvents).toEqual(['begin','pass','delivered','commit']);
});
test('a failed vehicle delivery rolls back the gate pass and booking transaction',async()=>{
    locks.markVehicleDelivered.mockRejectedValueOnce(Object.assign(new Error('Vehicle changed'),{statusCode:409}));
    const res=response();await lifecycle.issueGatePass(req(),res);
    expect(res.code).toBe(409);expect(mockEvents).toContain('rollback');expect(mockEvents).not.toContain('commit');
});
test('allocation changed since preflight cannot produce a gate pass for the old chassis',async()=>{
    mockChangedVehicle=91;const res=response();await lifecycle.issueGatePass(req(),res);
    expect(res.code).toBe(500);expect(mockEvents).not.toContain('pass');expect(mockEvents).toContain('rollback');
});
test.each(['updateVehicle','deleteVehicle'])('%s has no administrator bypass for the delivery lock',async method=>{
    mockRows=[{VehicleID:90,Status:'Delivered',IsDeliveryLocked:1}];const res=response();
    await catalog[method]({...req(),body:{Color:'Red'}},res);
    expect(res.code).toBe(423);expect(mockQueries.every(({q})=>!q.includes('UPDATE v SET')&&!q.includes('DELETE FROM dms_Vehicle'))).toBe(true);
});

test('an unlinked Delivered label can be edited without changing its status',async()=>{
    mockRows=[{VehicleID:90,Status:'Delivered',CurrentBookingID:null,IsDeliveryLocked:0,SoldDeliveredAt:null}];
    const res=response();await catalog.updateVehicle({...req(),body:{Color:'Red',Status:'Delivered'}},res);
    expect(res.code).toBe(200);expect(mockQueries.some(({q})=>q.includes('UPDATE v SET'))).toBe(true);
});

test('restoring an unlinked vehicle to stock clears its stale delivery timestamp',async()=>{
    mockRows=[{VehicleID:90,Status:'Delivered',CurrentBookingID:null,IsDeliveryLocked:0,SoldDeliveredAt:new Date()}];
    const res=response();await catalog.updateVehicle({...req(),body:{Status:'AtDealer'}},res);
    expect(res.code).toBe(200);expect(mockQueries.some(({q})=>q.includes('SoldDeliveredAt=NULL'))).toBe(true);
});

test('an unlinked Delivered label does not block deleting an unused vehicle',async()=>{
    mockRows=[{VehicleID:90,Status:'Delivered',CurrentBookingID:null,IsDeliveryLocked:0}];
    const res=response();await catalog.deleteVehicle(req(),res);
    expect(res.code).toBe(200);expect(mockQueries.some(({q})=>q.includes('DELETE FROM dms_Vehicle'))).toBe(true);
});

test('manual delivery cannot be newly assigned through the vehicle editor',async()=>{
    mockRows=[{VehicleID:90,Status:'AtDealer',IsDeliveryLocked:0}];
    const res=response();await catalog.updateVehicle({...req(),body:{Status:'Delivered'}},res);
    expect(res.code).toBe(409);expect(mockQueries.every(({q})=>!q.includes('UPDATE v SET'))).toBe(true);
});
test('completed gate pass also blocks the booking swap route',async()=>{
    mockRows=[{VehicleID:90}];const res=response();
    await lifecycle.swapAllocatedVehicle({...req(),body:{VehicleID:91,Reason:'Correct chassis'}},res);
    expect(res.code).toBe(423);expect(mockEvents).not.toContain('begin');
});
test('delivery helper checks ownership before writing stock',async()=>{
    mockVehicle.CurrentBookingID=9;
    await expect(actualLocks.markVehicleDelivered({}, {vehicleId:90,bookingId:8,user:req().user})).rejects.toThrow('another booking');
    expect(mockQueries).toHaveLength(1);
});
test('delivery helper is idempotent and does not change an existing delivery timestamp',async()=>{
    mockVehicle.Status='Delivered';mockVehicle.SoldDeliveredAt=new Date();
    await actualLocks.markVehicleDelivered({}, {vehicleId:90,bookingId:8,user:req().user});
    expect(mockQueries).toHaveLength(1);
});
test('a returned vehicle cannot be removed from stock again by delivery',async()=>{
    mockVehicle.Status='Returned';
    await expect(actualLocks.markVehicleDelivered({}, {vehicleId:90,bookingId:8,user:req().user})).rejects.toMatchObject({statusCode:409});
    expect(mockQueries).toHaveLength(1);
});
