jest.mock('../config/db',()=>({getPool:jest.fn(),sql:{Int:'int',Bit:'bit',NVarChar:()=> 'text',DateTime2:'datetime2'}}));
const{getPool}=require('../config/db');const reports=require('../controllers/vehicleInventoryReportController');
const legacyReports=require('../controllers/salesReportsController');
const response=()=>({code:200,status(code){this.code=code;return this;},json(data){this.data=data;}});
function database(recordsets){
    const values={},query=jest.fn(async()=>({recordsets,recordset:recordsets[0]}));
    getPool.mockResolvedValue({request:()=>({input(key,type,value){values[key]=value;return this;},query})});return{values,query};
}
beforeEach(()=>jest.clearAllMocks());
test('variant summary binds filters and sums only the variants still in stock when selected',async()=>{
    const{values,query}=database([[{VariantID:1,InStock:2,TotalVehicles:2,Delivered:0,AtMaster:0,InTransit:0,AtDealer:1,Allocated:1,Returned:0,OpenAllocation:1},
        {VariantID:2,InStock:0,TotalVehicles:0,Delivered:0,AtMaster:0,InTransit:0,AtDealer:0,Allocated:0,Returned:0,OpenAllocation:0}]]);
    const res=response();await reports.summary({query:{modelId:'1',variantId:'2',search:"O'Brien",inStockOnly:'1'}},res);
    expect(values).toMatchObject({model:1,variant:2,search:"%O'Brien%",stockOnly:true});expect(res.data.rows).toHaveLength(1);
    expect(res.data.totals).toMatchObject({InStock:2,TotalVehicles:2,Delivered:0,variants:1});
    expect(query.mock.calls[0][0]).toContain("s.Status NOT IN ('Delivered','Sold','Returned')");
    expect(query.mock.calls[0][0]).not.toContain("O'Brien");
});

test('inventory list includes booked/allocated stock but excludes delivered, sold and returned rows before totals',async()=>{
    database([['AtDealer','AtMaster','InTransit','Allocated','Delivered','Sold','Returned'].map((Status,index)=>({
        ChasisNo:'TEST-'+index,Status,AllocationType:'Booked',StandardPrice:100,ModelName:'Test',
    }))]);
    const res=response();await legacyReports.vehicleInventory({query:{inStockOnly:'1'}},res);
    expect(res.data.rows.map(row=>row.Status)).toEqual(['AtDealer','AtMaster','InTransit','Allocated']);
    expect(res.data.totals).toMatchObject({total:4,inStock:4,valueInStock:400});
    expect(res.data.totals.byStatus).not.toHaveProperty('Delivered');
});

test('a gate-pass delivery cannot appear in stock through a stale saved vehicle status',async()=>{
    database([[{ChasisNo:'STALE',Status:'AtDealer',ReportStatus:'Delivered',StandardPrice:100}]]);
    const stock=response();await legacyReports.vehicleInventory({query:{inStockOnly:'1'}},stock);
    expect(stock.data.rows).toEqual([]);expect(stock.data.totals.inStock).toBe(0);
    const all=response();await legacyReports.vehicleInventory({query:{}},all);
    expect(all.data.rows[0].Status).toBe('Delivered');expect(all.data.totals.inStock).toBe(0);
});

test('all-records inventory view retains returned and delivered rows without counting them as stock',async()=>{
    database([[{ChasisNo:'STOCK',Status:'Allocated',StandardPrice:100},{ChasisNo:'DELIVERY',Status:'Sold',StandardPrice:200},
        {ChasisNo:'RETURN',Status:'Returned',StandardPrice:300}]]);
    const res=response();await legacyReports.vehicleInventory({query:{}},res);
    expect(res.data.rows).toHaveLength(3);expect(res.data.totals).toMatchObject({total:3,inStock:1,valueInStock:100});
});
test('ledger date bounds use Pakistan midnight and running balance is calculated before period filtering',async()=>{
    const{values,query}=database([[{StartedAtUtc:new Date('2026-10-24T06:00Z')}],
        [{VariantID:1,Opening:2,QuantityIn:1,QuantityOut:1,Closing:2}],
        [{MovementID:1,VariantID:1,OccurredAtUtc:new Date('2026-10-24T06:00Z'),EntryType:'Opening',QuantityIn:2,QuantityOut:0,Balance:2}]]);
    const res=response();await reports.ledger({query:{from:'2026-10-24',to:'2026-10-24',variantId:'1'}},res);
    expect(values.from.toISOString()).toBe('2026-10-23T19:00:00.000Z');
    expect(values.to.toISOString()).toBe('2026-10-24T19:00:00.000Z');
    expect(res.data.rows[0]).toMatchObject({OpeningQuantity:2,QuantityIn:0,Balance:2});
    expect(res.data.totals).toEqual({Opening:2,QuantityIn:1,QuantityOut:1,Closing:2});
    const sql=query.mock.calls[0][0];
    expect(sql.indexOf('PARTITION BY l.VariantID ORDER BY l.OccurredAtUtc,l.MovementID')).toBeLessThan(sql.lastIndexOf('WHERE @from IS NULL'));
    expect(sql).toContain("l.EntryType<>'Opening'");
});
test.each([{from:'2026-02-30'},{from:'0000-01-01'},{from:'2026-10-25',to:'2026-10-24'},{variantId:'1;DROP'},{modelId:['1']}])('invalid report filters return 400 before querying: %j',async query=>{
    const res=response();await reports.ledger({query},res);expect(res.code).toBe(400);expect(getPool).not.toHaveBeenCalled();
});
test('missing migration gives an actionable setup message',async()=>{
    getPool.mockRejectedValue(Object.assign(new Error('Missing table'),{number:208}));const res=response();
    await reports.ledger({query:{}},res);expect(res.code).toBe(503);expect(res.data.error).toContain('administrator');
});
test('a period before the opening snapshot does not falsely report zero historical stock',async()=>{
    database([[{StartedAtUtc:new Date('2026-10-24T06:00Z')}],[],[]]);const res=response();
    await reports.ledger({query:{from:'2026-10-01',to:'2026-10-20'}},res);
    expect(res.code).toBe(400);expect(res.data.error).toContain('before vehicle inventory tracking');
});
test('report options retain historical variants and derive distinct models',async()=>{
    const{query}=database([[{VariantID:1,ModelID:7,ModelName:'Model'},{VariantID:2,ModelID:7,ModelName:'Model'}]]);
    const res=response();await reports.options({},res);expect(res.data.models).toHaveLength(1);expect(res.data.variants).toHaveLength(2);
    expect(query.mock.calls[0][0]).toContain('dms_VehicleInventoryLedger');
});
