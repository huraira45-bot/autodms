/**
 * Sales — Payment Void approval loop.
 *
 * Owner ask 2026-09-18: undoing a payment recorded by mistake must not happen
 * on the spot. It runs through the same three stages as a booking cancellation
 * or a job card unfinalize:
 *
 *   Pending (whoever spotted it) → AMApproved (Accounts Manager) → Executed (Admin)
 *   Side-states: AMRejected, Withdrawn
 *
 * Nothing at all happens to the payment, the booking's paid total or the GL
 * until the admin executes the last stage. Only then is the voucher deleted
 * along with its subsidiary-ledger and pending-cheque rows, the payment marked
 * Reversed with the approved reason, and the booking's paid total corrected
 * (tr_SalesPayments_UpdateBookingPaid counts Posted payments only).
 *
 * A FINALIZED VOUCHER IS NEVER VOIDED (owner rule 2026-09-18). Voiding only
 * ever removes a voucher that is still a Draft — one that has not reached the
 * GL. Once a voucher is finalized, the correction goes through unfinalize or a
 * reversing entry in Accounting instead, and this loop refuses it: at request
 * time, and again at execution in case it was finalized in between.
 */
const { sql, getPool } = require('../config/db');
const { logBookingTransition } = require('./salesBookingController');

const OPEN_STATES = ['Pending', 'AMApproved'];
// Once the vehicle has gone, a payment is history — correct it in Accounting.
const BOOKING_LOCKED = ['Closed', 'Cancelled', 'Delivered', 'GatePassIssued'];

const SELECT_PAYMENT = `
    SELECT p.PaymentID, p.BookingID, p.Amount, p.Status, p.VoucherID, p.VoucherNo,
           b.Status AS BookingStatus, b.NegotiatedPrice, b.BookingNo,
           v.MinimumBookingAmount,
           fv.Status AS VoucherStatus
    FROM   dms_SalesPayments p
    INNER  JOIN dms_SalesBookings b  ON b.BookingID = p.BookingID
    LEFT   JOIN dms_VehicleVariant v ON v.VariantID = b.VehicleVariantID
    LEFT   JOIN data_FinanceVoucherInfo fv ON fv.VoucherID = p.VoucherID`;

/** Refuses anything but a voucher that is still a Draft. */
function assertVoucherVoidable(voucher, voucherNo) {
    if (!voucher || voucher.Status === 'Draft') return;
    throw Object.assign(new Error(
        `Voucher ${voucher.VoucherNo || voucherNo || ''} has been finalized (${voucher.Status}) — a finalized voucher cannot be voided. ` +
        `Request an unfinalize for it, or post a reversing entry in Accounting.`), { statusCode: 409 });
}

