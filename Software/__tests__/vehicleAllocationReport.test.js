jest.mock('../config/db',()=>({getPool:jest.fn(),sql:{Bit:'bit',NVarChar:()=> 'text'}}));
const {getPool}=require('../config/db');
const report=require('../controllers/vehicleAllocationReportController');
const legacy=require('../controllers/salesReportsController');
const res=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function database(rows){const values={},query=jest.fn(async()=>({recordset:rows}));getPool.mockResolvedValue({request:()=>({input(k,t,v){values[k]=v;return this;},query})});return{values,query};}
beforeEach(()=>jest.clearAllMocks());

test('stock allocation report returns one vehicle row with booking/customer details and separate stock type totals',async()=>{
    const rows=[{VehicleID:1,ChasisNo:'VIN-1',BookingID:7,BookingNo:'BK-7',DMSBookingNumber:'DMS-700',CustomerName:'Ali',AllocationState:'Allocated',AllocationType:'OpenAllocation'},
        {VehicleID:2,AllocationState:'Unallocated',AllocationType:'Booked'},{VehicleID:3,AllocationState:'Review',AllocationType:'Booked'}];
    const {query,values}=database(rows),out=res();await report.report({query:{inStockOnly:'1'}},out);
    expect(out.code).toBe(200);expect(out.body.rows).toEqual(rows);expect(out.body.totals).toEqual({vehicles:3,allocated:1,unallocated:1,review:1,booked:2,openAllocation:1});
    expect(values).toMatchObject({stockOnly:true,search:null,stockStatus:null,allocationType:null,assignment:null});
    const statement=query.mock.calls[0][0];expect(statement).toContain('links.LinkCount=1 AND b.BookingID=links.BookingID');
    expect(statement).toContain('candidate.BookingID=v.CurrentBookingID OR candidate.AllocatedVehicleID=v.VehicleID');
    expect(statement).toContain("candidate.Status<>'Cancelled'");expect(statement).toContain("THEN 'Review'");
    expect(statement).toContain("VehicleStatus NOT IN ('Delivered','Sold','Returned')");
    expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
});

test.each(['NKCMCE1234','DMS-700','Muhammad Ali'])("search %s is safely bound across chassis, DMS and customer name",async search=>{
    const {query,values}=database([]),out=res();await report.report({query:{search:` ${search} `,inStockOnly:'1',stockStatus:'AtDealer',allocationType:'OpenAllocation',assignment:'Allocated'}},out);
    expect(values).toMatchObject({search:`%${search}%`,stockOnly:true,stockStatus:'AtDealer',allocationType:'OpenAllocation',assignment:'Allocated'});
    const statement=query.mock.calls[0][0];expect(statement).toContain('v.ChasisNo LIKE @search');expect(statement).toContain('searched.DMSBookingNumber LIKE @search');expect(statement).toContain('customer.PartyName LIKE @search');
    expect(statement).not.toContain(search);expect(out.body.totals.vehicles).toBe(0);
});

test('literal wildcard characters do not widen the search',async()=>{
    const {values}=database([]);await report.report({query:{search:'DMS_[1]%'}},res());expect(values.search).toBe('%DMS[_][[]1][%]%');
});

test.each([{search:['x']},{search:'x'.repeat(151)},{stockStatus:'x'},{allocationType:'Customer'},{assignment:'all'},{assignment:['Allocated']}])('invalid allocation report filter %j fails before querying',async query=>{
    const out=res();await report.report({query},out);expect(out.code).toBe(400);expect(getPool).not.toHaveBeenCalled();
});

test.each(['Booked','OpenAllocation'])('existing inventory report filters and retains %s stock type',async allocationType=>{
    database([{ChasisNo:'BOOKED',Status:'AtDealer',AllocationType:'Booked',StandardPrice:100},{ChasisNo:'OPEN',Status:'AtDealer',AllocationType:'OpenAllocation',StandardPrice:200},
        {ChasisNo:'DELIVERED',Status:'Delivered',AllocationType:allocationType,StandardPrice:900}]);
    const out=res();await legacy.vehicleInventory({query:{allocationType,inStockOnly:'1',stockStatus:'AtDealer'}},out);
    expect(out.code).toBe(200);expect(out.body.rows).toHaveLength(1);expect(out.body.rows[0].AllocationType).toBe(allocationType);expect(out.body.totals.inStock).toBe(1);
});

test('unknown stock type cannot bypass legacy inventory filtering',async()=>{
    const out=res();await legacy.vehicleInventory({query:{allocationType:'x'}},out);expect(out.code).toBe(400);expect(getPool).not.toHaveBeenCalled();
});
