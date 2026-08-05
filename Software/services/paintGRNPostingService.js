/**
 * Paint GRN finalize → ledger posting service.
 *
 * Owner ask 2026-07-28: match the regular Parts GRN journal — Input GST is
 * booked as CLAIMABLE (not rolled into paint cost), Discount Received hits
 * its own income account, and the supplier is credited for the balancing
 * amount. AIT already goes to Advance Tax 236G (added 2026-07-27).
 *
 * Journal on finalize (PaymentMode='CREDIT', the default):
 *   Dr  PAINT_INVENTORY         SubTotal (gross)
 *   Dr  INPUT_GST               GSTTotal
 *   Dr  ADVANCE_TAX_236G_PARTS  AITTotal
 *       Cr  PARTS_DISCOUNT_RECEIVED   DiscountTotal
 *       Cr  Supplier PartyGL          GrandTotal (balancing)
 *
 * Owner ask 2026-08-07: some Paint GRNs are paid cash on the spot and the
 * owner does not want those hitting Cash Book (or any GL account) at all —
 * PaymentMode='CASH' skips voucher posting entirely. Stock + moving-avg
 * still update as usual (paintGRNController.finalize runs that before
 * calling this), the GRN is still marked Posted, but VoucherID stays NULL
 * — same as the existing zero-grand-total short-circuit below. No COA
 * account is required for a cash GRN's supplier at all.
 *
 * Uses the same system accounts as parts GRN (INPUT_GST,
 * PARTS_DISCOUNT_RECEIVED) so no extra COA mapping is needed. Owner can
 * introduce paint-specific accounts later if they want to segregate.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
        .query(`SELECT PaintGRNID, GRNNo, GRNDate, PartyID, SupplierBillNo,
                       ISNULL(PaymentMode, 'CREDIT') AS PaymentMode,
                       ISNULL(SubTotal, 0)      AS SubTotal,
                       ISNULL(DiscountTotal, 0) AS DiscountTotal,
                       ISNULL(GSTTotal, 0)      AS GSTTotal,
                       ISNULL(AITTotal, 0)      AS AITTotal,
                       ISNULL(GrandTotal, 0)    AS GrandTotal
                FROM paint_GRN WHERE PaintGRNID=@id`);
    if (!hdrRes.recordset.length) throw new Error(`Paint GRN ${paintGRNID} not found.`);
    const grn = hdrRes.recordset[0];
    if (Number(grn.GrandTotal) <= 0) return null;

    // Cash GRNs are intentionally kept off the books — no voucher at all.
    if (grn.PaymentMode === 'CASH') return null;

    const subTotal      = r2(grn.SubTotal);
    const discountTotal = r2(grn.DiscountTotal);
    const gstTotal      = r2(grn.GSTTotal);
    const aitTotal      = r2(grn.AITTotal);
    // Supplier payable balances the journal: gross + gst + ait − disc = GrandTotal.
    const supplierCredit = r2(subTotal + gstTotal + aitTotal - discountTotal);

    const paintInventoryGLCAID = await resolveRole('PAINT_INVENTORY');
    const inputGSTGLCAID       = gstTotal > 0      ? await resolveRole('INPUT_GST') : null;
    const advanceTaxGLCAID     = aitTotal > 0      ? await resolveRole('ADVANCE_TAX_236G_PARTS') : null;
    const discountGLCAID       = discountTotal > 0 ? await resolveRole('PARTS_DISCOUNT_RECEIVED') : null;
    const supplier              = await loadSupplierGL(grn.PartyID, transaction);

    const vt = await new sql.Request(transaction)
        .query("SELECT Voucherid FROM GLVoucherType WHERE Title='PV'");
    if (!vt.recordset.length) throw new Error('PV voucher type missing.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const voucherNo = await nextVoucherNo(transaction, 'PV');
    const narration = `Paint GRN ${grn.GRNNo} — ${supplier.name}` +
                      (grn.SupplierBillNo ? ` (Bill: ${grn.SupplierBillNo})` : '');

    // Voucher header — TotalAmount = total Dr side (subTotal + gst + ait), matches parts GRN
    const totalDr = r2(subTotal + gstTotal + aitTotal);

    const newHdr = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,          new Date())
        .input('vno',     sql.NVarChar(50),      voucherNo)
        .input('vtId',    sql.Int,               voucherTypeId)
        .input('remarks', sql.NVarChar(sql.MAX), narration)
        .input('total',   sql.Decimal(18,2),     totalDr)
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

    async function insertLeg(glCAID, dr, cr, note, partyId = null) {
        await new sql.Request(transaction)
            .input('vid', sql.Int,               voucherId)
            .input('gl',  sql.Int,               glCAID)
            .input('nar', sql.NVarChar(sql.MAX), note)
            .input('dr',  sql.Decimal(18,2),     dr)
            .input('cr',  sql.Decimal(18,2),     cr)
            .input('pid', sql.Int,               partyId)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, PartyID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid)`);
    }

    // Dr Paint Inventory (gross paint value — no GST, no AIT, no discount netting)
    await insertLeg(paintInventoryGLCAID, subTotal, 0,
        `Paint inventory received (gross) — GRN ${grn.GRNNo}`);

    // Dr Input GST — claimable from FBR
    if (gstTotal > 0 && inputGSTGLCAID) {
        await insertLeg(inputGSTGLCAID, gstTotal, 0,
            `Input GST on paint supplier invoice — GRN ${grn.GRNNo}`);
    }

    // Dr Advance Tax 236G — claimable against future income tax
    if (aitTotal > 0 && advanceTaxGLCAID) {
        await insertLeg(advanceTaxGLCAID, aitTotal, 0,
            `Advance tax 236G on paint purchase — GRN ${grn.GRNNo}`);
    }

    // Cr Discount Received on Paint
    if (discountTotal > 0 && discountGLCAID) {
        await insertLeg(discountGLCAID, 0, discountTotal,
            `Trade discount on paint — GRN ${grn.GRNNo}`);
    }

    // Cr Supplier — balancing leg
    await insertLeg(supplier.GLCAID, 0, supplierCredit, narration, grn.PartyID);

    // Subsidiary ledger — supplier payable
    await new sql.Request(transaction)
        .input('pid', sql.Int,               grn.PartyID)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               supplier.GLCAID)
        .input('cr',  sql.Decimal(18,2),     supplierCredit)
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
