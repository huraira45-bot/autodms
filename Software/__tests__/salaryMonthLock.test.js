const mockQuery=jest.fn(),mockCalls=[],mockTransactions=[];
jest.mock('../config/db',()=>({getPool:jest.fn(async()=>({})),sql:{
    Request:class{constructor(parent){this.parent=parent;this.values={};}input(k,t,v){this.values[k]=v;return this;}query(q){mockCalls.push({q,v:this.values});return mockQuery(q,this.values);}},
    Char:()=>'',VarChar:()=>'',NVarChar:()=>'',Decimal:()=>'',Int:'',MAX:'',ISOLATION_LEVEL:{SERIALIZABLE:''},
    Transaction:class{constructor(){this.begin=jest.fn(async()=>{});this.commit=jest.fn(async()=>{});this.rollback=jest.fn(async()=>{});mockTransactions.push(this);}}
}}));
const snapshots=require('../services/salarySheetSnapshotService');
const {setMonthLock,requireAdmin}=require('../services/salaryMonthLockService');
const controller=require('../controllers/hrSalaryController');
const lockController=require('../controllers/salaryMonthLockController');
const router=require('../routes/hrSalaryRoutes');
const user={groupId:1,userId:1,userName:'Admin'};
const sheet={monthId:'2026-10',rows:[{EmployeeID:10,Name:'Original',Calc:{net:100}}],totalNet:100};
const original={MonthID:sheet.monthId,SnapshotVersion:1,SheetJSON:JSON.stringify(sheet),SnapshotBasis:'LEGACY_CURRENT',FirstVoucherID:7};
const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;}});
function fixture({control=null,postings=[{VoucherStatus:'Reversed'}],saved=original,failAppend=false}={}){
    const state={control,saved,postings};
    mockQuery.mockImplementation(async(q,v)=>{
        if(q.includes('SELECT TOP(1) * FROM hr_SalarySheetLockHistory'))return{recordset:state.control?[state.control]:[]};
        if(q.includes('SELECT * FROM hr_SalarySheetSnapshots'))return{recordset:state.saved?[state.saved]:[]};
        if(q.includes('FROM hr_SalaryPostings p'))return{recordset:state.postings};
        if(q.includes('INSERT hr_SalarySheetLockHistory')){
            if(failAppend)throw new Error('Audit storage failed');
            state.control={ControlID:(state.control?.ControlID||0)+1,MonthID:v.m,Action:v.action,SheetJSON:v.json,SnapshotVersion:1,
                SnapshotBasis:v.basis,FirstVoucherID:v.voucher,CapturedByName:v.name,Reason:v.reason};
        }
        return{recordset:[]};
    });
    return state;
}
const input={monthId:'2026-10',locked:false,reason:'Owner requested correction',user,expectedControlId:null};
beforeEach(()=>{mockCalls.length=0;mockTransactions.length=0;mockQuery.mockReset();});

