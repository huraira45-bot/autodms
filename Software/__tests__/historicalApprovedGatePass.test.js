let mockBooking,mockTransactions,mockWrites,mockRevoke,mockPriceChange;
jest.mock('../config/db',()=>{
 class Request{constructor(owner){this.owner=owner;this.values={};}input(k,_t,v){this.values[k]=v;return this;}
 async query(q){
 if(/UPDATE|INSERT/.test(q))mockWrites.push(q);
 if(q.includes('FROM dms_SystemAccounts'))return {recordset:[{GLCAID:201}]};
 if(q.includes('FROM dms_SalesBookings')||q.includes('FROM   dms_SalesBookings'))
  return {recordset:[{...mockBooking,...(this.owner instanceof Transaction&&mockRevoke?{HistoricalMasterApprovedAmount:null}:{}),
   ...(this.owner instanceof Transaction&&mockPriceChange?{NegotiatedPrice:900}:{})}]};
 if(q.includes('seq_GatePassNo'))return {recordset:[{n:9}]};
 if(q.includes('SELECT ChasisNo'))return {recordset:[{ChasisNo:'CHASSIS',EngineNo:'ENGINE'}]};
 if(q.includes('SELECT TOP 1 p.PartyName'))return {recordset:[{PartyName:'Customer'}]};
 if(q.includes('INSERT INTO dms_GatePasses'))return {recordset:[{GatePassID:44}]};
 return {recordset:[],rowsAffected:[1]};
 }}
 const pool={request:()=>new Request(pool)};
 class Transaction{constructor(){this.begin=jest.fn();this.commit=jest.fn();this.rollback=jest.fn();mockTransactions.push(this);}
 request(){return new Request(this);}}
 return {getPool:jest.fn(async()=>pool),sql:{Request,Transaction,Int:'Int',Date: 'Date',Decimal:()=> 'D',NVarChar:()=> 'N',MAX:'MAX'}};
});
jest.mock('../services/masterPaymentPositionService',()=>({loadMasterPosition:jest.fn(async()=>[])}));
jest.mock('../services/salesDeliveryPostingService',()=>({postDeliveryVoucher:jest.fn(async()=>null)}));
jest.mock('../services/salesAuditService',()=>({logAudit:jest.fn()}));
const lc=require('../controllers/salesLifecycleController');
const {postDeliveryVoucher}=require('../services/salesDeliveryPostingService');
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
beforeEach(()=>{jest.clearAllMocks();mockTransactions=[];mockWrites=[];mockRevoke=false;mockPriceChange=false;
 mockBooking={BookingID:232,Status:'Allocated',AllocatedVehicleID:24,IsHistorical:true,
  AmountPaidToDate:1000,NegotiatedPrice:1000,WholesalePrice:1000,HistoricalMasterApprovedAmount:1000};});
it('issues the historical gate pass with approved Master payment and no voucher match',async()=>{
 const r=response();await lc.issueGatePass({params:{id:'232'},body:{},user:{userId:17}},r);
 expect(r.status).not.toHaveBeenCalled();
 expect(r.json).toHaveBeenCalledWith(expect.objectContaining({BookingClosed:true,GatePassID:44}));
 expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
 expect(mockWrites.some(q=>q.includes("Status='Closed'"))).toBe(true);
 expect(mockWrites.some(q=>q.includes('INSERT INTO dms_GatePasses'))).toBe(true);
});
it('rejects approval revoked before the transaction recheck',async()=>{
 mockRevoke=true;const r=response();await lc.issueGatePass({params:{id:'232'},body:{}},r);
 expect(r.status).toHaveBeenCalledWith(500);expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
 expect(postDeliveryVoucher).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);
});
it('refuses a gate pass if a discount changed the price after preflight',async()=>{
 mockPriceChange=true;const r=response();await lc.issueGatePass({params:{id:'232'},body:{}},r);
 expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);
 expect(postDeliveryVoucher).not.toHaveBeenCalled();expect(mockWrites).toHaveLength(0);
 expect(r.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.stringContaining('price or status changed')}));
});
it('still requires customer payment',async()=>{
 mockBooking.AmountPaidToDate=900;const r=response();await lc.issueGatePass({params:{id:'232'},body:{}},r);
 expect(r.status).toHaveBeenCalledWith(409);expect(mockWrites).toHaveLength(0);
});
it('still requires an allocated vehicle',async()=>{
 mockBooking.AllocatedVehicleID=null;const r=response();await lc.issueGatePass({params:{id:'232'},body:{}},r);
 expect(r.status).toHaveBeenCalledWith(409);expect(mockWrites).toHaveLength(0);
});
