const {sql}=require('../config/db');
const assert=require('node:assert/strict');
const {captureVoucherSnapshot,recordVoucherEdit}=require('./voucherEditHistoryService');
const {round2}=require('../utils/storeSaleJournalBuilder');
function fail(message){throw new Error(message);}
const ROLE='STORE_SALE_FREIGHT_RECOVERY';

// Explicit administrator repair of an omitted delivery charge, preserving receipt allocations.
// Caller owns a SERIALIZABLE transaction; preview must roll back.
async function correctStoreSaleFreight(tx,{saleId,expectedVoucherId,creditGLCode,reason,user,configureRecoveryRole=false}){
    if(Number(user?.groupId)!==1)fail('Only the main Administrator can correct posted sale freight.');
    if(!Number.isInteger(saleId)||!Number.isInteger(expectedVoucherId))fail('Explicit SaleID and expected VoucherID are required.');
    if(typeof reason!=='string'||reason.trim().length<5||reason.length>500)fail('A correction reason of 5 to 500 characters is required.');
    if(!Number.isInteger(user.userId)||!user.userName)fail('An identified administrator is required for the edit trail.');
    const sale=(await new sql.Request(tx).input('id',sql.Int,saleId).query('SELECT * FROM data_StoreSaleInfo WITH(UPDLOCK,HOLDLOCK) WHERE SaleID=@id')).recordset[0];
    if(!sale||!sale.IsFinalized||sale.PartyID)fail('This correction supports finalized walk-in Store Sales only.');
    const amount=round2(Number(sale.DeliveryExpense)||0);if(!(amount>0))fail('The sale has no positive delivery charge.');
    const vouchers=(await new sql.Request(tx).input('id',sql.Int,saleId).query(`SELECT VoucherID FROM data_FinanceVoucherInfo WITH(UPDLOCK,HOLDLOCK)
        WHERE SourceDocType='STORE_SALE' AND SourceDocID=@id AND Status='Posted' AND ReversesVoucherID IS NULL`)).recordset;
    if(vouchers.length!==1||vouchers[0].VoucherID!==expectedVoucherId)fail('The posted Store Sale voucher changed; investigate before correcting.');
    const campaign=(await new sql.Request(tx).input('id',sql.Int,saleId).query("SELECT ApplicationID FROM dms_ServiceCampaignApplications WHERE SaleID=@id AND Status='Active'")).recordset;
    if(campaign.length)fail('A campaign is active. Review customer and campaign shares separately.');
    const amounts=(await new sql.Request(tx).input('id',sql.Int,saleId).query(`SELECT
        SUM(ROUND(ISNULL(Quantity,0)*ISNULL(SaleRate,0),2)-ROUND(ISNULL(DiscountAmount,0),2)+ROUND(ISNULL(TaxAmount,0),2)) AS GoodsTotal
        FROM data_StoreSaleDetail WHERE SaleID=@id`)).recordset[0];
    const goodsTotal=round2(Number(amounts.GoodsTotal)||0),fullTotal=round2(goodsTotal+amount);
    if(round2(Number(sale.NetPayable))!==fullTotal)fail('Saved sale total does not equal goods plus delivery; do not infer a correction.');
    const gl=(await new sql.Request(tx).input('code',sql.NVarChar(50),creditGLCode).query('SELECT GLCAID,GLCode,GLTitle,isParent FROM GLChartOFAccount WHERE GLCode=@code')).recordset;
    if(gl.length!==1||gl[0].isParent)fail('The approved credit account must be an existing, unique leaf account.');
    const general=(await new sql.Request(tx).query("SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='GENERAL_CUSTOMER'")).recordset[0]?.GLCAID;
    if(!general||general===gl[0].GLCAID)fail('A distinct General Customer account is required.');
    const before=await captureVoucherSnapshot(tx,expectedVoucherId,true);
    if(before.Header.Status!=='Posted'||before.Header.ReversesVoucherID||before.Header.SourceDocType!=='STORE_SALE'||before.Header.SourceDocID!==saleId)fail('Voucher state changed.');
    const ar=before.Lines.filter(l=>l.GLCAID===general&&Number(l.Debit)>0&&Number(l.Credit)===0);
    if(ar.length!==1||ar[0].PartyID||ar[0].JobCardID)fail('Expected one untagged walk-in customer debit.');
    const alreadyCorrected=round2(Number(before.Header.TotalAmount))===fullTotal&&round2(Number(ar[0].Debit))===fullTotal
        &&before.Lines.some(l=>l.GLCAID===gl[0].GLCAID&&round2(Number(l.Credit))===amount);
    if(!alreadyCorrected){
        if(round2(Number(before.Header.TotalAmount))!==goodsTotal||round2(Number(ar[0].Debit))!==goodsTotal)fail('The omission is not exactly the saved delivery amount.');
        if(before.Lines.some(l=>l.GLCAID===gl[0].GLCAID))fail('Freight recovery is already represented; review before editing.');
    }
    const loadRelated=async()=> (await new sql.Request(tx).input('id',sql.Int,expectedVoucherId).query(`
        SELECT v.* FROM data_FinanceVoucherInfo v WHERE EXISTS(SELECT 1 FROM data_FinanceVoucherDetail d WHERE d.VoucherID=v.VoucherID AND d.AllocatedToVoucherID=@id) ORDER BY v.VoucherID;
        SELECT d.* FROM data_FinanceVoucherDetail d WHERE EXISTS(SELECT 1 FROM data_FinanceVoucherDetail a WHERE a.VoucherID=d.VoucherID AND a.AllocatedToVoucherID=@id) ORDER BY d.VoucherDetailID;
        SELECT * FROM dms_PartyLedger WHERE VoucherID=@id OR AllocatedToVoucherID=@id ORDER BY LedgerID;`)).recordsets;
    const relatedBefore=await loadRelated();
    if(relatedBefore[2].length)fail('Subsidiary entries exist for this walk-in invoice; investigate rather than changing them.');
    const mapping=(await new sql.Request(tx).input('role',sql.NVarChar(50),ROLE).query('SELECT GLCAID FROM dms_SystemAccounts WITH(UPDLOCK,HOLDLOCK) WHERE RoleKey=@role')).recordset[0];
    if(mapping&&mapping.GLCAID!==gl[0].GLCAID)fail('The freight role is mapped to a different account; no automatic reassignment is allowed.');
    if(!mapping&&configureRecoveryRole){
        await new sql.Request(tx).input('role',sql.NVarChar(50),ROLE).input('gl',sql.Int,gl[0].GLCAID)
            .input('by',sql.Int,user.userId).input('name',sql.NVarChar(100),user.userName).input('reason',sql.NVarChar(500),reason).query(`
                INSERT dms_SystemAccounts(RoleKey,GLCAID,AssignedBy,AssignedByName) VALUES(@role,@gl,@by,@name);
                INSERT dms_SystemAccountAudit(RoleKey,OldGLCAID,NewGLCAID,ChangedBy,ChangedByName,Reason) VALUES(@role,NULL,@gl,@by,@name,@reason);`);
    }
    if(alreadyCorrected)return{alreadyCorrected:true,InvoiceNo:sale.InvoiceNo,VoucherID:expectedVoucherId,invoiceTotal:fullTotal,recoveryRoleConfigured:Boolean(mapping||configureRecoveryRole)};
    await new sql.Request(tx).input('line',sql.Int,ar[0].VoucherDetailID).input('old',sql.Decimal(18,2),goodsTotal).input('full',sql.Decimal(18,2),fullTotal)
        .query('UPDATE data_FinanceVoucherDetail SET Debit=@full WHERE VoucherDetailID=@line AND Debit=@old; IF @@ROWCOUNT<>1 THROW 51069,\'Customer debit changed.\',1;');
    await new sql.Request(tx).input('id',sql.Int,expectedVoucherId).input('gl',sql.Int,gl[0].GLCAID).input('amount',sql.Decimal(18,2),amount)
        .input('narration',sql.NVarChar(500),`Freight / delivery recovery — ${sale.InvoiceNo}`).query(`
            INSERT data_FinanceVoucherDetail(VoucherID,GLCAID,Narration,Debit,Credit) VALUES(@id,@gl,@narration,0,@amount)`);
    await new sql.Request(tx).input('id',sql.Int,expectedVoucherId).input('full',sql.Decimal(18,2),fullTotal)
        .query('UPDATE data_FinanceVoucherInfo SET TotalAmount=@full WHERE VoucherID=@id');
    const after=await captureVoucherSnapshot(tx,expectedVoucherId);
    assert.deepEqual({...after.Header,TotalAmount:before.Header.TotalAmount},before.Header,'Only voucher TotalAmount may change.');
    for(const old of before.Lines){
        const saved=after.Lines.find(l=>l.VoucherDetailID===old.VoucherDetailID);
        assert.deepEqual(old.VoucherDetailID===ar[0].VoucherDetailID?{...saved,Debit:old.Debit}:saved,old,'Original line fields must be preserved.');
    }
    assert.equal(after.Lines.length,before.Lines.length+1);
    const dr=round2(after.Lines.reduce((s,l)=>s+Number(l.Debit),0)),cr=round2(after.Lines.reduce((s,l)=>s+Number(l.Credit),0));
    assert.equal(dr,cr,'Corrected voucher must balance.');
    assert.equal(JSON.stringify(await loadRelated()),JSON.stringify(relatedBefore),'Receipt amounts, allocation references and subsidiary records must stay unchanged.');
    const savedSale=(await new sql.Request(tx).input('id',sql.Int,saleId).query('SELECT * FROM data_StoreSaleInfo WHERE SaleID=@id')).recordset[0];
    assert.deepEqual(savedSale,sale,'Sale and stock header must not change.');
    await recordVoucherEdit(tx,{user,body:{Reason:reason}},'VOUCHER_EDIT',before,after);
    return{InvoiceNo:sale.InvoiceNo,VoucherID:expectedVoucherId,VoucherNo:before.Header.VoucherNo,freightAdded:amount,invoiceTotal:fullTotal,
        debitGLCAID:general,creditGLCode:gl[0].GLCode,creditGLTitle:gl[0].GLTitle,receiptsUnchanged:true};
}
module.exports={correctStoreSaleFreight};
