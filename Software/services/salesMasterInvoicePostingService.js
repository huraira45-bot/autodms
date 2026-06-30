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

// Agency model (migration 045): Master invoices the customer directly, not us.
// We never own the vehicle, so this step posts NO inventory/payable legs.
// The only GL effect is the Master incentive accrual.
async function resolveAccounts() {
    const need = ['MASTER_INCENTIVE_RECEIVABLE', 'MASTER_INCENTIVE_INCOME'];
    const out = {};
    for (const r of need) out[r] = { GLCAID: await resolveRole(r) };
    return out;
}

async function loadBooking(bookingId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, bookingId)
        .query(`SELECT b.BookingID, b.BookingNo, b.PartyID, b.AllocatedVehicleID
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
    const stdIncentive = Number(invoice.stdIncentive || 0);
    if (stdIncentive <= 0) {
        // No incentive accrual to record. Master invoice arrival is just a
        // memo on the booking — caller (controller) handles the stamp.
        return null;
    }

    const acc = await resolveAccounts();

    // Use JV voucher type — agency model has no purchase to record
    const vt = await new sql.Request(transaction).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
    if (!vt.recordset.length) throw new Error('JV voucher type missing');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo`);
    const voucherNo = `JV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const totalAmount = stdIncentive;
    const narration = `Master incentive accrued on Master invoice ${b.MasterInvoiceNo || '(no#)'} for booking ${b.BookingNo} (PKR ${stdIncentive.toLocaleString('en-PK')})`;

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

    // Agency model: only the incentive accrual is posted here.
    {
        await insertLine(acc.MASTER_INCENTIVE_RECEIVABLE.GLCAID, stdIncentive, 0, `Master incentive receivable on ${b.BookingNo}`);
        await insertLine(acc.MASTER_INCENTIVE_INCOME.GLCAID, 0, stdIncentive, `Master incentive earned on ${b.BookingNo}`);
    }

    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Stamp voucher back onto the vehicle (per migration 018: MasterInvoiceVoucherID
    // lives on dms_Vehicle, not dms_SalesBookings).
    if (b.AllocatedVehicleID) {
        await new sql.Request(transaction)
            .input('vehid', sql.Int, b.AllocatedVehicleID)
            .input('vid',   sql.Int, voucherId)
            .query(`UPDATE dms_Vehicle SET MasterInvoiceVoucherID=@vid, UpdatedAt=GETDATE()
                    WHERE VehicleID=@vehid`);
    }

    // Write the matching accrual row so the Master Incentive page can drive
    // an MRV receipt against it. Per migration 023's accrual schema.
    await new sql.Request(transaction)
        .input('bid',   sql.Int,           b.BookingID)
        .input('vehid', sql.Int,           b.AllocatedVehicleID || null)
        .input('amt',   sql.Decimal(18,2), stdIncentive)
        .input('vid',   sql.Int,           voucherId)
        .input('vno',   sql.NVarChar(20),  voucherNo)
        .query(`INSERT INTO dms_SalesIncentiveAccruals
                    (BookingID, VehicleID, EarnerType, IncentiveCategory,
                     AmountAccrued, AccrualVoucherID, AccrualVoucherNo, Status)
                VALUES (@bid, @vehid, 'Master', 'Standard',
                        @amt, @vid, @vno, 'Accrued')`);

    return voucherId;
}

module.exports = { postMasterInvoiceVoucher };
