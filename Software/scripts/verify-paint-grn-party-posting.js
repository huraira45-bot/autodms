/** Local DB verification only: fixture and financial writes are always rolled back. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert/strict');
const { sql, getPool } = require('../config/db');
// Avoid consuming a real document number while exercising the actual posting service.
const marker = 'VERIFY-' + Date.now();
require('../utils/voucherNumbering').nextVoucherNo = async () => marker;
const { postPaintGRNToParty } = require('../services/paintGRNPartyService');

(async () => {
    const pool = await getPool();
    const server = await pool.request().query('SELECT @@SERVERNAME AS ServerName');
    if (!['.', 'localhost', '127.0.0.1', require('os').hostname().toLowerCase()].includes((process.env.DB_SERVER || '').split('\\')[0].toLowerCase())) {
        throw new Error('Run this verification against the local development database only. Server: ' + server.recordset[0].ServerName);
    }
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const request = () => new sql.Request(tx);
        const party = await request().query('SELECT TOP (1) PartyID FROM gen_PartiesInfo WHERE PartyGLID IS NOT NULL ORDER BY PartyID');
        assert.ok(party.recordset.length, 'Local test database needs a party with a GL account.');
        const partyId = party.recordset[0].PartyID;
        await request().input('pid', sql.Int, partyId).query(`
            IF NOT EXISTS (SELECT 1 FROM dms_PartyBusinessAccess WHERE PartyID=@pid AND BusinessKey='PAINT_LAB')
                INSERT INTO dms_PartyBusinessAccess (PartyID, BusinessKey) VALUES (@pid,'PAINT_LAB')`);
        const warehouse = await request().input('code', sql.NVarChar(50), marker).query(`
            INSERT INTO paint_Warehouse (WHCode,WHDesc) OUTPUT INSERTED.PaintWHID VALUES (@code,'Verification fixture')`);
        const item = await request().input('code', sql.NVarChar(50), marker).query(`
            INSERT INTO paint_Item (PaintCode,PaintName,StockQty,AvgCost)
            OUTPUT INSERTED.PaintItemID VALUES (@code,'Already received paint fixture',7,123.45)`);
        const itemId = item.recordset[0].PaintItemID;
        const grn = await request().input('no', sql.NVarChar(30), marker)
            .input('wh', sql.Int, warehouse.recordset[0].PaintWHID).query(`
            INSERT INTO paint_GRN (GRNNo,GRNDate,PaintWHID,Status,PaymentMode,PartyID,
                SubTotal,GrandTotal,FinalizedByName,FinalizedAt)
            OUTPUT INSERTED.PaintGRNID
            VALUES (@no,'2026-09-10',@wh,'Posted','CASH',NULL,35810,35810,'Original receiver','2026-09-10')`);
        const grnId = grn.recordset[0].PaintGRNID;
        await request().input('grn', sql.Int, grnId).input('item', sql.Int, itemId).query(`
            INSERT INTO paint_GRNDetail (PaintGRNID,PaintItemID,Quantity,UnitRate,LineTotal,LandedUnitCost)
            VALUES (@grn,@item,10,3581,35810,3581)`);
        async function stockSnapshot() {
            const result = await request().input('grn', sql.Int, grnId).query(`
                SELECT PaintItemID,StockQty,AvgCost,UpdatedAt FROM paint_Item ORDER BY PaintItemID;
                SELECT * FROM paint_StockLedger ORDER BY LedgerID;
                SELECT * FROM paint_GRNDetail WHERE PaintGRNID=@grn ORDER BY PaintGRNDetailID`);
            return JSON.stringify(result.recordsets);
        }
        const before = await stockSnapshot();
        const result = await postPaintGRNToParty(tx, { grnId, partyId, user: { userName: 'Local rollback verification' } });
        assert.equal(await stockSnapshot(), before, 'Every item stock/cost, ledger row and GRN detail must be unchanged.');
        const posted = await request().input('vid', sql.Int, result.VoucherID).input('grn', sql.Int, grnId).query(`
            SELECT Status,PaymentMode,PartyID,VoucherID,FinalizedByName FROM paint_GRN WHERE PaintGRNID=@grn;
            SELECT Status,SourceDocType,SourceDocID FROM data_FinanceVoucherInfo WHERE VoucherID=@vid;
            SELECT SUM(Debit)-SUM(Credit) AS Difference,
                   SUM(CASE WHEN PartyID IS NOT NULL THEN Credit ELSE 0 END) AS Payable
            FROM data_FinanceVoucherDetail WHERE VoucherID=@vid;
            SELECT PartyID,Credit FROM dms_PartyLedger WHERE VoucherID=@vid`);
        assert.equal(posted.recordsets[0][0].PaymentMode, 'CREDIT');
        assert.equal(posted.recordsets[0][0].Status, 'Posted');
        assert.equal(posted.recordsets[0][0].PartyID, partyId);
        assert.equal(posted.recordsets[0][0].FinalizedByName, 'Original receiver');
        assert.equal(posted.recordsets[1][0].Status, 'Posted');
        assert.equal(posted.recordsets[2][0].Difference, 0);
        assert.equal(posted.recordsets[2][0].Payable, 35810);
        assert.equal(posted.recordsets[3][0].Credit, 35810);
        await assert.rejects(postPaintGRNToParty(tx, { grnId, partyId }), err => err.statusCode === 409);
        console.log('PASS: actual SQL posting, PKR 35,810 payable, balanced journal, subsidiary ledger, duplicate guard, and unchanged stock/cost/details.');
    } finally {
        await tx.rollback();
    }
    const leftovers = await pool.request().input('marker', sql.NVarChar(50), marker).query(`
        SELECT (SELECT COUNT(*) FROM paint_GRN WHERE GRNNo=@marker) +
               (SELECT COUNT(*) FROM data_FinanceVoucherInfo WHERE VoucherNo=@marker) +
               (SELECT COUNT(*) FROM paint_Item WHERE PaintCode=@marker) +
               (SELECT COUNT(*) FROM paint_Warehouse WHERE WHCode=@marker) AS Remaining`);
    assert.equal(leftovers.recordset[0].Remaining, 0);
    console.log('PASS: all test fixtures and financial changes rolled back.');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => sql.close());
