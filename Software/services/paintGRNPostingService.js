/**
 * Paint GRN finalize → ledger posting service.
 *
 * Owner ask 2026-07-04: paint costs (including GST) roll into Paint Inventory
 * so subsequent Paint Consumption reflects full landed cost. No Input GST
 * claim is booked — the paint team treats GST as part of item cost. This
 * is consistent with the "GST included in item cost" note the owner gave.
 *
 * Journal on finalize:
 *   Dr  PAINT_INVENTORY   GrandTotal
 *   Cr  Supplier PartyGL  GrandTotal
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
    if (!p.PartyGLID) throw new Error(`Supplier "${p.PartyName}" has no GL account linked. Edit the party and pick one before finalizing the Paint GRN.`);
    return { name: p.PartyName, GLCAID: p.PartyGLID };
}

async function postPaintGRNVoucher(paintGRNID, userInfo, transaction) {
    const hdrRes = await new sql.Request(transaction)
        .input('id', sql.Int, paintGRNID)
        .query(`SELECT PaintGRNID, GRNNo, GRNDate, PartyID, SupplierBillNo, GrandTotal
                FROM paint_GRN WHERE PaintGRNID=@id`);
    if (!hdrRes.recordset.length) throw new Error(`Paint GRN ${paintGRNID} not found.`);
    const grn = hdrRes.recordset[0];
    if (Number(grn.GrandTotal) <= 0) return null;

    const paintInventoryGLCAID = await resolveRole('PAINT_INVENTORY');
    const supplier = await loadSupplierGL(grn.PartyID, transaction);

    const vt = await new sql.Request(transaction)
        .query("SELECT Voucherid FROM GLVoucherType WHERE Title='PV'");
    if (!vt.recordset.length) throw new Error('PV voucher type missing.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const voucherNo = await nextVoucherNo(transaction, 'PV');
    const narration = `Paint GRN ${grn.GRNNo} — ${supplier.name}` +
                      (grn.SupplierBillNo ? ` (Bill: ${grn.SupplierBillNo})` : '');

    const newHdr = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,          new Date())
        .input('vno',     sql.NVarChar(50),      voucherNo)
        .input('vtId',    sql.Int,               voucherTypeId)
        .input('remarks', sql.NVarChar(sql.MAX), narration)
        .input('total',   sql.Decimal(18,2),     grn.GrandTotal)
        .input('src',     sql.NVarChar(20),      'PAINT_GRN')
        .input('srcId',   sql.Int,               paintGRNID)
        .input('cby',     sql.Int,               userInfo?.userId || null)
        .input('cbyN',    sql.NVarChar(100),     userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @remarks, @total,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = newHdr.recordset[0].VoucherID;

    // Dr Paint Inventory
    await new sql.Request(transaction)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               paintInventoryGLCAID)
        .input('nar', sql.NVarChar(sql.MAX), `Paint inventory received — GRN ${grn.GRNNo}`)
        .input('dr',  sql.Decimal(18,2),     grn.GrandTotal)
        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                VALUES (@vid, @gl, @nar, @dr, 0)`);

    // Cr Supplier
    await new sql.Request(transaction)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               supplier.GLCAID)
        .input('nar', sql.NVarChar(sql.MAX), narration)
        .input('cr',  sql.Decimal(18,2),     grn.GrandTotal)
        .input('pid', sql.Int,               grn.PartyID)
        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, PartyID)
                VALUES (@vid, @gl, @nar, 0, @cr, @pid)`);

    // Subsidiary ledger — supplier payable
    await new sql.Request(transaction)
        .input('pid', sql.Int,               grn.PartyID)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               supplier.GLCAID)
        .input('cr',  sql.Decimal(18,2),     grn.GrandTotal)
        .input('nar', sql.NVarChar(500),     narration)
        .query(`INSERT INTO dms_PartyLedger (PartyID, VoucherID, GLCAID, Debit, Credit, Narration)
                VALUES (@pid, @vid, @gl, 0, @cr, @nar)`);

    // Flip Draft → Posted (fires balanced-entry trigger)
    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return { voucherId, voucherNo };
}

module.exports = { postPaintGRNVoucher };
