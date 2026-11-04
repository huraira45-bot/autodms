const {buildStoreSaleJournalLines:build}=require('../utils/storeSaleJournalBuilder');
const accounts=Object.fromEntries(['CASH_BOOK','GENERAL_CUSTOMER','GST_PAYABLE','STORE_SALE_DISCOUNT_GIVEN','POS_CLEARING','CHEQUES_ON_HAND','PARTS_REVENUE','COGS_PARTS','INVENTORY_PARTS','STORE_SALE_FREIGHT_RECOVERY'].map((key,i)=>[key,{GLCAID:i+1}]));
const header={SaleID:1173,InvoiceNo:'SAL-01173',PaymentMode:'Bank Transfer',DeliveryExpense:600};
const lines=[{Quantity:1,SaleRate:114316.10,TaxAmount:20576.90,DiscountAmount:5893,UnitLandedCost:80000},
    {Quantity:1,SaleRate:8186.44,TaxAmount:1473.56,DiscountAmount:660,UnitLandedCost:13101.93}];
const run=(storeSale=header,extra={})=>build({storeSale,lines,accounts,...extra});
test('SAL-01173 invoices goods 138000 plus freight 600, with exact balanced debit and recovery credit',()=>{
    const result=run();expect(result.header.TotalAmount).toBe(138600);expect(result.totals.customerPays).toBe(138600);
    expect(result.lines.find(l=>l.GLCAID===accounts.GENERAL_CUSTOMER.GLCAID)).toMatchObject({Debit:138600,Credit:0});
    expect(result.lines.find(l=>l.GLCAID===accounts.STORE_SALE_FREIGHT_RECOVERY.GLCAID)).toMatchObject({Debit:0,Credit:600});
    expect(result.totals).toMatchObject({partsGross:122502.54,partsDiscount:6553,partsTax:22050.46,partsCOGS:93101.93,deliveryExpense:600});
    expect(result.totals.totalDr).toBe(result.totals.totalCr);
});
test.each(['Cash','POS','Cheque','Bank Transfer'])('%s posts only the full invoice; receiving payment is still separate',PaymentMode=>{
    const result=run({...header,PaymentMode});expect(result.customerARDr.Amount).toBe(138600);
    expect(result.lines.filter(l=>l.GLCAID===accounts.GENERAL_CUSTOMER.GLCAID)).toHaveLength(1);
    expect(result.lines.some(l=>l.GLCAID===accounts.CASH_BOOK.GLCAID)).toBe(false);
});
test('credit sale increases the named customer debit and subsidiary amount, retaining party tags',()=>{
    const r=run({...header,PaymentMode:'Credit',PartyID:42},{partyGL:{GLCAID:999}});
    expect(r.lines.find(l=>l.GLCAID===999)).toMatchObject({Debit:138600,PartyID:42});expect(r.subsidiaryWrites[0]).toMatchObject({Debit:138600,PartyID:42});
});
test.each([0,undefined,null])('sales without freight need no new mapping and preserve previous totals: %p',DeliveryExpense=>{
    const {STORE_SALE_FREIGHT_RECOVERY,...oldAccounts}=accounts;
    const r=run({...header,DeliveryExpense},{accounts:oldAccounts});expect(r.header.TotalAmount).toBe(138000);
    expect(r.lines.some(l=>l.GLCAID===STORE_SALE_FREIGHT_RECOVERY.GLCAID)).toBe(false);
});
test.each([-1,'invalid',Infinity])('invalid delivery charge %p cannot create a posting',DeliveryExpense=>expect(()=>run({...header,DeliveryExpense})).toThrow(/Delivery Expense/));
test('nonzero freight requires an explicit account; never guesses parts revenue',()=>{
    const {STORE_SALE_FREIGHT_RECOVERY,...oldAccounts}=accounts;expect(()=>run(header,{accounts:oldAccounts})).toThrow(/Accounting Setup/);
});
test('campaign benefit cannot discount freight beyond the goods amount',()=>{
    const r=run(header,{campaign:{BenefitAmount:200000,GLAccountID:999,CampaignName:'Synthetic'}});
    expect(r.totals.campaignBenefit).toBe(138000);expect(r.totals.customerPays).toBe(600);expect(r.totals.totalDr).toBe(r.totals.totalCr);
});
test('delivery-only charge creates a balanced invoice without touching stock or tax',()=>{
    const r=build({storeSale:header,lines:[],accounts});expect(r.header.TotalAmount).toBe(600);expect(r.lines).toHaveLength(2);
    expect(r.totals.partsCOGS).toBe(0);expect(r.totals.partsTax).toBe(0);
});