/** The undo itself. Runs only from adminExecute, inside its transaction. */
async function applyVoid(tx, payment, user, reason) {
    let voucherAction = 'none';

    if (payment.VoucherID) {
        const vRes = await new sql.Request(tx).input('vid', sql.Int, payment.VoucherID)
            .query(`SELECT Status, VoucherNo FROM data_FinanceVoucherInfo WHERE VoucherID=@vid`);
        const voucher = vRes.recordset[0];
        // It may have been finalized between the AM's approval and now.
        assertVoucherVoidable(voucher, payment.VoucherNo);
        if (!voucher) {
            voucherAction = 'missing';
        } else {
            // Still a Draft: it never reached the GL. Everything pointing at it
            // goes first, or SQL Server refuses with a bare
            // FK_PartyLedger_Voucher message.
            for (const q of [
                `DELETE FROM dms_PartyLedger WHERE VoucherID=@vid OR AllocatedToVoucherID=@vid`,
                `DELETE FROM dms_PendingCheques WHERE ReceiptVoucherID=@vid OR ClearanceVoucherID=@vid`,
                `UPDATE data_FinanceVoucherDetail SET AllocatedToVoucherID=NULL WHERE AllocatedToVoucherID=@vid`,
                `DELETE FROM data_FinanceVoucherDetail WHERE VoucherID=@vid`,
                `DELETE FROM data_FinanceVoucherInfo WHERE VoucherID=@vid`,
            ]) {
                await new sql.Request(tx).input('vid', sql.Int, payment.VoucherID).query(q);
            }
            voucherAction = 'draft_deleted';
        }
    }

    const clearVoucherLink = voucherAction === 'draft_deleted' || voucherAction === 'missing';
    await new sql.Request(tx)
        .input('pid', sql.Int, payment.PaymentID)
        .input('emp', sql.Int, user?.employeeId || null)
        .input('reason', sql.NVarChar(sql.MAX), reason)
        .query(`UPDATE dms_SalesPayments
                SET Status='Reversed', ReversedAt=GETDATE(),
                    ReversedByEmployeeID=@emp, ReversalReason=@reason
                    ${clearVoucherLink ? ', VoucherID=NULL, VoucherNo=NULL' : ''}
                WHERE PaymentID=@pid`);

    // The booking, if this payment is what advanced it.
    const bRes = await new sql.Request(tx).input('bid', sql.Int, payment.BookingID)
        .query(`SELECT Status, AmountPaidToDate FROM dms_SalesBookings WHERE BookingID=@bid`);
    const nowPaid = Number(bRes.recordset[0]?.AmountPaidToDate) || 0;
    const status = bRes.recordset[0]?.Status;
    const minAmt = Number(payment.MinimumBookingAmount) || 0;
    const negotiated = Number(payment.NegotiatedPrice) || 0;

    let newStatus = status;
    if (status === 'PendingPayment' && !(negotiated > 0 && nowPaid >= negotiated - 0.01)) {
        newStatus = (minAmt > 0 && nowPaid >= minAmt) ? 'BookingConfirmed' : 'PendingBookingPayment';
    } else if (status === 'BookingConfirmed' && nowPaid < minAmt) {
        newStatus = 'PendingBookingPayment';
    }
    if (newStatus !== status) {
        await new sql.Request(tx)
            .input('bid', sql.Int, payment.BookingID)
            .input('st', sql.NVarChar(30), newStatus)
            .query(`UPDATE dms_SalesBookings SET Status=@st, UpdatedAt=GETDATE() WHERE BookingID=@bid`);
    }

    return { voucherAction, nowPaid, fromStatus: status, toStatus: newStatus };
}

