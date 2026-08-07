/**
 * Runs AFTER a Sales-module voucher is finalized (Draft -> Posted) via the
 * generic finalizeController.js VOUCHER path. Owner ask 2026-08-07: sales
 * vouchers must sit in Draft for manual review before hitting the GL, so a
 * booking's own operational status can no longer flip the moment the action
 * happens (e.g. "Master invoice posted") — it has to wait until someone
 * actually reviews and posts the voucher. This is that wait's other half:
 * once finalize flips the voucher to Posted, advance whatever booking-side
 * status was left pending.
 *
 * Dispatched from finalizeController.js's POST_COMMIT_HOOKS.VOUCHER, keyed
 * by the voucher's own SourceDocType/SourceDocID (SourceDocID = BookingID
 * for every sales source type below).
 *
 * Only MASTER_INVOICE is wired so far. SALES_PAYMENT / SALES_DELIVERY /
 * SALES_INCENTIVE_ACCRUAL / SALES_INCENTIVE_DISB still auto-post today and
 * are the next ones to convert to this same pattern.
 */
const { sql, getPool } = require('../config/db');

async function handleMasterInvoicePosted(voucherId, bookingId) {
    const pool = await getPool();
    await pool.request()
        .input('bid', sql.Int, bookingId)
        .query(`UPDATE dms_SalesBookings SET Status='MasterInvoicePosted', UpdatedAt=GETDATE()
                WHERE BookingID=@bid AND Status='MasterInvoicePending'`);
}

const HANDLERS = {
    MASTER_INVOICE: handleMasterInvoicePosted,
};

async function handleSalesVoucherPosted(voucherId, sourceDocType, sourceDocId) {
    const handler = HANDLERS[sourceDocType];
    if (!handler) return;
    await handler(voucherId, sourceDocId);
}

module.exports = { handleSalesVoucherPosted };
