jest.mock('../config/db',()=>({
    getPool:jest.fn(),sql:{Int:'Int',NVarChar:()=> 'NVarChar',Decimal:()=> 'Decimal',
        Request:class{constructor(tx){this.tx=tx;}input(){return this;}query(){return this.tx.query();}}}
}));
jest.mock('../controllers/salesDocumentController',()=>({}));
jest.mock('../services/masterPaymentPositionService',()=>({loadMasterPosition:jest.fn()}));
const {getPool}=require('../config/db');
const {loadMasterPosition}=require('../services/masterPaymentPositionService');
const lc=require('../controllers/salesLifecycleController');
let mockBooking;
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
beforeEach(()=>{
    jest.clearAllMocks();
    const row={BookingID:30,Status:'Allocated',AllocatedVehicleID:31,NegotiatedPrice:1000,
        AmountPaidToDate:1000,WholesalePrice:1000,ChasisNo:'TEST-CHASSIS',VariantCode:'OSHAN'};
    mockBooking=row;
    getPool.mockResolvedValue({request(){return{input(){return this;},async query(query){
        return{recordset:query.includes('FROM dms_SystemAccounts')?[{GLCAID:201}]:[row]};
    }}}});
});
it('allows a fully paid booking when its historical direct pay order covers Master',async()=>{
    loadMasterPosition.mockResolvedValue([{GLCAID:101,Net:1000}]);const res=response();
    await lc.deliveryReadiness({params:{id:'30'}},res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ready:true,blockingReasons:[],
        masterRemittance:expect.objectContaining({remitted:1000,shortfall:0,enforceable:true})}));
});
it('BK-2026-0006 is ready when Master explicitly accepted the discounted commercial price',async()=>{
    Object.assign(mockBooking,{NegotiatedPrice:3380000,AmountPaidToDate:3380000,WholesalePrice:3430700,MasterAgreedAmount:3380000});
    loadMasterPosition.mockResolvedValue([{GLCAID:101,Net:3380000}]);const res=response();
    await lc.deliveryReadiness({params:{id:'6'}},res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ready:true,blockingReasons:[],
        masterRemittance:expect.objectContaining({definedRate:3380000,remitted:3380000,shortfall:0})}));
});
it('still blocks a genuine Master shortfall',async()=>{
    loadMasterPosition.mockResolvedValue([{GLCAID:101,Net:900}]);const res=response();
    await lc.deliveryReadiness({params:{id:'30'}},res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ready:false,
        masterRemittance:expect.objectContaining({remitted:900,shortfall:100})}));
});
it('does not declare readiness when the Master balance query fails',async()=>{
    loadMasterPosition.mockRejectedValue(new Error('Balance read failed'));const res=response();
    await lc.deliveryReadiness({params:{id:'30'}},res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({error:'Balance read failed'});
});

it('allows explicit historical Master confirmation without any voucher match',async()=>{
 mockBooking.IsHistorical=true;mockBooking.HistoricalMasterApprovedAmount=1000;
 loadMasterPosition.mockResolvedValue([]);const res=response();await lc.deliveryReadiness({params:{id:'30'}},res);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ready:true,masterRemittance:expect.objectContaining({remitted:1000,ledgerRemitted:0,approvedAmount:1000})}));
});
it('does not add approval to the same matched pay order twice',async()=>{
 mockBooking.IsHistorical=true;mockBooking.HistoricalMasterApprovedAmount=1000;
 loadMasterPosition.mockResolvedValue([{GLCAID:101,Net:1000}]);const res=response();await lc.deliveryReadiness({params:{id:'30'}},res);
 expect(res.json.mock.calls[0][0].masterRemittance.remitted).toBe(1000);
});
it('cannot use a historical confirmation on a normal booking',async()=>{
 mockBooking.IsHistorical=false;mockBooking.HistoricalMasterApprovedAmount=1000;
 loadMasterPosition.mockResolvedValue([]);const res=response();await lc.deliveryReadiness({params:{id:'30'}},res);
 expect(res.json.mock.calls[0][0].ready).toBe(false);
});