// POST /api/sales/bookings/:id/payments/:paymentId/void-request   { Reason }
exports.propose = async (req, res) => {
    const bookingId = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);
    const reason = (req.body?.Reason || '').trim();
    if (!Number.isInteger(bookingId) || !Number.isInteger(paymentId)) {
        return res.status(400).json({ error: 'Invalid booking or payment id.' });
    }
    if (reason.length < 5) {
        return res.status(400).json({ error: 'Say why this payment should be voided (at least 5 characters) — the Accounts Manager decides on it.' });
    }
    try {
        const pool = await getPool();
        const pRes = await pool.request()
            .input('pid', sql.Int, paymentId).input('bid', sql.Int, bookingId)
            .query(`${SELECT_PAYMENT} WHERE p.PaymentID=@pid AND p.BookingID=@bid`);
        if (!pRes.recordset.length) return res.status(404).json({ error: 'That payment is not on this booking.' });
        const p = pRes.recordset[0];
        if (p.Status === 'Reversed') return res.status(409).json({ error: 'That payment has already been voided.' });
        if (BOOKING_LOCKED.includes(p.BookingStatus)) {
            return res.status(409).json({
                error: `This booking is ${p.BookingStatus} — a payment cannot be voided once the vehicle has gone. Record a refund, or reverse the voucher in Accounting.`,
            });
        }
        // A finalized voucher is never voided — that correction belongs to the
        // unfinalize loop (owner rule 2026-09-18).
        if (p.VoucherStatus && p.VoucherStatus !== 'Draft') {
            return res.status(409).json({
                error: `Voucher ${p.VoucherNo || ''} has been finalized (${p.VoucherStatus}), so this payment cannot be voided. Request an unfinalize for the voucher, or post a reversing entry in Accounting.`,
                VoucherStatus: p.VoucherStatus,
            });
        }
        const open = await pool.request().input('pid', sql.Int, paymentId)
            .query(`SELECT VoidID, Status FROM dms_SalesPaymentVoidRequests
                    WHERE PaymentID=@pid AND Status IN ('Pending','AMApproved')`);
        if (open.recordset.length) {
            return res.status(409).json({
                error: `A void request for this payment is already ${open.recordset[0].Status === 'Pending' ? 'waiting for the Accounts Manager' : 'approved and waiting for the admin to execute it'}.`,
                VoidID: open.recordset[0].VoidID,
            });
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const ins = await new sql.Request(tx)
                .input('pid', sql.Int, paymentId)
                .input('bid', sql.Int, bookingId)
                .input('amt', sql.Decimal(18, 2), p.Amount)
                .input('vid', sql.Int, p.VoucherID || null)
                .input('vno', sql.NVarChar(50), p.VoucherNo || null)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('reason', sql.NVarChar(sql.MAX), reason)
                .query(`INSERT INTO dms_SalesPaymentVoidRequests
                            (PaymentID, BookingID, Amount, VoucherID, VoucherNo,
                             Status, ProposerEmployeeID, ProposerName, ProposalReason)
                        OUTPUT INSERTED.VoidID
                        VALUES (@pid, @bid, @amt, @vid, @vno,
                                'Pending', @emp, @empN, @reason)`);
            const voidId = ins.recordset[0].VoidID;
            await logBookingTransition(tx, bookingId, p.BookingStatus, p.BookingStatus, req.user,
                `Void requested for payment #${paymentId} (PKR ${Number(p.Amount).toLocaleString()}): ${reason}. Awaiting AM approval.`);
            await tx.commit();
            res.status(201).json({
                message: 'Void requested — the payment stands until the Accounts Manager approves and an admin executes it.',
                VoidID: voidId,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('payment void propose:', err);
        res.status(400).json({ error: err.message });
    }
};

// GET /api/sales/payment-voids?status=&bookingId=
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status)    { r.input('s', sql.NVarChar(20), String(req.query.status)); conds.push('vr.Status=@s'); }
        if (req.query.bookingId) { r.input('b', sql.Int, parseInt(req.query.bookingId));     conds.push('vr.BookingID=@b'); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT vr.VoidID, vr.PaymentID, vr.BookingID, vr.Amount, vr.VoucherNo,
                   vr.Status, vr.ProposerEmployeeID, vr.ProposerName, vr.ProposalReason, vr.ProposedAt,
                   vr.AMDecision, vr.AMName, vr.AMComments, vr.AMDecidedAt,
                   vr.AdminName, vr.AdminNotes, vr.ExecutedAt, vr.VoucherAction,
                   b.BookingNo, b.Status AS BookingStatus, b.AmountPaidToDate,
                   pt.PartyName, p.PaymentMode, p.ReceivedAt, p.Status AS PaymentStatus,
                   fv.Status AS VoucherStatus
            FROM   dms_SalesPaymentVoidRequests vr
            JOIN   dms_SalesBookings b   ON b.BookingID = vr.BookingID
            LEFT   JOIN dms_SalesPayments p ON p.PaymentID = vr.PaymentID
            LEFT   JOIN gen_PartiesInfo pt  ON pt.PartyID = b.PartyID
            LEFT   JOIN data_FinanceVoucherInfo fv ON fv.VoucherID = vr.VoucherID
            ${where}
            ORDER  BY vr.ProposedAt DESC, vr.VoidID DESC`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/payment-voids/:id/am-approve   { Comments? }
exports.amApprove = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_SalesPaymentVoidRequests WHERE VoidID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Void request not found.' });
        const v = cur.recordset[0];
        if (v.Status !== 'Pending') return res.status(409).json({ error: `Already ${v.Status}.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('comm', sql.NVarChar(sql.MAX), req.body?.Comments || null)
                .query(`UPDATE dms_SalesPaymentVoidRequests
                        SET Status='AMApproved', AMEmployeeID=@emp, AMName=@empN,
                            AMDecision='Approved', AMComments=@comm, AMDecidedAt=GETDATE()
                        WHERE VoidID=@id`);
            const bk = await new sql.Request(tx).input('b', sql.Int, v.BookingID)
                .query(`SELECT Status FROM dms_SalesBookings WHERE BookingID=@b`);
            const st = bk.recordset[0]?.Status;
            await logBookingTransition(tx, v.BookingID, st, st, req.user,
                `AM approved the void of payment #${v.PaymentID}: ${req.body?.Comments || '(no comments)'}. Awaiting admin to execute.`);
            await tx.commit();
            res.json({ message: 'Approved — waiting for an admin to execute it.' });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/payment-voids/:id/am-reject   { Reason }
exports.amReject = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = (req.body?.Reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'Reason is required.' });
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_SalesPaymentVoidRequests WHERE VoidID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Void request not found.' });
        const v = cur.recordset[0];
        if (v.Status !== 'Pending') return res.status(409).json({ error: `Already ${v.Status}.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('reason', sql.NVarChar(sql.MAX), reason)
                .query(`UPDATE dms_SalesPaymentVoidRequests
                        SET Status='AMRejected', AMEmployeeID=@emp, AMName=@empN,
                            AMDecision='Rejected', AMComments=@reason, AMDecidedAt=GETDATE()
                        WHERE VoidID=@id`);
            const bk = await new sql.Request(tx).input('b', sql.Int, v.BookingID)
                .query(`SELECT Status FROM dms_SalesBookings WHERE BookingID=@b`);
            const st = bk.recordset[0]?.Status;
            await logBookingTransition(tx, v.BookingID, st, st, req.user,
                `AM rejected the void of payment #${v.PaymentID}: ${reason}. The payment stands.`);
            await tx.commit();
            res.json({ message: 'Rejected — the payment stands.' });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/payment-voids/:id/withdraw — the proposer takes it back
exports.withdraw = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT VoidID, PaymentID, BookingID, Status, ProposerEmployeeID FROM dms_SalesPaymentVoidRequests WHERE VoidID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Void request not found.' });
        const v = cur.recordset[0];
        if (v.Status !== 'Pending') return res.status(409).json({ error: 'Only a request still waiting for the AM can be withdrawn.' });
        if (v.ProposerEmployeeID !== req.user?.employeeId) return res.status(403).json({ error: 'Only the person who requested it can withdraw it.' });

        await pool.request().input('id', sql.Int, id)
            .query(`UPDATE dms_SalesPaymentVoidRequests SET Status='Withdrawn' WHERE VoidID=@id`);
        res.json({ message: 'Void request withdrawn.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/payment-voids/:id/admin-execute   { AdminNotes? }
// The only place a payment is actually voided.
exports.adminExecute = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_SalesPaymentVoidRequests WHERE VoidID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Void request not found.' });
        const v = cur.recordset[0];
        if (v.Status !== 'AMApproved') {
            return res.status(409).json({ error: `The Accounts Manager has to approve this first (currently ${v.Status}).` });
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // Re-read the payment: it may have moved on since the approval.
            const pRes = await new sql.Request(tx)
                .input('pid', sql.Int, v.PaymentID).input('bid', sql.Int, v.BookingID)
                .query(`${SELECT_PAYMENT} WHERE p.PaymentID=@pid AND p.BookingID=@bid`);
            if (!pRes.recordset.length) throw new Error('The payment no longer exists.');
            const p = pRes.recordset[0];
            if (p.Status === 'Reversed') throw new Error('That payment has already been voided.');
            if (BOOKING_LOCKED.includes(p.BookingStatus)) {
                throw new Error(`This booking is now ${p.BookingStatus} — the payment can no longer be voided. Record a refund, or reverse the voucher in Accounting.`);
            }

            const notes = (req.body?.AdminNotes || '').trim();
            const reason = notes ? `${v.ProposalReason} — ${notes}` : v.ProposalReason;
            const out = await applyVoid(tx, p, req.user, reason);

            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('notes', sql.NVarChar(sql.MAX), notes || null)
                .input('va', sql.NVarChar(30), out.voucherAction)
                .query(`UPDATE dms_SalesPaymentVoidRequests
                        SET Status='Executed', AdminEmployeeID=@emp, AdminName=@empN,
                            AdminNotes=@notes, ExecutedAt=GETDATE(),
                            VoucherAction=@va
                        WHERE VoidID=@id`);

            await logBookingTransition(tx, v.BookingID, out.fromStatus, out.toStatus, req.user,
                `Admin executed void #${id} of payment #${v.PaymentID} (PKR ${Number(v.Amount).toLocaleString()}): ${reason}`
                + (out.voucherAction === 'draft_deleted' ? ` Draft voucher ${v.VoucherNo || ''} deleted.` : ''));

            await tx.commit();
            res.json({
                message: 'Payment voided.',
                VoidID: id,
                PaymentID: v.PaymentID,
                VoucherAction: out.voucherAction,
                AmountPaidToDate: out.nowPaid,
                BookingStatus: out.toStatus,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('payment void execute:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};
