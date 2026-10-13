jest.mock('../config/db',()=>({
    getPool:jest.fn(),sql:{Int:'Int',NVarChar:()=> 'NVarChar',Decimal:()=> 'Decimal',
        Request:class{constructor(tx){this.tx=tx;}input(){return this;}query(){return this.tx.query();}}}
}));
jest.mock('../controllers/salesDocumentController',()=>({}));
jest.mock('../services/masterPaymentPositionService',()=>({loadMasterPosition:jest.fn()}));
const {getPool}=require('../config/db');
const {loadMasterPosition}=require('../services/masterPaymentPositionService');
const lc=require('../controllers/salesLifecycleController');
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
beforeEach(()=>{
    jest.clearAllMocks();
    const row={BookingID:30,Status:'Allocated',AllocatedVehicleID:31,NegotiatedPrice:1000,
        AmountPaidToDate:1000,WholesalePrice:1000,ChasisNo:'TEST-CHASSIS',VariantCode:'OSHAN'};
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
