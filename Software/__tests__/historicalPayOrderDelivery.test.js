jest.mock('../config/db',()=>({sql:{
    Int:'Int',DateTime:'DateTime',MAX:'MAX',Decimal:()=> 'Decimal',NVarChar:()=> 'NVarChar',
    Request:class{constructor(tx){this.tx=tx;this.values={};}input(key,_type,value){this.values[key]=value;return this;}
        query(query){this.tx.calls.push({query,values:{...this.values}});return this.tx.query(query,this.values);}}
}}));
jest.mock('../controllers/systemAccountsController',()=>({resolveRole:jest.fn(async role=>({
    BOOKING_ADVANCE:300,BOOKING_VARIANT_RECEIVABLE:201,PREMIUM_DEFERRED:401,PREMIUM_INCOME:402
})[role])}));
jest.mock('../utils/voucherNumbering',()=>({nextVoucherNo:jest.fn(async()=> 'JV-TEST-1')}));
jest.mock('../services/masterPaymentPositionService',()=>({loadMasterPosition:jest.fn()}));
jest.mock('../services/salesNarration',()=>({
    loadNarrationContext:jest.fn(async()=>({})),customerText:()=> 'Customer',vehicleText:()=> 'Oshan',
    forVehicleAndBooking:()=> 'booking BK-TEST',accountTitle:jest.fn(async(_tx,gl)=> 'Account '+gl),
    line:parts=>parts.filter(Boolean).join(' ')
}));
const {loadMasterPosition}=require('../services/masterPaymentPositionService');
const {postDeliveryVoucher}=require('../services/salesDeliveryPostingService');
function transaction(price=1000,premium=0){
    const tx={calls:[],query:jest.fn(async(query)=>{
        if(query.includes('SELECT b.BookingID'))return {recordset:[{BookingID:7,BookingNo:'BK-TEST',PartyID:10,NegotiatedPrice:price,WholesalePrice:price,PremiumAmount:premium}]};
        if(query.includes('SELECT PartyGLID'))return {recordset:[{PartyGLID:301}]};
        if(query.includes('SELECT Voucherid FROM GLVoucherType'))return {recordset:[{Voucherid:1}]};
        if(query.includes('INSERT INTO data_FinanceVoucherInfo'))return {recordset:[{VoucherID:77}]};
        return {recordset:[],rowsAffected:[1]};
    })};return tx;
}
const details=tx=>tx.calls.filter(call=>call.query.includes('INSERT INTO data_FinanceVoucherDetail')).map(call=>call.values);
beforeEach(()=>jest.clearAllMocks());
it('settles the legacy Oshan debit on the same account without creating another payment',async()=>{
    loadMasterPosition.mockResolvedValue([{GLCAID:101,Dr:1000,Cr:0,Net:1000}]);
    const tx=transaction();
    await expect(postDeliveryVoucher(7,{userId:1},tx)).resolves.toBe(77);
    expect(loadMasterPosition).toHaveBeenCalledWith(tx,7,201,true);
    expect(tx.calls[0].query).toContain('WITH (UPDLOCK,HOLDLOCK)');
    expect(details(tx)).toEqual([expect.objectContaining({gl:301,dr:1000,cr:0}),expect.objectContaining({gl:101,dr:0,cr:1000})]);
    expect(details(tx).some(line=>line.gl===201)).toBe(false);
    const header=tx.calls.find(call=>call.query.includes('INSERT INTO data_FinanceVoucherInfo'));
    expect(header.values).toMatchObject({src:'SALES_DELIVERY',tot:1000,srcId:7});
    expect(header.query).toContain("'Draft'");
});
it('balances mixed legacy/current Master settlements and premium separately',async()=>{
    loadMasterPosition.mockResolvedValue([{GLCAID:101,Dr:1000,Cr:0,Net:1000},{GLCAID:201,Dr:500,Cr:0,Net:500}]);
    const tx=transaction(1500,50);
    await postDeliveryVoucher(7,{},tx);
    expect(details(tx)).toEqual(expect.arrayContaining([
        expect.objectContaining({gl:101,dr:0,cr:1000}),expect.objectContaining({gl:201,dr:0,cr:500}),
        expect.objectContaining({gl:301,dr:1500,cr:0}),expect.objectContaining({gl:401,dr:50,cr:0}),
        expect.objectContaining({gl:402,dr:0,cr:50})
    ]));
    expect(details(tx).reduce((sum,line)=>sum+line.dr-line.cr,0)).toBe(0);
});
it.each([[],[{GLCAID:101,Dr:900,Cr:0,Net:900}],[{GLCAID:101,Dr:1000,Cr:1000,Net:0}]].map(position=>[position]))(
    'refuses insufficient or reversed/settled balances before creating a voucher',async position=>{
        loadMasterPosition.mockResolvedValue(position);const tx=transaction();
        await expect(postDeliveryVoucher(7,{},tx)).rejects.toThrow('has not been remitted');
        expect(details(tx)).toEqual([]);
        expect(tx.calls.some(call=>call.query.includes('INSERT INTO data_FinanceVoucherInfo'))).toBe(false);
    });
it('refuses an over-settled account rather than writing an unbalanced journal',async()=>{
    loadMasterPosition.mockResolvedValue([{GLCAID:101,Dr:1500,Cr:0,Net:1500},{GLCAID:201,Dr:0,Cr:500,Net:-500}]);
    const tx=transaction();await expect(postDeliveryVoucher(7,{},tx)).rejects.toThrow('over-settled');
    expect(details(tx)).toEqual([]);
});
