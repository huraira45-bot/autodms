// Local development SQL only. All fixture changes are rolled back.
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const assert=require('node:assert/strict');
const db=require('../config/db'),{sql}=db,realGetPool=db.getPool;
let tx;db.getPool=async()=>({request:()=>new sql.Request(tx)});
const {correctStoreSaleFreight}=require('../services/storeSaleFreightCorrectionService');
const {postStoreSaleVoucher}=require('../services/storeSalePostingService');
const {getStoreSaleBalance}=require('../controllers/paymentController');
const rq=()=>new sql.Request(tx);
(async()=>{
    assert.equal(process.env.DB_NAME,'temp_db1');assert.ok(['localhost','.','127.0.0.1'].includes(process.env.DB_SERVER.toLowerCase()));
    tx=new sql.Transaction(await realGetPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try{
        await rq().query(require('fs').readFileSync(require('path').join(__dirname,'../migrations/171_store_sale_freight_recovery.sql'),'utf8'));
        const marker='FRT'+Date.now();
        const general=(await rq().query("SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='GENERAL_CUSTOMER'")).recordset[0].GLCAID;
        const account=(await rq().query(`SELECT TOP(1) GLCAID,GLCode FROM GLChartOFAccount WHERE GLCAID<>${Number(general)} AND isParent=0 ORDER BY GLCAID DESC`)).recordset[0];
        const admin=(await rq().query('SELECT TOP(1) Userid,UserName FROM GLUser WHERE GroupID=1 AND Active=1 ORDER BY Userid')).recordset[0];
        const user={userId:admin.Userid,userName:admin.UserName,groupId:1};
        await rq().query("DELETE dms_SystemAccounts WHERE RoleKey='STORE_SALE_FREIGHT_RECOVERY'");
        const copySale=async suffix=>{
            return (await rq().input('no',sql.NVarChar(50),marker+suffix).query(`
                INSERT data_StoreSaleInfo(InvoiceNo,SaleDate,PaymentMode,DeliveryExpense,NetPayable,TotalBillAmount,TotalTaxAmount,TotalDiscount,IsFinalized)
                OUTPUT INSERTED.SaleID VALUES(@no,GETDATE(),'Cash',600,138600,138000,0,0,1)`)).recordset[0].SaleID;
        };
        const sale=await copySale('A');
        await rq().input('sale',sql.Int,sale).query(`INSERT data_StoreSaleDetail(SaleID,Quantity,SaleRate,TaxPercent,TaxAmount,DiscountAmount,NetAmount,UnitLandedCost)
            VALUES(@sale,1,138000,0,0,0,138000,0)`);
        const type=(await rq().query("SELECT Voucherid FROM GLVoucherType WHERE Title='SS'")).recordset[0].Voucherid;
        const voucher=async(no,source,total)=>(await rq().input('no',sql.NVarChar(50),marker+no).input('type',sql.Int,type).input('sale',sql.Int,sale)
            .input('source',sql.NVarChar(20),source).input('total',sql.Decimal(18,2),total).query(`
                INSERT data_FinanceVoucherInfo(VoucherNo,VoucherDate,VoucherTypeID,TotalAmount,Status,Posted,SourceDocType,SourceDocID)
                OUTPUT INSERTED.VoucherID VALUES(@no,GETDATE(),@type,@total,'Draft',0,@source,@sale)`)).recordset[0].VoucherID;
        const invoice=await voucher('SS','STORE_SALE',138000),receipt=await voucher('RC','VOUCHER',138000);
        await rq().input('invoice',sql.Int,invoice).input('receipt',sql.Int,receipt).input('general',sql.Int,general).input('other',sql.Int,account.GLCAID).query(`
            INSERT data_FinanceVoucherDetail(VoucherID,GLCAID,Debit,Credit) VALUES(@invoice,@general,138000,0),(@invoice,@other,0,138000),(@receipt,@other,138000,0);
            INSERT data_FinanceVoucherDetail(VoucherID,GLCAID,Debit,Credit,AllocatedToVoucherID) VALUES(@receipt,@general,0,138000,@invoice);
            UPDATE data_FinanceVoucherInfo SET Status='Posted',Posted=1 WHERE VoucherID IN(@invoice,@receipt)`);
        // Use a distinct approved recovery account so the existing parts revenue is preserved.
        const recovery=(await rq().query(`SELECT TOP(1) GLCAID,GLCode FROM GLChartOFAccount WHERE isParent=0 AND GLCAID NOT IN(${Number(general)},${Number(account.GLCAID)}) ORDER BY GLCAID DESC`)).recordset[0];
        const args={saleId:sale,expectedVoucherId:invoice,creditGLCode:recovery.GLCode,reason:'Synthetic owner-authorized freight recovery',user,configureRecoveryRole:true};
        const beforeReceipt=JSON.stringify((await rq().input('id',sql.Int,receipt).query('SELECT * FROM data_FinanceVoucherInfo WHERE VoucherID=@id;SELECT * FROM data_FinanceVoucherDetail WHERE VoucherID=@id ORDER BY VoucherDetailID')).recordsets);
        await assert.rejects(()=>correctStoreSaleFreight(tx,{...args,user:{...user,groupId:2}}),/Administrator/);
        const fixed=await correctStoreSaleFreight(tx,args);assert.equal(fixed.invoiceTotal,138600);assert.equal(fixed.freightAdded,600);
        const res={status(n){this.code=n;return this;},json(data){this.data=data;}};await getStoreSaleBalance({params:{saleId:String(sale)}},res);
        assert.equal(res.data.invoiceTotal,138600);assert.equal(res.data.paid,138000);assert.equal(res.data.outstanding,600);
        assert.equal(JSON.stringify((await rq().input('id',sql.Int,receipt).query('SELECT * FROM data_FinanceVoucherInfo WHERE VoucherID=@id;SELECT * FROM data_FinanceVoucherDetail WHERE VoucherID=@id ORDER BY VoucherDetailID')).recordsets),beforeReceipt);
        assert.equal((await correctStoreSaleFreight(tx,args)).alreadyCorrected,true);
        assert.equal((await rq().input('id',sql.Int,invoice).query('SELECT COUNT(*) N FROM dms_VoucherEditHistory WHERE VoucherID=@id')).recordset[0].N,1);
        const future=await copySale('B');await rq().input('sale',sql.Int,future).query(`INSERT data_StoreSaleDetail(SaleID,Quantity,SaleRate,TaxPercent,TaxAmount,DiscountAmount,NetAmount,UnitLandedCost)
            VALUES(@sale,1,138000,0,0,0,138000,0)`);
        const posted=await postStoreSaleVoucher(future,user,tx);
        assert.ok(posted);
        const futureTotal=(await rq().input('sale',sql.Int,future).query("SELECT TotalAmount FROM data_FinanceVoucherInfo WHERE SourceDocType='STORE_SALE' AND SourceDocID=@sale AND Status='Posted'")).recordset[0].TotalAmount;
        assert.equal(Number(futureTotal),138600,'Actual finalization loader must include DeliveryExpense.');
        console.log('PASS: posted invoice adds exactly600; original receipt/header/allocation unchanged; balance138600/paid138000/outstanding600; strict voucher/account audit; repeat no-op; actual future finalize includes delivery. All local fixtures rolled back.');
    }finally{await tx.rollback();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>sql.close());
