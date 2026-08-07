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
 * by the voucher's own SourceDocType. SourceDocID's meaning varies by type
 * (BookingID for most, PaymentID for SALES_PAYMENT — see each handler).
 *
 * All five sales SourceDocTypes now create Draft-only vouchers. Only three
 * need a handler here (MASTER_INVOICE, SALES_PAYMENT, SALES_DELIVERY) —
 * SALES_INCENTIVE_ACCRUAL and SALES_INCENTIVE_DISB have no booking-status
 * to defer (their application-level state already updates unconditionally,
 * independent of the voucher/GL — see salesIncentivePostingService.js), so
 * finalizing those is a no-op here by design, not an oversight.
 */
const { sql, getPool } = require('../config/db');

const addDaysISO = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

async function logTransition(pool, bookingId, fromState, toState, user, reason) {
    await pool.request()
        .input('bid', sql.Int, bookingId)
        .input('from', sql.NVarChar(30), fromState)
        .input('to', sql.NVarChar(30), toState)
        .input('name', sql.NVarChar(100), user?.userName || null)
        .input('reason', sql.NVarChar(sql.MAX), reason)
        .query(`INSERT INTO dms_BookingStateTransitions
                    (BookingID, FromState, ToState, ActorName, Reason)
                VALUES (@bid, @from, @to, @name, @reason)`);
}

async function handleMasterInvoicePosted(voucherId, bookingId, user) {
    const pool = await getPool();
    const r = await pool.request()
        .input('bid', sql.Int, bookingId)
        .query(`UPDATE dms_SalesBookings SET Status='MasterInvoicePosted', UpdatedAt=GETDATE()
                OUTPUT DELETED.Status AS PrevStatus
                WHERE BookingID=@bid AND Status='MasterInvoicePending'`);
    if (!r.recordset.length) return; // already advanced, or not in the expected state — no-op
    await logTransition(pool, bookingId, 'MasterInvoicePending', 'MasterInvoicePosted', user,
        `Master invoice voucher #${voucherId} finalized.`);
}

// SourceDocID for SALES_PAYMENT is the PaymentID, not the BookingID — the
// payment can arrive well before its voucher gets reviewed, and other
// payments may land on the same booking in the meantime, so this re-checks
// the CURRENT totals rather than trusting whatever was true when the
// payment was first recorded (mirrors salesBookingController.recordPayment's
// willConfirmBooking / willFlagFullyPaid logic).
async function handleSalesPaymentPosted(voucherId, paymentId, user) {
    const pool = await getPool();
    const p = await pool.request().input('id', sql.Int, paymentId)
        .query(`SELECT BookingID FROM dms_SalesPayments WHERE PaymentID=@id`);
    const bookingId = p.recordset[0]?.BookingID;
    if (!bookingId) return;

    const bk = await pool.request().input('id', sql.Int, bookingId)
        .query(`SELECT b.Status, b.AmountPaidToDate, b.NegotiatedPrice, v.MinimumBookingAmount
                FROM dms_SalesBookings b
                LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
                WHERE b.BookingID=@id`);
    const b = bk.recordset[0];
    if (!b) return;

    const minAmt = Number(b.MinimumBookingAmount) || 0;
    const negotiated = Number(b.NegotiatedPrice) || 0;
    const paid = Number(b.AmountPaidToDate) || 0;

    const willConfirmBooking = b.Status === 'PendingBookingPayment' && paid >= minAmt;
    const willFlagFullyPaid = ['PendingBookingPayment', 'BookingConfirmed'].includes(b.Status)
        && negotiated > 0 && paid >= negotiated - 0.01;

    if (willConfirmBooking && !willFlagFullyPaid) {
        await pool.request().input('id', sql.Int, bookingId)
            .query(`UPDATE dms_SalesBookings SET Status='BookingConfirmed', UpdatedAt=GETDATE() WHERE BookingID=@id`);
        await logTransition(pool, bookingId, 'PendingBookingPayment', 'BookingConfirmed', user,
            `Minimum booking amount (PKR ${minAmt.toLocaleString()}) confirmed on payment voucher #${voucherId} finalize.`);
    } else if (willFlagFullyPaid) {
        const fromState = b.Status;
        await pool.request().input('id', sql.Int, bookingId)
            .query(`UPDATE dms_SalesBookings SET Status='PendingPayment', UpdatedAt=GETDATE() WHERE BookingID=@id`);
        await logTransition(pool, bookingId, fromState, 'PendingPayment', user,
            `Booking fully paid (PKR ${paid.toLocaleString()} of ${negotiated.toLocaleString()}) confirmed on payment voucher #${voucherId} finalize. Ready for vehicle allocation.`);
    }
}

