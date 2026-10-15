/** Assign an already received cash GRN to supplier credit. Never replay stock posting. */
const { sql } = require('../config/db');
const { postPaintGRNVoucher } = require('./paintGRNPostingService');

function fail(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode });
}
const round2 = n => Math.round(Number(n) * 100) / 100;

async function postPaintGRNToParty(transaction, { grnId, partyId, user }) {
    if (!Number.isSafeInteger(grnId) || grnId <= 0 || !Number.isSafeInteger(partyId) || partyId <= 0) {
        fail('A valid Paint GRN and supplier are required.');
    }
    const header = await new sql.Request(transaction).input('id', sql.Int, grnId)
        .query('SELECT * FROM paint_GRN WITH (UPDLOCK, HOLDLOCK) WHERE PaintGRNID=@id');
    if (!header.recordset.length) fail('Paint GRN not found.', 404);
    const grn = header.recordset[0];
    if (grn.Status !== 'Posted') fail('Only a posted Cash Paint GRN can be put on party credit.', 409);
    if (grn.PaymentMode !== 'CASH' || grn.VoucherID) {
        fail('This GRN already has a financial posting or is no longer Cash. Refresh the GRN.', 409);
    }
    const totals = ['SubTotal', 'DiscountTotal', 'GSTTotal', 'AITTotal', 'GrandTotal']
        .map(key => Number(grn[key] ?? 0));
    if (totals.some(n => !Number.isFinite(n) || n < 0) || !(totals[4] > 0) ||
        round2(totals[0] - totals[1] + totals[2] + totals[3]) !== round2(totals[4])) {
        fail('The saved GRN totals are invalid or do not balance. Correct them before posting to a party.');
    }
    const returns = await new sql.Request(transaction).input('id', sql.Int, grnId)
        .query(`SELECT TOP (1) PaintGRTNID FROM paint_GRTN WHERE SourcePaintGRNID=@id
                UNION ALL
                SELECT TOP (1) PaintGRNDetailID FROM paint_GRNDetail WHERE PaintGRNID=@id AND ReturnedQty>0`);
    if (returns.recordset.length) fail('This GRN has a Paint Return. Resolve the return before changing its party/payment mode.', 409);
    const existing = await new sql.Request(transaction).input('id', sql.Int, grnId)
        .query(`SELECT TOP (1) VoucherID FROM data_FinanceVoucherInfo
                WHERE SourceDocType='PAINT_GRN' AND SourceDocID=@id
                  AND Status IN ('Draft','Posted') AND ReversesVoucherID IS NULL`);
    if (existing.recordset.length) fail('A financial voucher already exists for this GRN. No second payable was created.', 409);

    const supplier = await new sql.Request(transaction).input('pid', sql.Int, partyId)
        .query(`SELECT p.PartyID, p.PartyName, p.PartyGLID
                FROM gen_PartiesInfo p
                WHERE p.PartyID=@pid AND EXISTS (
                    SELECT 1 FROM dms_PartyBusinessAccess a WHERE a.PartyID=p.PartyID AND a.BusinessKey='PAINT_LAB')`);
    if (!supplier.recordset.length) fail('Select a supplier with Paint Lab business access.');
    if (!supplier.recordset[0].PartyGLID) fail('The selected supplier has no GL account. Set it on the party first.');

    await new sql.Request(transaction).input('id', sql.Int, grnId).input('pid', sql.Int, partyId)
        .query("UPDATE paint_GRN SET PartyID=@pid, PaymentMode='CREDIT' WHERE PaintGRNID=@id");
    const postingNote = `Posted Cash GRN assigned to party credit; stock unchanged. Previous PartyID: ${grn.PartyID || 'none'}.`;
    const voucher = await postPaintGRNVoucher(grnId, user, transaction, { postingNote });
    if (!voucher?.voucherId) fail('No payable voucher was created. The change has been cancelled.');
    await new sql.Request(transaction).input('id', sql.Int, grnId).input('vid', sql.Int, voucher.voucherId)
        .query('UPDATE paint_GRN SET VoucherID=@vid WHERE PaintGRNID=@id');
    return { message: 'Supplier payable posted. Stock quantities and costs are unchanged.',
        VoucherID: voucher.voucherId, VoucherNo: voucher.voucherNo };
}

module.exports = { postPaintGRNToParty };
