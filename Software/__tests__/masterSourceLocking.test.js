const mockCalls=[];let mockSources;
jest.mock('../config/db',()=>({sql:{Int:'Int',Request:class{
 constructor(owner){this.owner=owner;this.values={};}
 input(k,_t,v){this.values[k]=v;return this;}
 async query(q){mockCalls.push({q,values:{...this.values},owner:this.owner});
  if(q.includes('SELECT p.VoucherID FROM dms_SalesPayments'))return {recordset:mockSources};
  if(q.startsWith('SELECT VoucherID FROM data_FinanceVoucherInfo'))return {recordset:[{VoucherID:this.values.vid}]};
  return {recordset:[{GLCAID:32185,Dr:1000,Cr:0,Net:1000}]};
 }
}}}));
const {loadMasterPosition,MASTER_SOURCE_IDS_SQL,MASTER_SOURCE_LOCK_SQL}=require('../services/masterPaymentPositionService');
beforeEach(()=>{mockCalls.length=0;mockSources=[{VoucherID:163},{VoucherID:88},{VoucherID:163}];});
it('locks only discovered voucher IDs in a stable order before reading capacity',async()=>{
 const tx={};await expect(loadMasterPosition(tx,265,32955,true)).resolves.toEqual([{GLCAID:32185,Dr:1000,Cr:0,Net:1000}]);
 expect(mockCalls[0]).toMatchObject({q:MASTER_SOURCE_IDS_SQL,values:{bid:265},owner:tx});
 expect(mockCalls.slice(1,3)).toEqual([
  expect.objectContaining({q:MASTER_SOURCE_LOCK_SQL,values:{vid:88},owner:tx}),
  expect.objectContaining({q:MASTER_SOURCE_LOCK_SQL,values:{vid:163},owner:tx})]);
 expect(mockCalls[3].values).toEqual({bid:265,gl:32955});
});
it('does not scan/lock the voucher table when no linked sources exist',async()=>{
 mockSources=[];await loadMasterPosition({},265,32955,true);
 expect(mockCalls).toHaveLength(2);
 expect(mockCalls.some(call=>call.q===MASTER_SOURCE_LOCK_SQL)).toBe(false);
});
it('leaves read-only readiness queries without source locking',async()=>{
 await loadMasterPosition({},265,32955,false);
 expect(mockCalls).toHaveLength(1);expect(mockCalls[0].q).not.toContain('UPDLOCK');
});
