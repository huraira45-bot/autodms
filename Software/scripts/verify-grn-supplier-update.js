// Local development SQL verification; every fixture and update is rolled back.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('node:assert/strict'), os = require('node:os');
const db = require('../config/db'), sql = db.sql, realGetPool = db.getPool;
let outer, savepoint = 0;
class NestedTransaction {
    constructor() { this.outer = outer; this.name = 'GRNSupplier' + (++savepoint); }
    async begin() { await new sql.Request(outer).query(`SAVE TRANSACTION ${this.name}`); }
    async commit() {}
    async rollback() { await new sql.Request(outer).query(`ROLLBACK TRANSACTION ${this.name}`); }
}
class Request extends sql.Request { constructor(target) { super(target?.outer || target); } }
db.sql = { ...sql, Transaction: NestedTransaction, Request };
db.getPool = async () => ({ request: () => new Request(outer) });
const controller = require('../controllers/grnController');
const request = () => new sql.Request(outer);
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
async function invoke(method, id, body = {}, status = 200) {
    const res = response(); await controller[method]({ params: { id }, body, user: { userId: 1, userName: 'Local GRN verifier' } }, res);
    assert.equal(res.code, status, res.body?.error); return res.body;
}
(async () => {
    const host = (process.env.DB_SERVER || '').split('\\')[0].toLowerCase();
    if (!['.', 'localhost', '127.0.0.1', os.hostname().toLowerCase()].includes(host)) throw new Error('Local development database only.');
    const pool = await realGetPool(); outer = new sql.Transaction(pool); await outer.begin();
    const marker = 'GRNS' + Date.now();
    try {
        const refs = (await request().query("SELECT TOP(1) ItemId FROM InventItems WHERE LOWER(LTRIM(RTRIM(ItemType)))='part';SELECT TOP(1) WHID FROM InventWareHouse")).recordsets;
        assert(refs.every(rows => rows.length), 'Existing development part and warehouse required.');
        const item = refs[0][0].ItemId, wh = refs[1][0].WHID, suppliers = [];
        for (const suffix of ['A', 'B']) suppliers.push((await request().input('name', sql.VarChar(100), marker + suffix)
            .input('ntn', sql.VarChar(50), suffix === 'A' ? '1234567' : '7654321')
            .query("INSERT gen_PartiesInfo(PartyName,PartyType,ReadOnly,NTNNO,AddressOne) OUTPUT INSERTED.PartyID VALUES(@name,'Supplier',0,@ntn,'Synthetic address')")).recordset[0].PartyID);
        // Reproduce an earlier save: the legacy PartyID/stock header already
        // contain B, while the view still resolves the old PurchasedParty A.
        const id = (await request().input('no', sql.NVarChar(50), marker).input('a', sql.Int, suppliers[0]).input('b', sql.Int, suppliers[1]).input('wh', sql.Int, wh)
            .query(`INSERT data_PurchaseInfo(PurchaseDate,FBRInvoiceNumber,PurchasedParty,PartyID,WHID,Remarks,CompanyID,BranchID,IsFinalized,PurchaseVoucherNo)
                OUTPUT INSERTED.PurchaseID VALUES('2026-10-28','TEST',@a,@b,@wh,'Synthetic supplier verification',1,1,0,@no)`)).recordset[0].PurchaseID;
        await request().input('id', sql.Int, id).input('item', sql.Int, item)
            .query('INSERT data_PurchaseDetail(PurchaseID,ItemId,Quantity,ItemRate,StockRate,NetAmount,UnitLandedCost) VALUES(@id,@item,2,100,100,200,100)');
        const sid = (await request().input('id', sql.Int, id).input('wh', sql.Int, wh).input('party', sql.Int, suppliers[1])
            .query(`INSERT data_StockInOutInfo(StockIODate,WHID,PartyID,StockType,StockIOTypeID,CompanyID,IsTaxable,ReadOnly,PurchaseID)
                OUTPUT INSERTED.StockIOID VALUES('2026-10-28',@wh,@party,'Purchase',1,1,1,0,@id)`)).recordset[0].StockIOID;
        await request().input('sid', sql.Int, sid).input('item', sql.Int, item).input('wh', sql.Int, wh)
            .query('INSERT data_StockInOutDetail(StockIOID,ItemId,Quantity,StockRate,LocationId) VALUES(@sid,@item,2,100,@wh)');
        const finance = async () => JSON.stringify((await request().query(`SELECT COUNT(*) AS N,SUM(TotalAmount) AS A FROM data_FinanceVoucherInfo;
            SELECT COUNT(*) AS N,SUM(Debit) AS D,SUM(Credit) AS C FROM data_FinanceVoucherDetail;SELECT COUNT(*) AS N FROM dms_PartyLedger;`)).recordsets);
        const stock = async () => JSON.stringify((await request().input('sid', sql.Int, sid)
            .query('SELECT ItemId,Quantity,StockRate,LocationId FROM data_StockInOutDetail WHERE StockIOID=@sid ORDER BY ItemId')).recordset);
        const beforeFinance = await finance(), beforeStock = await stock();
        assert.equal((await invoke('getGRNById', id)).PartyID, suppliers[0]);
        const body = { PurchaseDate: '2026-10-28', SupplierBillNo: 'TEST', PartyID: String(suppliers[1]), WHID: String(wh), Remarks: 'Synthetic supplier verification',
            Items: JSON.stringify([{ ItemId: item, Quantity: 2, ItemRate: 100, StockRate: 100, NetAmount: 200, DiscountPercentage: 0, DiscountAmount: 0, TaxRate: 0, TaxAmount: 0 }]) };
        await invoke('updateGRN', id, body);
        const reopened = await invoke('getGRNById', id);
        assert.equal(reopened.PartyID, suppliers[1]); assert.equal(reopened.PartyName, marker + 'B'); assert.equal(reopened.SupplierNTN, '7654321');
        const raw = (await request().input('id', sql.Int, id).query('SELECT PurchasedParty,PartyID FROM data_PurchaseInfo WHERE PurchaseID=@id')).recordset[0];
        assert.equal(raw.PurchasedParty, suppliers[1]); assert.equal(raw.PartyID, suppliers[1]);
        const list = response(); await controller.getGRNs({ query: { search: marker + 'B' } }, list);
        assert.equal(list.code, 200); assert(list.body.some(row => row.PurchaseID === id && row.PartyID === suppliers[1]));
        assert.equal(await stock(), beforeStock); assert.equal(await finance(), beforeFinance);
        // A failed stock resync must roll the supplier back as well.
        await request().input('sid', sql.Int, sid).query('UPDATE data_StockInOutInfo SET PurchaseID=NULL WHERE StockIOID=@sid');
        await invoke('updateGRN', id, { ...body, PartyID: String(suppliers[0]) }, 409);
        assert.equal((await invoke('getGRNById', id)).PartyID, suppliers[1]);
        await request().input('sid', sql.Int, sid).input('id', sql.Int, id).query('UPDATE data_StockInOutInfo SET PurchaseID=@id WHERE StockIOID=@sid');
        await request().input('id', sql.Int, id).query('UPDATE data_PurchaseInfo SET IsFinalized=1 WHERE PurchaseID=@id');
        assert.equal((await invoke('getGRNPrintData', id)).PartyID, suppliers[1]);
        await invoke('updateGRN', id, { ...body, PartyID: String(suppliers[0]) }, 423);
        assert.equal((await invoke('getGRNById', id)).PartyID, suppliers[1]);
        assert.equal(await stock(), beforeStock); assert.equal(await finance(), beforeFinance);
        console.log('PASS: saved supplier survives detail reload, list search and print; both supplier columns agree; stock quantities/rates and financial records unchanged; failed resync rolls back; finalized GRNs stay locked.');
    } finally { await outer.rollback(); }
    assert.equal((await pool.request().input('name', sql.VarChar(100), marker + '%').query('SELECT COUNT(*) AS N FROM gen_PartiesInfo WHERE PartyName LIKE @name')).recordset[0].N, 0);
    console.log('PASS: all synthetic fixtures rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { db.sql = sql; db.getPool = realGetPool; return sql.close(); });
