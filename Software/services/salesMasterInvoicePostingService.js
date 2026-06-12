/**
 * Master Changan Invoice → ledger posting service.
 *
 * Fires when sales_master_settlement posts the Master invoice for an allocated
 * chassis. Two effects on our books:
 *
 *   1. We take ownership of the chassis at wholesale cost:
 *        Dr VEHICLE_INVENTORY        (WholesalePrice)
 *        Cr MASTER_VEHICLE_PAYABLE   (WholesalePrice)
 *
 *   2. Master incentive for that variant accrues to us (if any std incentive
 *      is defined and the variant has it active):
 *        Dr MASTER_INCENTIVE_RECEIVABLE  (StdIncentiveAmount)
 *        Cr MASTER_INCENTIVE_INCOME      (StdIncentiveAmount)
 *
 * Both legs share the same voucher (one event = one voucher per §14).
 * If the variant has no standard Master incentive, only leg 1 is posted.
 *
 * Subsidiary ledger: a row keyed by PartyID=NULL, BookingID, in dms_PartyLedger
 * for traceability of Master-side amounts — Master is not a "Party" in this DB.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');

async function resolveAccounts() {
    const need = ['VEHICLE_INVENTORY', 'MASTER_VEHICLE_PAYABLE',
                  'MASTER_INCENTIVE_RECEIVABLE', 'MASTER_INCENTIVE_INCOME'];
    const out = {};
    for (const r of need) out[r] = { GLCAID: await resolveRole(r) };
    return out;
}

async function loadBooking(bookingId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, bookingId)
        .query(`SELECT b.BookingID, b.BookingNo, b.PartyID
                FROM dms_SalesBookings b
                WHERE b.BookingID = @id`);
    if (!r.recordset.length) throw new Error(`Booking ${bookingId} not found.`);
    return r.recordset[0];
}

/**
 * Posts the Master invoice voucher. Must run inside the same transaction
 * that updated dms_SalesBookings.Status='MasterInvoicePosted'.
 *
 * @param {number} bookingId
 * @param {object} invoice - { invoiceNo, invoiceDate, wholesalePrice, stdIncentive }
 *                            stdIncentive is the standard Master incentive
 *                            from the variant (0 if none). Special/Additional
 *                            campaign incentives are posted by separate accrual
 *                            vouchers, not here.
 * @returns {number} new VoucherID
 */
async function postMasterInvoiceVoucher(bookingId, invoice, userInfo, transaction) {
    const b = await loadBooking(bookingId, transaction);
    b.MasterInvoiceNo = invoice.invoiceNo;
    b.MasterInvoiceDate = invoice.invoiceDate;
    const wholesale = Number(invoice.wholesalePrice || 0);
    const stdIncentive = Number(invoice.stdIncentive || 0);
    if (wholesale <= 0) throw new Error(`Booking ${b.BookingNo} has no WholesalePrice — cannot post Master invoice voucher.`);

    const acc = await resolveAccounts();

    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='PV'");
    if (!vt.recordset.length) throw new Error('PV voucher type missing');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo`);
    const voucherNo = `PV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    // Total = wholesale + std incentive (gross movement on the voucher)
    const totalAmount = wholesale + (stdIncentive > 0 ? stdIncentive : 0);
    const narration = `Master invoice ${b.MasterInvoiceNo || '(no#)'} for booking ${b.BookingNo}`
        + (stdIncentive > 0 ? ` (incl. Master incentive PKR ${stdIncentive.toLocaleString('en-PK')})` : '');

    const hdrRes = await new sql.Request(transaction)
        .input('vd',   sql.DateTime,     b.MasterInvoiceDate || new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2), totalAmount)
        .input('src',  sql.NVarChar(20), 'MASTER_INVOICE')
        .input('srcId',sql.Int,          b.BookingID)
        .input('cby',  sql.Int,          userInfo?.userId || null)
        .input('cbyN', sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    const insertLine = async (glcaid, dr, cr, lineNarration) => {
        await new sql.Request(transaction)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, glcaid)
            .input('nar', sql.NVarChar(sql.MAX), lineNarration)
            .input('dr',  sql.Decimal(18,2), dr || 0)
            .input('cr',  sql.Decimal(18,2), cr || 0)
            .input('bid', sql.Int, b.BookingID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, BookingID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @bid)`);
    };

    // Leg 1: inventory + payable
    await insertLine(acc.VEHICLE_INVENTORY.GLCAID, wholesale, 0, `Vehicle inventory ↑ for ${b.BookingNo}`);
    await insertLine(acc.MASTER_VEHICLE_PAYABLE.GLCAID, 0, wholesale, `Payable to Master for ${b.BookingNo}`);

    // Leg 2: Master incentive receivable + income (only if there is std incentive)
    if (stdIncentive > 0) {
        await insertLine(acc.MASTER_INCENTIVE_RECEIVABLE.GLCAID, stdIncentive, 0, `Master incentive receivable on ${b.BookingNo}`);
        await insertLine(acc.MASTER_INCENTIVE_INCOME.GLCAID, 0, stdIncentive, `Master incentive earned on ${b.BookingNo}`);
    }

    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Stamp voucher back onto booking
    await new sql.Request(transaction)
        .input('bid', sql.Int, bookingId)
        .input('vid', sql.Int, voucherId)
        .query(`UPDATE dms_SalesBookings SET MasterInvoiceVoucherID=@vid WHERE BookingID=@bid`);

    return voucherId;
}

module.exports = { postMasterInvoiceVoucher };