// Owner ask 2026-08-07 (explicit, strict choice for Gate Pass specifically):
// the vehicle does not release and the booking does not close until the
// delivery voucher is finalized — unlike Master Invoice / Payment, there is
// no "release now, GL catches up" fallback here even though this delays a
// physical vehicle handover. Mirrors the recovery-plan + vehicle/booking
// updates that issueGatePass used to do immediately (see
// createRecoveryPlanIfNeeded / the else-branch in salesLifecycleController.js).
async function handleSalesDeliveryPosted(voucherId, bookingId, user) {
    const pool = await getPool();
    const bk = await pool.request().input('id', sql.Int, bookingId)
        .query(`SELECT Status, AllocatedVehicleID, NegotiatedPrice, AmountPaidToDate
                FROM dms_SalesBookings WHERE BookingID=@id`);
    const b = bk.recordset[0];
    if (!b || b.Status !== 'GatePassIssued') return; // already closed, or not in the expected state

    const paidPct = b.NegotiatedPrice > 0 ? Number(b.AmountPaidToDate) / Number(b.NegotiatedPrice) * 100 : 0;
    const fullyPaid = paidPct >= 100;

    await pool.request().input('id', sql.Int, bookingId)
        .query(`UPDATE dms_SalesBookings
                SET Status='Closed',
                    GatePassIssuedAt=GETDATE(),
                    DeliveredAt=COALESCE(DeliveredAt, GETDATE()),
                    ClosedAt=GETDATE(),
                    UpdatedAt=GETDATE()
                WHERE BookingID=@id`);

    if (b.AllocatedVehicleID) {
        await pool.request().input('vid', sql.Int, b.AllocatedVehicleID)
            .query(`UPDATE dms_Vehicle SET Status='Sold', SoldDeliveredAt=GETDATE(), UpdatedAt=GETDATE() WHERE VehicleID=@vid`);
        await pool.request().input('vid', sql.Int, b.AllocatedVehicleID).input('bid', sql.Int, bookingId)
            .query(`UPDATE dms_OpenAllocationLedger
                    SET Status='Sold', SoldAt=GETDATE(), SoldToBookingID=@bid
                    WHERE VehicleID=@vid AND Status='AtDealer'`);
    }

    await logTransition(pool, bookingId, 'GatePassIssued', 'Closed', user,
        `Delivery voucher #${voucherId} finalized — vehicle released. ${fullyPaid ? 'Fully paid.' : `Partial delivery (${paidPct.toFixed(1)}% paid; remainder reclassified to receivable).`}`);

    if (!fullyPaid) {
        const remainder = Number(b.NegotiatedPrice) - Number(b.AmountPaidToDate);
        if (remainder > 0.01) {
            const planIns = await pool.request()
                .input('bid',  sql.Int,             bookingId)
                .input('rem',  sql.Decimal(18,2),   remainder)
                .input('json', sql.NVarChar(sql.MAX),
                       JSON.stringify([{ DueDate: addDaysISO(30), AmountDue: remainder, Notes: 'Auto-created at gate pass finalize — adjust schedule.' }]))
                .input('cbyN', sql.NVarChar(100),   user?.userName || null)
                .query(`INSERT INTO dms_SalesRecoveryPlans
                            (BookingID, TotalRemainingAtDelivery, InstallmentsJSON, Status, CreatedByName)
                        OUTPUT INSERTED.RecoveryPlanID
                        VALUES (@bid, @rem, @json, 'Active', @cbyN)`);
            const planId = planIns.recordset[0].RecoveryPlanID;
            await pool.request()
                .input('pid', sql.Int,           planId)
                .input('bid', sql.Int,           bookingId)
                .input('due', sql.Date,          addDaysISO(30))
                .input('amt', sql.Decimal(18,2), remainder)
                .query(`INSERT INTO dms_SalesRecoveryInstallments
                            (RecoveryPlanID, BookingID, SeqNo, DueDate, AmountDue, Notes)
                        VALUES (@pid, @bid, 1, @due, @amt, 'Auto-created at gate pass finalize — adjust schedule.')`);
        }
    }
}

const HANDLERS = {
    MASTER_INVOICE: handleMasterInvoicePosted,
    SALES_PAYMENT: handleSalesPaymentPosted,
    SALES_DELIVERY: handleSalesDeliveryPosted,
};

async function handleSalesVoucherPosted(voucherId, sourceDocType, sourceDocId, user) {
    const handler = HANDLERS[sourceDocType];
    if (!handler) return;
    await handler(voucherId, sourceDocId, user);
}

module.exports = { handleSalesVoucherPosted };
