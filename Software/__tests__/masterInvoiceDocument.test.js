jest.mock('../config/db',()=>({getPool:jest.fn(),sql:{Int:'int',BigInt:'bigint',Date:'date',DateTime:'datetime',MAX:'max',
    NVarChar:()=> 'nvarchar',Decimal:()=> 'decimal',
    Transaction:class{constructor(pool){return pool.tx;}},Request:class{
        constructor(tx){this.tx=tx;this.values={};}input(k,t,v){this.values[k]=v;return this;}query(q){return this.tx.query(q,this.values);}
    }}}));
const fs=require('fs'),path=require('path');
const {getPool}=require('../config/db');
const {recordMasterInvoiceDocument,validateInvoice}=require('../services/bookingMasterInvoiceDocumentService');
const {requireUploadedMasterInvoice}=require('../services/masterInvoiceAccrualGuard');
const controller=require('../controllers/bookingMasterInvoiceDocumentController');
const user={userId:1,userName:'Master clerk',employeeId:3,modules:['sales_master_settlement']};
const file={path:path.resolve(__dirname,'../uploads/sales/unit-invoice.pdf'),originalname:'master.pdf',mimetype:'application/pdf',size:100};
const input={bookingId:7,invoiceNo:'MASTER-123',invoiceDate:'2026-10-17',notes:'Received tax invoice',file,user};
const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;}});
function fixture(options={}){
    const initial={booking:{BookingID:7,Status:'Closed',IsHistorical:false,AllocatedVehicleID:4,...options.booking},invoice:options.invoice || null,documents:[],audits:[]};
    const tx={state:structuredClone(initial),calls:[],begin:jest.fn(async()=>{}),commit:jest.fn(async()=>{}),rollback:jest.fn(async()=>{tx.state=structuredClone(initial);})};
    tx.query=jest.fn(async(q,v)=>{
        tx.calls.push({q,v});
        if(q.includes('SELECT BookingID,Status FROM') || q.includes('SELECT Status,IsHistorical'))return{recordset:options.missing?[]:[{...tx.state.booking}]};
        if(q.includes('SELECT m.*'))return{recordset:tx.state.invoice?[structuredClone(tx.state.invoice)]:[]};
        if(q.includes('SELECT m.InvoiceNo'))return{recordset:tx.state.invoice && !tx.state.invoice.DeletedAt?[structuredClone(tx.state.invoice)]:[]};
        if(q.includes('SELECT TOP(1) AccrualID'))return{recordsets:[options.accrual?[{AccrualID:1}]:[],options.voucher?[{VoucherID:2}]:[]]};
        if(q.includes('INSERT INTO dms_SalesDocuments')){tx.state.documents.push(v);return{recordset:[{DocumentID:77}]};}
        if(q.includes('INSERT INTO dms_BookingMasterInvoices') || q.includes('UPDATE dms_BookingMasterInvoices'))tx.state.invoice={InvoiceNo:v.no,InvoiceDate:v.date,DocumentID:v.doc};
        if(q.includes('INSERT INTO dms_SalesAuditLog')){if(options.failAudit)throw new Error('Audit write failed');tx.state.audits.push(v);}
        return{recordset:[],rowsAffected:[1]};
    });
    getPool.mockResolvedValue({tx});return{tx,initial};
}
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(fs.promises,'unlink').mockResolvedValue();});
afterEach(()=>jest.restoreAllMocks());

