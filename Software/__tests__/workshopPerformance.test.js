jest.mock('../config/db',()=>({getPool:jest.fn(),sql:{DateTime:'datetime',Int:'int',NVarChar:()=>''}}));
const {getPool}=require('../config/db');
const service=require('../services/workshopPerformanceService');
const controller=require('../controllers/workshopPerformanceController');
const router=require('../routes/serviceReportsRoutes');
const {expandAllPermissionKeys}=require('../config/permissions');
const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;}});
const filters={from:'2026-10-01',to:'2026-10-31'};
const line=(id,tech,name,net,job=1)=>({DetailId:id,JobCardId:job,TechnicianId:tech,TechnicianName:name,GrossLabour:net+10,Discount:10,RecordedHours:null,IsFinalized:true});
function fixture(rows=[]){const values={},query=jest.fn(async()=>({recordset:rows}));const pool={request:()=>({input(k,t,v){values[k]=v;return this;},query})};getPool.mockResolvedValue(pool);return{pool,values,query};}
beforeEach(()=>jest.clearAllMocks());
test('both report permissions are available in Admin Rights',()=>{
    expect(expandAllPermissionKeys()).toEqual(expect.arrayContaining(['report:mechanic_productivity','report:workshop_department_performance']));
});
test('default dates are valid Pakistan calendar dates and default to finalized revenue',()=>{
    expect(service.parseFilters({})).toMatchObject({from:expect.stringMatching(/^\d{4}-\d{2}-01$/),to:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),finalized:'finalized'});
});
test.each([{from:'2026-02-30'},{from:'2026-11-01',to:'2026-10-01'},{finalized:'invalid'},{technicianId:'3 OR 1=1'},{departmentId:-1},{view:'x'},{search:'x'.repeat(151)}])('invalid report filter is refused before SQL: %p',async change=>{
    const res=response();await controller.technicians({query:{...filters,...change}},res);expect(res.code).toBe(400);expect(getPool).not.toHaveBeenCalled();
});
test('date range is half-open and filters are bound; billing uses line Price, not legacy Quantity',async()=>{
    const {pool,values,query}=fixture();await service.technicianLines(pool,service.parseFilters({...filters,technicianId:'3',departmentId:'7',search:"a%_[x]'"}));
    const q=query.mock.calls[0][0];expect(q).toContain('j.IsFinalized=1');expect(q).toContain('<@until');expect(q).not.toContain('BETWEEN');
    expect(q).not.toMatch(/d\.Quantity|SUM\(/);expect(q).toContain('d.Price');expect(values.tech).toBe(3);expect(values.dept).toBe(7);
    expect(values.until.toISOString()).toBe('2026-11-01T00:00:00.000Z');expect(values.search).toBe("%a\\%\\_\\[x\\]'%");expect(q).not.toContain("a%_[x]'");
});
test('technician grouping counts unique jobs, preserves own line revenue and exposes unassigned work',()=>{
    const report=service.technicianReport([line(1,3,'Tech A',90),line(2,4,'Tech B',60),line(3,3,'Tech A',45),line(4,null,'Unassigned',30),line(5,3,'Tech A',200,2)],filters);
    expect(report.totals).toMatchObject({jobCards:2,jobLines:5,netLabour:425,unassignedNet:30,techs:2});
    expect(report.rows.find(r=>r.TechnicianId===3)).toMatchObject({NetLabour:335,JobCards:2,JobLines:3});
    expect(report.highest.TechnicianName).toBe('Tech A');expect(report.lowest.TechnicianName).toBe('Tech B');
});
test('same-name employees remain distinct and legacy name-only assignments are not discarded',()=>{
    const report=service.technicianReport([line(1,3,'Same name',10),line(2,4,'Same name',20),line(3,null,'Legacy name',30)],filters);
    expect(report.rows).toHaveLength(3);expect(report.totals.netLabour).toBe(60);
});
test('only valid measured time contributes hours, while missing durations remain unknown',()=>{
    const report=service.technicianReport([{...line(1,3,'A',100),RecordedHours:2,JobEndTime:'2026-10-01T12:00:00'},line(2,3,'A',20)],filters);
    expect(report.rows[0]).toMatchObject({RecordedHours:2,TimedLines:1,CompletedLines:1});expect(report.details[1].RecordedHours).toBeNull();
});
test('unassigned-only and empty periods have no invented best/worst technician',()=>{
    expect(service.technicianReport([line(1,null,'Unassigned',5)],filters)).toMatchObject({highest:null,lowest:null});
    expect(service.technicianReport([],filters).totals.jobCards).toBe(0);
});
test('equal business totals receive the same rank',()=>{
    const report=service.technicianReport([line(1,3,'A',50),line(2,4,'B',50)],filters);expect(report.rows.map(r=>r.Rank)).toEqual([1,1]);
});
test('department totals count each job once and compare net labour, parts and sublet excluding tax',()=>{
    const report=service.departmentReport([
        {JobCardId:1,JobTypeId:1,DepartmentName:'General',NetLabour:100,Parts:200,Sublet:20,IsFinalized:true},
        {JobCardId:2,JobTypeId:1,DepartmentName:'General',NetLabour:50,Parts:0,Sublet:0,IsFinalized:true},
        {JobCardId:3,JobTypeId:2,DepartmentName:'Body',NetLabour:80,Parts:0,Sublet:0,IsFinalized:false},
    ],filters);
    expect(report.totals).toMatchObject({jobCards:3,NetBusiness:450});expect(report.highest.DepartmentName).toBe('General');
    expect(report.highest).toMatchObject({JobCards:2,NetBusiness:370,AveragePerJob:185});expect(report.lowest.DepartmentName).toBe('Body');
});
test('department SQL aggregates sources independently, preventing labour/parts/sublet multiplication',async()=>{
    const {pool,query}=fixture();await service.departmentJobs(pool,service.parseFilters(filters));const q=query.mock.calls[0][0];
    expect(q.match(/OUTER APPLY/g)).toHaveLength(3);expect(q).toContain('h.JobCardId=j.JobCardId');expect(q).not.toContain('TaxAmount');expect(q).toContain('d.DiscAmt');
});
test('API detail view returns exact work lines while keeping totals across the full dataset',async()=>{
    fixture([line(1,3,'A',90),line(2,4,'B',60)]);const res=response();await controller.technicians({query:{...filters,view:'details'}},res);
    expect(res.body.rows.map(r=>r.DetailId)).toEqual([1,2]);expect(res.body.totals.netLabour).toBe(150);expect(res.body.details).toBeUndefined();
});
test.each([['/technician-performance','report:mechanic_productivity'],['/mechanic-productivity','report:mechanic_productivity'],['/department-performance','report:workshop_department_performance']])('report route %s enforces its permission', (path,key)=>{
    const route=router.stack.find(l=>l.route?.path===path).route,next=jest.fn(),res=response();
    route.stack[0].handle({user:{groupId:2,permissions:[]}},res,next);expect(res.code).toBe(403);expect(next).not.toHaveBeenCalled();
    route.stack[0].handle({user:{groupId:2,permissions:[key]}},response(),next);expect(next).toHaveBeenCalled();
});
