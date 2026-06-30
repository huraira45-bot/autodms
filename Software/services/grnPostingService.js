/**
 * GRN finalize → ledger posting service.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.7.
 *
 * Orchestration only — math lives in utils/grnJournalBuilder.js (pure).
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { buildGRNJournalLines } = require('../utils/grnJournalBuilder');

async function resolveGRNAccounts(/* transaction */) {
    return {
        INVENTORY_PARTS:           { GLCAID: await resolveRole('INVENTORY_PARTS') },
        INPUT_GST:                 { GLCAID: await resolveRole('INPUT_GST') },
        PARTS_DISCOUNT_RECEIVED:   { GLCAID: await resolveRole('PARTS_DISCOUNT_RECEIVED') },
        ADVANCE_TAX_236G_PARTS:    { GLCAID: await resolveRole('ADVANCE_TAX_236G_PARTS') },
    };
}

// Each supplier carries its own A/P leaf in gen_PartiesInfo.PartyGLID.
// Load it here; throws if missing so the user sees a clear error.
async function loadSupplierGL(partyId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, partyId)
        .query('SELECT PartyName, PartyGLID FROM gen_PartiesInfo WHERE PartyID=@id');
    if (!r.recordset.length) throw new Error(`Supplier party #${partyId} not found.`);
    const p = r.recordset[0];
    if (!p.PartyGLID) throw new Error(`Supplier "${p.PartyName}" has no GL account linked. Edit the party and pick one before finalizing the GRN.`);
    return { GLCAID: p.PartyGLID };
}

async function loadGRNData(purchaseId, transaction) {
    const hdr = await new sql.Request(transaction)
        .input('id', sql.Int, purchaseId)
        .query(`SELECT PurchaseID, PurchaseVoucherNo, PartyID, FreightAmount,
                       NetDiscount, FreightTaxable
                FROM data_PurchaseInfo WHERE PurchaseID=@id`);
    if (!hdr.recordset.length) throw new Error(`GRN ${purchaseId} not found.`);

    const lines = await new sql.Request(transaction)
        .input('id', sql.Int, purchaseId)
        .query(`SELECT PurchaseDetailID, ItemId, Quantity, ItemRate,
                       TaxRate, TaxAmount, UnitLandedCost,
                       DiscountAmount,
                       AdditionalDiscountAmount,
                       AITAmount
                FROM data_PurchaseDetail WHERE PurchaseID=@id`);

    return { grn: hdr.recordset[0], lines: lines.recordset };
}

/**
 * Posts the voucher for a finalized GRN.
 * Called inside the transaction that already updated IsFinalized=1.
 */
async function postGRNVoucher(purchaseId, userInfo, transaction) {
    const { grn, lines } = await loadGRNData(purchaseId, transaction);
    const accounts = await resolveGRNAccounts(transaction);
    const supplierGL = await loadSupplierGL(grn.PartyID, transaction);
    const built = buildGRNJournalLines({ grn, lines, accounts, supplierGL });

    if (built.lines.length === 0) return null;

    // PV voucher type
    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='PV'");
    if (!vt.recordset.length) throw new Error('PV voucher type missing — run migration 001.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    // Generate sequential voucher number
    const seqRes = await new sql.Request(transaction).query(
        "SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo"
    );
    const voucherNo = `PV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    // Insert header as Draft
    const hdrRes = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,     new Date())
        .input('vno',     sql.NVarChar(50), voucherNo)
        .input('vtId',    sql.Int,          voucherTypeId)
        .input('remarks', sql.NVarChar(sql.MAX), built.header.Narration)
        .input('total',   sql.Decimal(18,2), built.header.TotalAmount)
        .input('src',     sql.NVarChar(20), built.header.SourceDocType)
        .input('srcId',   sql.Int,          built.header.SourceDocID)
        .input('cby',     sql.Int,          userInfo?.userId || null)
        .input('cbyN',    sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @remarks, @total,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    // Insert detail lines
    for (const line of built.lines) {
        await new sql.Request(transaction)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           line.GLCAID)
            .input('nar',  sql.NVarChar(sql.MAX), line.Narration)
            .input('dr',   sql.Decimal(18,2), line.Debit  || 0)
            .input('cr',   sql.Decimal(18,2), line.Credit || 0)
            .input('pid',  sql.Int,           line.PartyID  || null)
            .input('jcid', sql.Int,           line.JobCardID || null)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid)`);
    }

    // Subsidiary writes (supplier ledger)
    for (const sub of built.subsidiaryWrites) {
        await new sql.Request(transaction)
            .input('pid',  sql.Int,           sub.PartyID || null)
            .input('jcid', sql.Int,           sub.JobCardID || null)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           sub.GLCAID)
            .input('dr',   sql.Decimal(18,2), sub.Debit  || 0)
            .input('cr',   sql.Decimal(18,2), sub.Credit || 0)
            .input('nar',  sql.NVarChar(500), sub.Narration || null)
            .query(`INSERT INTO dms_PartyLedger
                        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @jcid, @vid, @gl, @dr, @cr, @nar)`);
    }

    // Flip Status to 'Posted' — fires balanced-entry trigger
    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return voucherId;
}

module.exports = { postGRNVoucher };
