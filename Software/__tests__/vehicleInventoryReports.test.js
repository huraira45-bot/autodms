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

test.each(['AtDealer', 'InTransit', 'AtMaster', 'Allocated'])('detailed inventory filters %s before computing totals', async stockStatus => {
    database([['AtDealer', 'InTransit', 'AtMaster', 'Allocated', 'Delivered', 'Returned'].map((Status, index) => ({
        ChasisNo: `TEST-${index}`, Status, StandardPrice: 100, ModelName: 'Model',
    })).concat([{ ChasisNo: 'STALE-DELIVERED', Status: stockStatus, ReportStatus: 'Delivered', StandardPrice: 900 }])]);
    const res = response(); await legacyReports.vehicleInventory({ query: { stockStatus, inStockOnly: '1' } }, res);
    const count = stockStatus === 'AtDealer' ? 2 : 1;
    expect(res.code).toBe(200); expect(res.data.rows).toHaveLength(count);
    expect(res.data.rows.every(row => stockStatus === 'Allocated' ? row.Status === 'Allocated' : row.StockPosition === stockStatus)).toBe(true);
    expect(res.data.totals).toMatchObject({ total: count, inStock: count, valueInStock: count * 100 });
});

test.each(['AtDealer', 'InTransit'])('variant stock summary binds %s before grouping and drops empty variants', async stockStatus => {
    const { values, query } = database([[{ VariantID: 1, TotalVehicles: 2, InStock: 2, AtDealer: stockStatus === 'AtDealer' ? 2 : 0,
        InTransit: stockStatus === 'InTransit' ? 2 : 0, AtMaster: 0, Allocated: 0, Delivered: 0, Returned: 0, OpenAllocation: 0 },
        { VariantID: 2, TotalVehicles: 0, InStock: 0 }]]);
    const res = response(); await reports.summary({ query: { stockStatus, modelId: '1', variantId: '2', inStockOnly: '1' } }, res);
    expect(values).toMatchObject({ stockStatus, model: 1, variant: 2, stockOnly: true });
    const statement = query.mock.calls[0][0];
    expect(statement).toContain('StockPosition=@stockStatus');
    expect(statement.indexOf('StockPosition=@stockStatus')).toBeLessThan(statement.indexOf('COUNT(s.VehicleID)'));
    expect(statement).toContain("THEN 'Delivered' ELSE v.Status END AS Status");
    expect(res.data.rows).toHaveLength(1); expect(res.data.totals).toMatchObject({ variants: 1, TotalVehicles: 2, InStock: 2, [stockStatus]: 2 });
});

test.each(['AtDealer OR 1=1', ['AtDealer'], 'In Transit', 'Returned'])('invalid stock status %p is rejected by both reports before database access', async stockStatus => {
    for (const report of [reports.summary, legacyReports.vehicleInventory]) {
        const res = response(); await report({ query: { stockStatus } }, res);
        expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
    }
});
test('At Dealer includes allocated dealer vehicles but not allocated vehicles still in transit or delivered',async()=>{
    database([[{ChasisNo:'DEALER',Status:'AtDealer',StandardPrice:100},
        {ChasisNo:'ALLOCATED-HERE',Status:'Allocated',RecordedStockPosition:'AtDealer',StandardPrice:200},
        {ChasisNo:'ALLOCATED-TRANSIT',Status:'Allocated',RecordedStockPosition:'InTransit',StandardPrice:300},
        {ChasisNo:'GATE-PASS',Status:'Allocated',RecordedStockPosition:'AtDealer',ReportStatus:'Delivered',StandardPrice:400}]]);
    const res=response();await legacyReports.vehicleInventory({query:{inStockOnly:'1',stockStatus:'AtDealer'}},res);
    expect(res.data.rows.map(row=>row.ChasisNo)).toEqual(['DEALER','ALLOCATED-HERE']);
    expect(res.data.totals).toMatchObject({total:2,inStock:2,valueInStock:300,allocated:1,byStatus:{AtDealer:2}});
    const transit=response();await legacyReports.vehicleInventory({query:{stockStatus:'InTransit'}},transit);
    expect(transit.data.rows.map(row=>row.ChasisNo)).toEqual(['ALLOCATED-TRANSIT']);
});

test('location summary counts allocated units within their location and retains allocation as a subset',async()=>{
    const{query}=database([[{TotalVehicles:3,InStock:3,AtDealer:2,InTransit:1,AtMaster:0,Allocated:2,Delivered:0,Returned:0,OpenAllocation:0}]]);
    const res=response();await reports.summary({query:{}},res);const statement=query.mock.calls[0][0];
    expect(statement).toContain("SUM(CASE WHEN s.StockPosition='AtDealer'");
    expect(statement).toContain("SUM(CASE WHEN s.Status='Allocated'");
    expect(res.data.totals).toMatchObject({TotalVehicles:3,InStock:3,AtDealer:2,InTransit:1,Allocated:2});
});

test('operational At Dealer filter uses retained location and rejects delivery locks',async()=>{
    const catalog=require('../controllers/salesCatalogController'),{query}=database([[]]),res=response();
    await catalog.listVehicles({query:{status:'AtDealer'}},res);expect(res.code).toBe(200);
    const statement=query.mock.calls[0][0];expect(statement).toContain("CASE WHEN v.Status='Allocated'");expect(statement).toContain("locationHistory.ToStatus IN ('AtDealer','InTransit','AtMaster')");expect(statement).toContain("ELSE v.Status END)='AtDealer' AND NOT");
});