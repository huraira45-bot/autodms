let mockDb;
jest.mock('../config/db',()=>({sql:{Int:'int',UniqueIdentifier:'uuid',BigInt:'bigint',MAX:'max',NVarChar:()=> 'text',Request:class{constructor(tx){this.tx=tx;this.v={};}input(k,t,v){this.v[k]=v;return this;}query(q){return this.tx.query(q,this.v);}}}}));
jest.mock('../services/voucherReversalService',()=>({postReversalVoucher:jest.fn()}));
const {postReversalVoucher}=require('../services/voucherReversalService');
const {reopenBookingDelivery}=require('../services/bookingDeliveryReopenService');
const user={groupId:1,userId:1,employeeId:3,userName:'Administrator'};
const input={bookingNo:'BK-2026-0001',expectedChassis:'TEST-CHASSIS',expectedVoucherNo:'JV-12',expectedGatePassNo:'GP-123',reason:'Owner approved release for reallocation',user};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}){
 const booking={BookingID:1,BookingNo:input.bookingNo,Status:'Closed',AllocatedVehicleID:9,DeliveryVoucherID:12,GatePassIssuedAt:'2026-11-06',DeliveredAt:'2026-11-06',ClosedAt:'2026-11-10',AmountPaidToDate:1000,NegotiatedPrice:1000,...options.booking};
 const vehicle={VehicleID:9,ChasisNo:'TEST-CHASSIS',EngineNo:'ENGINE-UNCHANGED',VariantID:2,Status:'Delivered',CurrentBookingID:1,SoldDeliveredAt:'2026-11-06',MasterInvoiceVoucherID:null,...options.vehicle};
 const pass={GatePassID:5,GatePassNo:'GP-123',VehicleChassis:'TEST-CHASSIS',RevokedAt:null,...options.pass};
 const voucher={VoucherID:12,VoucherNo:'JV-12',Status:'Posted',Posted:true,ReversesVoucherID:null,SourceDocType:'SALES_DELIVERY',SourceDocID:1,TotalAmount:1000,...options.voucher};
 const lines=[{VoucherDetailID:1,VoucherID:12,GLCAID:20,Debit:1000,Credit:0,BookingID:1},{VoucherDetailID:2,VoucherID:12,GLCAID:21,Debit:0,Credit:1000,BookingID:1}];
 const subs=[{VoucherID:12,BookingID:1,PartyID:6,GLCAID:20,Debit:1000,Credit:0}];
 const open=[{VehicleID:9,Status:'Sold',SoldAt:'2026-11-06',SoldToBookingID:1}];
 const protectedRows=[[{PaymentID:7,BookingID:1,Amount:1000,Status:'Posted'}],[{VoucherID:8,SourceDocType:'PAY_MASTER',Status:'Posted'}],[],[{AccrualID:4,Amount:10}],[],[{DocumentID:4}]];
 mockDb={booking,vehicle,pass,vouchers:[voucher],lines,subs,open,protectedRows,completed:false,calls:[]};
 const tx={query:jest.fn(async(q,v)=>{
  mockDb.calls.push({q,v});
  if(q.includes('AS SetupID'))return{recordset:[{SetupID:options.noSetup?null:1}]};
  if(q.startsWith('SELECT * FROM dms_SalesBookings WITH'))return{recordset:options.noBooking?[]:[clone(booking)]};
  if(q.startsWith('SELECT * FROM dms_Vehicle WITH'))return{recordset:[clone(vehicle)]};
  if(q.includes('SELECT MAX(MovementID)'))return{recordsets:clone([[pass],mockDb.vouchers,lines,subs,open,[{LastDeliveryMovementID:99}],options.conflict?[{BookingID:2}]:[],options.otherPass?[{GatePassID:6}]:[],options.invoice?[{DocumentID:6}]:[],options.cheque?[{PendingChequeID:1}]:[]])};
  if(q.includes('SELECT * FROM dms_SalesPayments WITH'))return{recordsets:clone(mockDb.protectedRows)};
  if(q.includes('INSERT dms_BookingDeliveryReopens'))mockDb.reopen=v;
  if(q.includes('UPDATE dms_GatePasses SET RevokedAt')){Object.assign(pass,{RevokedAt:'2026-11-18',RevokedBy:v.uid,RevokedByName:v.actor,RevokeReason:v.reason});Object.assign(booking,{Status:'PendingPayment',AllocatedVehicleID:null,DeliveryVoucherID:null,GatePassIssuedAt:null,DeliveredAt:null,ClosedAt:null,UpdatedAt:'2026-11-18',UpdatedByName:v.actor,UpdatedByEmployeeID:v.emp});}
  if(q.includes("UPDATE dms_Vehicle SET Status='AtDealer'")){Object.assign(vehicle,{Status:'AtDealer',CurrentBookingID:null,SoldDeliveredAt:null,UpdatedAt:'2026-11-18',UpdatedByName:v.actor,UpdatedByEmployeeID:v.emp});Object.assign(open[0],{Status:'AtDealer',SoldAt:null,SoldToBookingID:null});}
  if(q.includes('SET CompletedAtUtc'))mockDb.completed=true;
  if(q.includes('INSERT dms_SalesAuditLog')&&options.auditFailure)throw new Error('Audit failure');
  if(q.includes('SELECT * FROM dms_SalesBookings WHERE BookingID'))return{recordsets:clone([[booking],[{...vehicle,DeliveryLocked:options.stillLocked?1:0}],[pass],mockDb.vouchers,mockDb.lines,mockDb.subs,open])};
  return{recordset:[],rowsAffected:[1]};
 })};
 postReversalVoucher.mockImplementation(async()=>{
  if(options.reverseFails)throw new Error('Reversal failed');
  Object.assign(voucher,{Status:'Reversed',ReversedBy:1,ReversedByName:'Administrator',ReversedAt:'2026-11-18'});
  mockDb.vouchers.push({...voucher,VoucherID:13,VoucherNo:'JV-REV-13',Status:'Posted',ReversesVoucherID:12});
  mockDb.lines.push(...clone(lines).map(d=>({...d,VoucherID:13,Debit:d.Credit,Credit:d.Debit})));
  mockDb.subs.push(...clone(subs).map(d=>({...d,VoucherID:13,Debit:d.Credit,Credit:d.Debit})));
  if(options.changePayment)mockDb.protectedRows[0][0].Amount=999;
  return{reversalId:13,reversalNo:'JV-REV-13'};
 });
 return tx;
}
beforeEach(()=>jest.clearAllMocks());
test('preview validates exact delivery and makes no writes or reversal',async()=>{const tx=fixture();const out=await reopenBookingDelivery(tx,input);expect(out).toMatchObject({dryRun:true,NewStatus:'PendingPayment',PaymentAmountsPreserved:true,MasterRemittancesPreserved:true});expect(postReversalVoucher).not.toHaveBeenCalled();expect(mockDb.calls.some(c=>/UPDATE|INSERT/.test(c.q)&&!c.q.includes('UPDLOCK'))).toBe(false);});
test('reopen revokes the pass, reverses only delivery and releases the chassis with strict audit',async()=>{const tx=fixture();const protectedBefore=clone(mockDb.protectedRows);const out=await reopenBookingDelivery(tx,{...input,apply:true});expect(out).toMatchObject({verified:true,ReversalVoucherNo:'JV-REV-13',NewStatus:'PendingPayment'});expect(postReversalVoucher).toHaveBeenCalledTimes(1);expect(postReversalVoucher).toHaveBeenCalledWith(12,user,tx);expect(mockDb.booking).toMatchObject({Status:'PendingPayment',AllocatedVehicleID:null,DeliveryVoucherID:null,AmountPaidToDate:1000});expect(mockDb.vehicle).toMatchObject({Status:'AtDealer',CurrentBookingID:null,EngineNo:'ENGINE-UNCHANGED'});expect(mockDb.completed).toBe(true);expect(mockDb.pass.RevokedAt).toBeTruthy();expect(mockDb.protectedRows).toEqual(protectedBefore);expect(mockDb.calls.some(c=>c.q.includes('INSERT dms_SalesAuditLog'))).toBe(true);});
test.each([{user:{...user,groupId:2}},{reason:'short'},{expectedChassis:''}])('invalid or unauthorized reopen rejected before SQL',async change=>{const tx=fixture();await expect(reopenBookingDelivery(tx,{...input,...change,apply:true})).rejects.toThrow();expect(tx.query).not.toHaveBeenCalled();});
test.each([{noSetup:true},{noBooking:true},{booking:{Status:'PendingPayment'}},{vehicle:{ChasisNo:'OTHER'}},{vehicle:{CurrentBookingID:2}},{vehicle:{MasterInvoiceVoucherID:99}},{pass:{GatePassNo:'OTHER'}},{voucher:{Status:'Reversed'}},{conflict:true},{otherPass:true},{invoice:true},{cheque:true}])('unsafe/stale delivery cannot be reopened: %p',async options=>{const tx=fixture(options);await expect(reopenBookingDelivery(tx,{...input,apply:true})).rejects.toThrow();expect(postReversalVoucher).not.toHaveBeenCalled();expect(mockDb.reopen).toBeUndefined();});
test.each([{reverseFails:true},{auditFailure:true},{stillLocked:true},{changePayment:true}])('transaction caller receives errors rather than committing unsafe changes: %p',async options=>{const tx=fixture(options);await expect(reopenBookingDelivery(tx,{...input,apply:true})).rejects.toThrow();});
