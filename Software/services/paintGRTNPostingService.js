/**
 * Paint GRTN finalize → ledger posting service.
 *
 * Mirror of paintGRNPostingService: paint being returned to supplier
 * reduces both the payable AND the paint inventory value. Uses the
 * ORIGINAL landed unit cost from each line (carried on paint_GRTNDetail
 * as OriginalUnitCost) so the moving-avg cost math nets out cleanly.
 *
 * Journal on finalize:
 *   Dr  Supplier PartyGL   GrandTotal
 *   Cr  PAINT_INVENTORY    GrandTotal
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { nextVoucherNo } = require('../utils/voucherNumbering');

async function loadSupplierGL(partyId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, partyId)
        .query('SELECT PartyName, PartyGLID FROM gen_PartiesInfo WHERE PartyID=@id');
    if (!r.recordset.length) throw new Error(`Supplier party #${partyId} not found.`);
    const p = r.recordset[0];
    if (!p.PartyGLID) throw new Error(`Supplier "${p.PartyName}" has no GL account linked. Edit the party and pick one before finalizing the Paint GRTN.`);
    return { name: p.PartyName, GLCAID: p.PartyGLID };
}

async function postPaintGRTNVoucher(paintGRTNID, userInfo, transaction) {
    const hdrRes = await new sql.Request(transaction)
        .input('id', sql.Int, paintGRTNID)
        .query(`SELECT PaintGRTNID, GRTNNo, GRTNDate, PartyID, SourcePaintGRNID, GrandTotal
                FROM paint_GRTN WHERE PaintGRTNID=@id`);
    if (!hdrRes.recordset.length) throw new Error(`Paint GRTN ${paintGRTNID} not found.`);
    const grtn = hdrRes.recordset[0];
    if (Number(grtn.GrandTotal) <= 0) return null;

    const srcRes = await new sql.Request(transaction)
        .input('id', sql.Int, grtn.SourcePaintGRNID)
        .query('SELECT GRNNo FROM paint_GRN WHERE PaintGRNID=@id');
    const srcGrnNo = srcRes.recordset[0]?.GRNNo || `PGRN#${grtn.SourcePaintGRNID}`;

    const paintInventoryGLCAID = await resolveRole('PAINT_INVENTORY');
    const supplier = await loadSupplierGL(grtn.PartyID, transaction);

    const vt = await new sql.Request(transaction)
        .query("SELECT Voucherid FROM GLVoucherType WHERE Title='PRV'");
    if (!vt.recordset.length) throw new Error('PRV voucher type missing.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const voucherNo = await nextVoucherNo(transaction, 'PRV');
    const narration = `Paint GRTN ${grtn.GRTNNo} — ${supplier.name} (against ${srcGrnNo})`;

    const newHdr = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,          new Date())
        .input('vno',     sql.NVarChar(50),      voucherNo)
        .input('vtId',    sql.Int,               voucherTypeId)
        .input('remarks', sql.NVarChar(sql.MAX), narration)
        .input('total',   sql.Decimal(18,2),     grtn.GrandTotal)
        .input('src',     sql.NVarChar(20),      'PAINT_GRTN')
        .input('srcId',   sql.Int,               paintGRTNID)
        .input('cby',     sql.Int,               userInfo?.userId || null)
        .input('cbyN',    sql.NVarChar(100),     userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @remarks, @total,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = newHdr.recordset[0].VoucherID;

    // Dr Supplier (reduce payable)
    await new sql.Request(transaction)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               supplier.GLCAID)
        .input('nar', sql.NVarChar(sql.MAX), narration)
        .input('dr',  sql.Decimal(18,2),     grtn.GrandTotal)
        .input('pid', sql.Int,               grtn.PartyID)
        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, PartyID)
                VALUES (@vid, @gl, @nar, @dr, 0, @pid)`);

    // Cr Paint Inventory
    await new sql.Request(transaction)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               paintInventoryGLCAID)
        .input('nar', sql.NVarChar(sql.MAX), `Paint returned to supplier — GRTN ${grtn.GRTNNo}`)
        .input('cr',  sql.Decimal(18,2),     grtn.GrandTotal)
        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                VALUES (@vid, @gl, @nar, 0, @cr)`);

    // Subsidiary — supplier payable reduces
    await new sql.Request(transaction)
        .input('pid', sql.Int,               grtn.PartyID)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               supplier.GLCAID)
        .input('dr',  sql.Decimal(18,2),     grtn.GrandTotal)
        .input('nar', sql.NVarChar(500),     narration)
        .query(`INSERT INTO dms_PartyLedger (PartyID, VoucherID, GLCAID, Debit, Credit, Narration)
                VALUES (@pid, @vid, @gl, @dr, 0, @nar)`);

    // Draft → Posted
    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return { voucherId, voucherNo };
}

module.exports = { postPaintGRTNVoucher };