test('lock endpoint is main-Admin only even for payroll permission holders',()=>{
    const guard=router.stack.find(l=>l.route?.path==='/salary-sheet/:monthId/lock').route.stack[0].handle;
    const next=jest.fn(),res=response();guard({user:{groupId:2,permissions:['hr_salary:edit','hr_salary_post']}},res,next);
    expect(res.code).toBe(403);expect(next).not.toHaveBeenCalled();
    guard({user},response(),next);expect(next).toHaveBeenCalled();
});
test.each([{monthId:'2026-09'},{monthId:'2026-13'},{locked:'false'},{reason:'x'},{expectedControlId:undefined},{user:{groupId:2}}])('refuses invalid/unauthorized control request %j',async change=>{
    fixture();await expect(setMonthLock({}, {...input,...change})).rejects.toBeInstanceOf(Error);
    expect(mockCalls.some(c=>c.q.includes('INSERT'))).toBe(false);
});
test.each(['Posted','Draft',null,undefined])('unlock refuses active/orphaned salary voucher status %p',async status=>{
    fixture({postings:[{VoucherStatus:status}]});await expect(setMonthLock({},input)).rejects.toMatchObject({status:409});
    expect(mockCalls.some(c=>c.q.includes('INSERT'))).toBe(false);
});
test('October unlock appends audit event without deleting original sheet or financial records',async()=>{
    const state=fixture();expect(await setMonthLock({},input)).toMatchObject({locked:false,changed:true});
    expect(state.saved).toEqual(original);expect(state.control).toMatchObject({Action:'UNLOCK',CapturedByName:'Admin',SheetJSON:null});
    expect(await snapshots.getSnapshot({},'2026-10')).toBeNull();await expect(snapshots.assertEditable({},'2026-10')).resolves.toBeUndefined();
    expect(mockCalls.some(c=>/UPDATE|DELETE|MERGE/.test(c.q))).toBe(false);
});
test('unlocked month keeps edit protection if a non-reversed posting appears',async()=>{
    fixture({control:{ControlID:1,Action:'UNLOCK'},postings:[{VoucherStatus:'Posted'}]});
    await expect(snapshots.assertEditable({},'2026-10')).rejects.toMatchObject({status:423});
});
test('re-lock captures revised figures; old saved JSON remains intact and subsequent reads stay fixed',async()=>{
    const state=fixture({control:{ControlID:1,Action:'UNLOCK'}}),revised={...sheet,totalNet:250,rows:[{EmployeeID:10,Calc:{net:250}}]};
    const buildLiveSheet=jest.fn(async()=>revised);
    await setMonthLock({}, {...input,locked:true,expectedControlId:1,buildLiveSheet});
    expect(buildLiveSheet).toHaveBeenCalledTimes(1);expect(state.saved.SheetJSON).toBe(original.SheetJSON);
    expect(await snapshots.getSnapshot({},'2026-10')).toMatchObject({isFrozen:true,totalNet:250,snapshot:{basis:'MANUAL'},lockControl:{action:'LOCK'}});
    revised.totalNet=900;expect((await snapshots.getSnapshot({},'2026-10')).totalNet).toBe(250);
    await expect(snapshots.assertEditable({},'2026-10')).rejects.toMatchObject({status:423});
});
test('reposting after unlock re-locks a fresh revision instead of overwriting the original',async()=>{
    const state=fixture({control:{ControlID:1,Action:'UNLOCK'}});
    await snapshots.freezeSnapshot({}, {...sheet,totalNet:333},user,'LEGACY_CURRENT',8);
    expect(state.saved.SheetJSON).toBe(original.SheetJSON);
    expect(await snapshots.getSnapshot({},'2026-10')).toMatchObject({totalNet:333,isFrozen:true,snapshot:{basis:'POSTED',firstVoucherId:8}});
});
test('stale control and audit-storage failures abort the action',async()=>{
    fixture({control:{ControlID:2,Action:'UNLOCK'}});await expect(setMonthLock({},input)).rejects.toMatchObject({status:409});
    fixture({failAppend:true});await expect(setMonthLock({},input)).rejects.toThrow('Audit storage failed');
});
test('months before October keep the original immutable snapshot behavior',async()=>{
    fixture({saved:{...original,SheetJSON:JSON.stringify({...sheet,monthId:'2026-09'})}});
    expect((await snapshots.getSnapshot({},'2026-09')).isFrozen).toBe(true);
    expect(mockCalls.some(c=>c.q.includes('hr_SalarySheetLockHistory'))).toBe(false);
});
test('corrupt current lock revision is refused rather than silently rebuilt',async()=>{
    fixture({control:{ControlID:2,Action:'LOCK',SnapshotVersion:1,SheetJSON:'{}'}});
    await expect(controller._buildSheet({},'2026-10')).rejects.toThrow('invalid');
});
test('lock API commits successful unlock, but rolls back if the history insert fails',async()=>{
    for(const failAppend of [false,true]){
        fixture({failAppend});const res=response();
        await lockController.update({user,params:{monthId:'2026-10'},body:{Locked:false,Reason:'Owner requested correction',ExpectedControlID:null}},res);
        expect(res.code).toBe(failAppend?500:200);
        const tx=mockTransactions[mockTransactions.length-1];
        expect(failAppend?tx.rollback:tx.commit).toHaveBeenCalledTimes(1);
        expect(failAppend?tx.commit:tx.rollback).not.toHaveBeenCalled();
    }
});
test('missing control migration returns an actionable setup error',async()=>{
    mockQuery.mockRejectedValue({number:208,message:"Invalid object name 'hr_SalarySheetLockHistory'."});
    await expect(snapshots.getControl({},'2026-10')).rejects.toMatchObject({status:503,message:expect.stringContaining('169_salary_month_lock_controls.sql')});
});