test.each(['Closed','GatePassIssued','Delivered','Allocated','ReadyForDelivery','Draft'])('invoice upload works in %s without a financial or booking-state mutation',async status=>{
    const {tx}=fixture({booking:{Status:status,AllocatedVehicleID:null}});
    expect(await recordMasterInvoiceDocument(tx,input)).toMatchObject({Status:status,DocumentID:77,InvoiceNo:'MASTER-123'});
    expect(tx.state.booking.Status).toBe(status);expect(tx.calls[0].q).toContain('UPDLOCK,HOLDLOCK');
    expect(tx.calls.some(c=>/INSERT INTO (data_Finance|dms_SalesIncentive|dms_SalesPayments|dms_PartyLedger)|UPDATE dms_SalesBookings|Stock/.test(c.q))).toBe(false);
    expect(tx.state.audits[0].uid).toBe(1);expect(JSON.parse(tx.state.audits[0].new).DocumentID).toBe(77);
});
test('historical closed booking saves invoice document without any accrual',async()=>{
    const {tx}=fixture({booking:{IsHistorical:true}});await recordMasterInvoiceDocument(tx,input);
    expect(tx.state.documents).toHaveLength(1);expect(tx.calls.every(c=>!c.q.includes('dms_SalesIncentiveAccruals'))).toBe(true);
});
test.each([{invoiceNo:''},{invoiceDate:'2026-02-30'},{invoiceDate:'2026-13-01'},{file:null},{file:{...file,size:0}},
    {file:{...file,size:11*1024*1024}},{file:{...file,mimetype:'text/html'}},{notes:'x'.repeat(501)}])('invalid or incomplete upload rejected: %p',change=>{
    expect(()=>validateInvoice({...input,...change})).toThrow();
});
test('unauthorized recording cannot write data',async()=>{
    const {tx}=fixture();await expect(recordMasterInvoiceDocument(tx,{...input,user:{...user,modules:['sales_reports']}})).rejects.toMatchObject({status:403});
    expect(tx.query).not.toHaveBeenCalled();
});
test.each([['cancelled',{booking:{Status:'Cancelled'}},409],['missing',{missing:true},404],
    ['already uploaded',{invoice:{DocumentID:2,DeletedAt:null}},409]])('%s booking upload rejected',async(label,options,status)=>{
    const {tx}=fixture(options);await expect(recordMasterInvoiceDocument(tx,input)).rejects.toMatchObject({status});expect(tx.state.documents).toHaveLength(0);
});
test('previously soft-deleted invoice can be replaced and original metadata is audited',async()=>{
    const {tx}=fixture({invoice:{DocumentID:2,InvoiceNo:'OLD',DeletedAt:new Date()}});
    await recordMasterInvoiceDocument(tx,input);expect(tx.calls.some(c=>c.q.includes('UPDATE dms_BookingMasterInvoices'))).toBe(true);
    expect(JSON.parse(tx.state.audits[0].old).InvoiceNo).toBe('OLD');
});
test('audit failure rolls back the upload record and deletes only the new physical file',async()=>{
    const {tx,initial}=fixture({failAudit:true}),res=response();
    await controller.record({params:{id:'7'},body:{MasterInvoiceNo:input.invoiceNo,MasterInvoiceDate:input.invoiceDate},file,user},res);
    expect(res.code).toBe(500);expect(tx.rollback).toHaveBeenCalled();expect(tx.commit).not.toHaveBeenCalled();expect(tx.state).toEqual(initial);
    expect(fs.promises.unlink).toHaveBeenCalledWith(file.path);
});
test('successful record retains the uploaded file',async()=>{
    const {tx}=fixture(),res=response();await controller.record({params:{id:'7'},body:{MasterInvoiceNo:input.invoiceNo,MasterInvoiceDate:input.invoiceDate},file,user},res);
    expect(res.code).toBe(201);expect(tx.commit).toHaveBeenCalled();expect(fs.promises.unlink).not.toHaveBeenCalled();
});
test('failed record never deletes a path outside the sales upload directory',async()=>{
    fixture();const res=response();await controller.record({params:{id:'7'},body:{},file:{...file,path:path.resolve(__dirname,'../server.js')},user},res);
    expect(res.code).toBe(400);expect(fs.promises.unlink).not.toHaveBeenCalled();
});

const uploaded={InvoiceNo:'MASTER-123',InvoiceDate:new Date('2026-10-17T00:00Z'),IncentiveProcessedAt:null};
test('regular closed booking can process incentives only against its uploaded invoice',async()=>{
    const {tx}=fixture({invoice:uploaded});expect((await requireUploadedMasterInvoice(tx,7,'MASTER-123','2026-10-17')).Status).toBe('Closed');
});
test.each([{booking:{IsHistorical:true}},{invoice:null},{invoice:{...uploaded,DeletedAt:new Date()}},
    {invoice:{...uploaded,IncentiveProcessedAt:new Date()}},{accrual:true},{voucher:true}])('missing/historical/already processed accrual blocked: %p',async options=>{
    const {tx}=fixture({invoice:uploaded,...options});await expect(requireUploadedMasterInvoice(tx,7,'MASTER-123','2026-10-17')).rejects.toMatchObject({status:409});
});
test('accrual cannot use invoice details different from the saved upload',async()=>{
    const {tx}=fixture({invoice:uploaded});await expect(requireUploadedMasterInvoice(tx,7,'OTHER','2026-10-17')).rejects.toMatchObject({status:409});
});
