const mockQueries=[],mockTransactions=[];let mockBooking;
jest.mock('../config/db',()=>{
 class Request{constructor(owner){this.owner=owner;this.values={};}input(k,_t,v){this.values[k]=v;return this;}
 async query(q){mockQueries.push({q,values:{...this.values}});if(q.includes('SELECT b.BookingID'))return {recordset:[mockBooking]};
 return {recordset:[],rowsAffected:[1]};}}
 class Transaction{constructor(){this.begin=jest.fn();this.commit=jest.fn();this.rollback=jest.fn();mockTransactions.push(this);}}
 return {getPool:jest.fn(async()=>({})),sql:{Request,Transaction,Int:'Int',NVarChar:()=> 'Text',Decimal:()=> 'Decimal'}};
});
jest.mock('../controllers/salesBookingController',()=>({logBookingTransition:jest.fn()}));
const service=require('../services/historicalMasterApprovalService');
const controller=require('../controllers/salesHistoricalMasterApprovalController');
const {logBookingTransition}=require('../controllers/salesBookingController');
const res=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
const request=body=>({params:{id:'232'},body,user:{userId:17,userName:'GM Sales'}});
beforeEach(()=>{jest.clearAllMocks();mockQueries.length=0;mockTransactions.length=0;
 mockBooking={BookingID:232,BookingNo:'BK-2026-0232',IsHistorical:true,Status:'Allocated',WholesalePrice:1000,NegotiatedPrice:1000};});
it('approves a historical payment without querying or writing any voucher or payment',async()=>{
 const r=res();await controller.approve(request({Amount:1000}),r);
 expect(r.json).toHaveBeenCalledWith(expect.objectContaining({Amount:1000}));
 const write=mockQueries.find(x=>x.q.startsWith('UPDATE'));
 expect(write.values).toMatchObject({bid:232,amt:1000,by:17,name:'GM Sales'});
 expect(mockQueries.some(x=>/FinanceVoucher|SalesPayments|HistoricalMasterAllocations/.test(x.q))).toBe(false);
 expect(mockTransactions[0].commit).toHaveBeenCalledTimes(1);
 expect(logBookingTransition).toHaveBeenCalledWith(mockTransactions[0],232,'Allocated','Allocated',expect.anything(),expect.stringContaining('optional'));
});
it.each([0,-1,1000.01,Infinity,1.001])('rejects invalid or excessive approval total %s',async amount=>{
 const r=res();await controller.approve(request({Amount:amount}),r);
 expect(r.status).toHaveBeenCalledWith(400);expect(mockQueries.some(x=>x.q.startsWith('UPDATE'))).toBe(false);
 expect(mockTransactions[0].commit).not.toHaveBeenCalled();
});
it('cannot approve a normal booking without its voucher',async()=>{
 mockBooking.IsHistorical=false;const r=res();await controller.approve(request({Amount:1000}),r);
 expect(r.status).toHaveBeenCalledWith(409);expect(mockQueries.some(x=>x.q.startsWith('UPDATE'))).toBe(false);
});
it.each(['GatePassIssued','Closed','Delivered','Cancelled'])('locks approval after %s',async status=>{
 mockBooking.Status=status;const r=res();await controller.approve(request({Amount:1000}),r);
 expect(r.status).toHaveBeenCalledWith(409);
});
it('repeated approval overwrites a total instead of adding another payment',async()=>{
 mockBooking.HistoricalMasterApprovedAmount=1000;
 await service.approveHistoricalMaster({},232,1000,'Existing historical pay order',request().user);
 const write=mockQueries.find(x=>x.q.startsWith('UPDATE'));
 expect(write.q).toContain('HistoricalMasterApprovedAmount=@amt');
 expect(write.values.amt).toBe(1000);
});
it.each([[1000,0,1000],[1000,1000,1000],[500,300,500],[500,700,700]])(
 'counts approval %s and matched balance %s once as %s', (approved,ledger,expected)=>{
 expect(service.effectiveMasterPaid({IsHistorical:true,HistoricalMasterApprovedAmount:approved},ledger)).toBe(expected);
});
it('ignores an approval field on a normal booking',()=>{
 expect(service.effectiveMasterPaid({IsHistorical:false,HistoricalMasterApprovedAmount:1000},0)).toBe(0);
});
it('removing approval leaves matching and all financial records intact',async()=>{
 mockBooking.HistoricalMasterApprovedAmount=1000;const r=res();await controller.revoke(request(),r);
 expect(r.status).not.toHaveBeenCalled();
 expect(mockQueries.find(x=>x.q.startsWith('UPDATE')).q).toContain('HistoricalMasterApprovedAmount=NULL');
 expect(mockQueries.some(x=>/FinanceVoucher|SalesPayments|HistoricalMasterAllocations/.test(x.q))).toBe(false);
});
it('rolls approval back if audit fails',async()=>{
 logBookingTransition.mockRejectedValueOnce(new Error('Audit failed'));
 const r=res();await controller.approve(request({Amount:1000}),r);
 expect(r.status).toHaveBeenCalledWith(500);
 expect(mockTransactions[0].rollback).toHaveBeenCalledTimes(1);expect(mockTransactions[0].commit).not.toHaveBeenCalled();
});
