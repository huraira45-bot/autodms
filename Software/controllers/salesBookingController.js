/**
 * Sales Module — Booking + Negotiation controllers.
 *
 * Source spec: .claude/planning/sales-module-design.md §10 (negotiation), §11 (payments), §18 (state machine).
 *
 * State machine (decision #14, zero-threshold negotiation):
 *
 *   Draft ──no discount──> PendingPayment
 *         ──discount──> PendingApproval ──approve──> PendingPayment
 *                                       ──reject──> Draft
 *
 *   Later states (Allocated/MasterInvoicePending/.../Closed) are driven by
 *   allocation, invoice posting, delivery, gate pass — built in Phase 3+.
 *
 * Every state change writes a row to dms_BookingStateTransitions.
 */
const { sql, getPool } = require('../config/db');
const incentive = require('./salesIncentiveController');

// ============================================================================
// Helpers
// ============================================================================

async function nextBookingNo(tx) {
    const y = new Date().getFullYear();
    const r = await new sql.Request(tx).query(
        `SELECT ISNULL(MAX(CAST(SUBSTRING(BookingNo, 9, 10) AS INT)), 0) + 1 AS nextNo
         FROM dms_SalesBookings
         WHERE BookingNo LIKE 'BK-${y}-%'`
    );
    return `BK-${y}-${String(r.recordset[0].nextNo).padStart(4, '0')}`;
}

async function logTransition(tx, bookingId, fromState, toState, user, reason = null) {
    await new sql.Request(tx)
        .input('bid', sql.Int, bookingId)
        .input('from', sql.NVarChar(30), fromState)
        .input('to', sql.NVarChar(30), toState)
        .input('emp', sql.Int, user?.employeeId || null)
        .input('name', sql.NVarChar(100), user?.userName || null)
        .input('role', sql.NVarChar(50), user?.groupTitle || null)
        .input('reason', sql.NVarChar(sql.MAX), reason)
        .query(`INSERT INTO dms_BookingStateTransitions
                    (BookingID, FromState, ToState, ActorEmployeeID, ActorName, ActorRole, Reason)
                VALUES (@bid, @from, @to, @emp, @name, @role, @reason)`);
}

// ============================================================================
// BOOKINGS
// ============================================================================

// GET /api/sales/bookings?status=&executiveId=&search=&corpPO=
exports.listBookings = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status)       { r.input('s', sql.NVarChar(30), req.query.status); conds.push('b.Status=@s'); }
        if (req.query.executiveId)  { r.input('exe', sql.Int, parseInt(req.query.executiveId)); conds.push('b.CreatedBy_SalesExecutiveID=@exe'); }
        if (req.query.partyId)      { r.input('pid', sql.Int, parseInt(req.query.partyId)); conds.push('b.PartyID=@pid'); }
        if (req.query.corpPO)       { r.input('cp', sql.NVarChar(100), req.query.corpPO); conds.push('b.CorporatePONumber=@cp'); }
        // "my bookings" — filter to executive's own
        if (req.query.assignedToMe && req.user?.employeeId) {
            r.input('me', sql.Int, req.user.employeeId);
            conds.push('b.CreatedBy_SalesExecutiveID=@me');
        }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(b.BookingNo LIKE @q OR p.PartyName LIKE @q OR b.CorporatePONumber LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT b.BookingID, b.BookingNo, b.Status,
                   b.PartyID, p.PartyName, p.PartyType, p.PhoneOne,
                   b.VehicleModelID, m.ModelCode, m.ModelName,
                   b.VehicleVariantID, v.VariantCode, v.VariantName,
                   b.AllocatedVehicleID, veh.ChasisNo AS AllocatedChasisNo,
                   b.StandardPrice, b.NegotiatedPrice, b.DiscountAmount, b.DiscountPct,
                   b.AmountPaidToDate, b.PremiumAmount,
                   b.CorporatePONumber, b.AllowPartialDelivery,
                   b.CreatedBy_SalesExecutiveID, e.EmployeeName AS SalesExecutiveName,
                   b.CreatedAt, b.CreatedByName,
                   b.DeliveredAt, b.GatePassIssuedAt, b.ClosedAt, b.CancelledAt
            FROM dms_SalesBookings b
            LEFT JOIN gen_PartiesInfo   p   ON b.PartyID = p.PartyID
            LEFT JOIN dms_VehicleModel  m   ON b.VehicleModelID = m.ModelID
            LEFT JOIN dms_VehicleVariant v  ON b.VehicleVariantID = v.VariantID
            LEFT JOIN dms_Vehicle       veh ON b.AllocatedVehicleID = veh.VehicleID
            LEFT JOIN gen_EmployeeInfo  e   ON b.CreatedBy_SalesExecutiveID = e.EmployeeID
            ${where}
            ORDER BY
                CASE b.Status
                    WHEN 'PendingApproval' THEN 0
                    WHEN 'PendingPayment' THEN 1
                    WHEN 'Allocated' THEN 2
                    WHEN 'MasterInvoicePending' THEN 3
                    WHEN 'MasterInvoicePosted' THEN 4
                    WHEN 'ReadyForDelivery' THEN 5
                    WHEN 'DeliveryApproved' THEN 6
                    WHEN 'GatePassIssued' THEN 7
                    WHEN 'Closed' THEN 8
                    ELSE 9
                END,
                b.CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/sales/bookings/:id
exports.getBooking = async (req, res) => {
    try {
        const pool = await getPool();
        const id = parseInt(req.params.id);
        const bk = await pool.request().input('id', sql.Int, id).query(`
            SELECT b.*, p.PartyName, p.PartyType, p.PhoneOne,
                   m.ModelCode, m.ModelName, m.BrandName,
                   v.VariantCode, v.VariantName, v.WholesalePrice,
                   v.StandardIncentiveAmount, v.StandardIncentiveTaxTreatment,
                   veh.ChasisNo AS AllocatedChasisNo, veh.EngineNo AS AllocatedEngineNo,
                   veh.Color AS AllocatedColor,
                   e.EmployeeName AS SalesExecutiveName
            FROM dms_SalesBookings b
            LEFT JOIN gen_PartiesInfo   p   ON b.PartyID = p.PartyID
            LEFT JOIN dms_VehicleModel  m   ON b.VehicleModelID = m.ModelID
            LEFT JOIN dms_VehicleVariant v  ON b.VehicleVariantID = v.VariantID
            LEFT JOIN dms_Vehicle       veh ON b.AllocatedVehicleID = veh.VehicleID
            LEFT JOIN gen_EmployeeInfo  e   ON b.CreatedBy_SalesExecutiveID = e.EmployeeID
            WHERE b.BookingID=@id
        `);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found' });

        const payments = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_SalesPayments WHERE BookingID=@id ORDER BY ReceivedAt DESC`);
        const transitions = await pool.request().input('id', sql.Int, id)
            .query(`SELECT TOP 50 * FROM dms_BookingStateTransitions WHERE BookingID=@id ORDER BY At DESC`);
        const negotiation = await pool.request().input('id', sql.Int, id)
            .query(`SELECT TOP 5 * FROM dms_NegotiationRequests WHERE BookingID=@id ORDER BY ProposedAt DESC`);

        // Cumulative amount forwarded to Master against this booking — sum of
        // BOOKING_VARIANT_RECEIVABLE Dr legs tagged with the booking. Used by
        // the UI to show remaining-to-pay-master and toggle the Pay Master button.
        const masterPaidR = await pool.request().input('id', sql.Int, id).query(`
            SELECT ISNULL(SUM(d.Debit - d.Credit), 0) AS AmountPaidToMaster
            FROM data_FinanceVoucherDetail d
            INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
            INNER JOIN dms_SystemAccounts      sa ON sa.GLCAID    = d.GLCAID
            WHERE v.Status='Posted'
              AND sa.RoleKey='BOOKING_VARIANT_RECEIVABLE'
              AND d.BookingID=@id`);

        res.json({
            ...bk.recordset[0],
            AmountPaidToMaster: Number(masterPaidR.recordset[0]?.AmountPaidToMaster || 0),
            payments: payments.recordset,
            transitions: transitions.recordset,
            negotiations: negotiation.recordset,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/bookings
// body: { PartyID, VehicleVariantID, NegotiatedPrice?, CorporatePONumber?, SourceInquiryID? }
exports.createBooking = async (req, res) => {
    try {
        const b = req.body || {};
        const errors = [];
        if (!b.PartyID) errors.push('PartyID is required');
        if (!b.VehicleVariantID) errors.push('VehicleVariantID is required');
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });

        const pool = await getPool();

        // Pull variant data to get the standard price + model id + min booking amount
        const vr = await pool.request().input('vid', sql.Int, parseInt(b.VehicleVariantID))
            .query(`SELECT VariantID, ModelID, StandardPrice, MinimumBookingAmount FROM dms_VehicleVariant WHERE VariantID=@vid AND IsActive=1`);
        if (!vr.recordset.length) return res.status(400).json({ error: 'Variant not found or inactive.' });
        const variant = vr.recordset[0];
        const standardPrice = Number(variant.StandardPrice);
        const minBookingAmt = Number(variant.MinimumBookingAmount) || 0;
        const negotiated = b.NegotiatedPrice != null ? Number(b.NegotiatedPrice) : standardPrice;
        if (negotiated <= 0 || negotiated > standardPrice) {
            return res.status(400).json({ error: 'NegotiatedPrice must be 0 < value ≤ StandardPrice.' });
        }
        const needsApproval = negotiated < standardPrice;

        const executiveId = req.user?.employeeId;
        if (!executiveId) return res.status(400).json({ error: 'User must have a linked employee record (LinkedEmployeeID) to create a booking.' });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const bookingNo = await nextBookingNo(tx);
            // Decision: if variant has MinimumBookingAmount > 0, the booking starts in PendingBookingPayment
            // until that amount is collected. Discount approval flow takes precedence (PendingApproval) when applicable.
            // Once minimum is paid, the auto-trigger advances state to BookingConfirmed (and then to PendingPayment/PendingApproval).
            const initialStatus = needsApproval ? 'PendingApproval'
                : (minBookingAmt > 0 ? 'PendingBookingPayment' : 'PendingPayment');

            const r = await new sql.Request(tx)
                .input('no', sql.NVarChar(20), bookingNo)
                .input('pid', sql.Int, parseInt(b.PartyID))
                .input('mid', sql.Int, variant.ModelID)
                .input('vid', sql.Int, variant.VariantID)
                .input('sp', sql.Decimal(18, 2), standardPrice)
                .input('np', sql.Decimal(18, 2), negotiated)
                .input('st', sql.NVarChar(30), initialStatus)
                .input('exe', sql.Int, executiveId)
                .input('exeN', sql.NVarChar(100), req.user?.userName || null)
                .input('po', sql.NVarChar(100), b.CorporatePONumber || null)
                .input('iq', sql.Int, b.SourceInquiryID || null)
                .query(`INSERT INTO dms_SalesBookings
                            (BookingNo, PartyID, VehicleModelID, VehicleVariantID,
                             StandardPrice, NegotiatedPrice, Status,
                             CreatedBy_SalesExecutiveID, CreatedByName,
                             CorporatePONumber, SourceInquiryID)
                        OUTPUT INSERTED.BookingID
                        VALUES (@no, @pid, @mid, @vid, @sp, @np, @st, @exe, @exeN, @po, @iq)`);
            const bookingId = r.recordset[0].BookingID;

            // If this booking originated from a CRO inquiry, flip the inquiry to Converted
            if (b.SourceInquiryID) {
                await new sql.Request(tx)
                    .input('iq', sql.Int, Number(b.SourceInquiryID))
                    .query(`UPDATE dms_CRO_Inquiries
                            SET Status='Converted', ClosedAt=GETDATE()
                            WHERE InquiryID=@iq AND Status IN ('Open','InProgress')`);
            }

            await logTransition(tx, bookingId, 'Draft', initialStatus, req.user,
                needsApproval ? `Discount ${(standardPrice - negotiated).toLocaleString()} (${((standardPrice - negotiated) / standardPrice * 100).toFixed(2)}%) — pending sales_admin_pricing approval`
                              : minBookingAmt > 0
                                ? `No discount. Awaiting minimum booking payment of PKR ${minBookingAmt.toLocaleString()}.`
                                : 'No discount, no minimum booking amount — open for payments.');

            // If discount, fire a NegotiationRequest row
            if (needsApproval) {
                if (!b.NegotiationReason?.trim() || b.NegotiationReason.trim().length < 5) {
                    await tx.rollback();
                    return res.status(400).json({ error: 'NegotiationReason is required (≥ 5 chars) when NegotiatedPrice < StandardPrice.' });
                }
                const nr = await new sql.Request(tx)
                    .input('bid', sql.Int, bookingId)
                    .input('sp', sql.Decimal(18, 2), standardPrice)
                    .input('pp', sql.Decimal(18, 2), negotiated)
                    .input('reason', sql.NVarChar(sql.MAX), b.NegotiationReason.trim())
                    .input('exe', sql.Int, executiveId)
                    .input('exeN', sql.NVarChar(100), req.user?.userName || null)
                    .query(`INSERT INTO dms_NegotiationRequests
                                (BookingID, StandardPrice, ProposedPrice, Reason, ProposerEmpID, ProposerName)
                            OUTPUT INSERTED.RequestID
                            VALUES (@bid, @sp, @pp, @reason, @exe, @exeN)`);
                const reqId = nr.recordset[0].RequestID;
                await new sql.Request(tx).input('rid', sql.Int, reqId).input('bid', sql.Int, bookingId)
                    .query(`UPDATE dms_SalesBookings SET PriceApprovalID=@rid WHERE BookingID=@bid`);
            } else {
                // No discount — booking is final, accrue staff incentive immediately (decision #8)
                await incentive.accrueForBooking(tx, bookingId);
            }

            await tx.commit();
            res.status(201).json({ message: 'Booking created', BookingID: bookingId, BookingNo: bookingNo, Status: initialStatus, NeedsApproval: needsApproval });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('createBooking:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/bookings/:id/cancel  { Reason }
// Behavior depends on booking state:
//   - Before BookingConfirmed (no minimum payment yet) → immediate cancel by executive.
//   - After BookingConfirmed → goes through 3-step finalization loop:
//       Executive proposes (this endpoint) → AM approves → Admin executes.
//   Until executed, booking sits in 'PendingCancelApproval' status.
exports.cancelBooking = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = req.body?.Reason?.trim();
        if (!reason || reason.length < 5) return res.status(400).json({ error: 'Reason is required (min 5 chars).' });

        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT Status FROM dms_SalesBookings WHERE BookingID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const status = cur.recordset[0].Status;
        if (['Closed', 'Cancelled', 'GatePassIssued', 'PendingCancelApproval', 'CancellationApproved'].includes(status)) {
            return res.status(409).json({ error: `Cannot cancel from ${status}.` });
        }

        // For pre-confirmation states, executive can cancel directly (no minimum paid, no finalization loop needed)
        const immediateCancelStates = ['Draft', 'PendingApproval', 'PendingBookingPayment'];
        const goesThroughLoop = !immediateCancelStates.includes(status);

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            if (goesThroughLoop) {
                // Stage 1 of 3: open a cancellation request. Booking flips to PendingCancelApproval.
                await new sql.Request(tx)
                    .input('bid', sql.Int, id)
                    .input('reason', sql.NVarChar(sql.MAX), reason)
                    .input('emp', sql.Int, req.user?.employeeId || null)
                    .input('empN', sql.NVarChar(100), req.user?.userName || null)
                    .query(`INSERT INTO dms_SalesBookingCancellations
                                (BookingID, Status, ProposerEmployeeID, ProposerName, ProposalReason)
                            VALUES (@bid, 'Pending', @emp, @empN, @reason)`);
                await new sql.Request(tx).input('id', sql.Int, id)
                    .query(`UPDATE dms_SalesBookings SET Status='PendingCancelApproval', UpdatedAt=GETDATE() WHERE BookingID=@id`);
                await logTransition(tx, id, status, 'PendingCancelApproval', req.user,
                    `Cancellation proposed by ${req.user?.userName || 'executive'}: ${reason}. Awaiting AM approval.`);
                await tx.commit();
                return res.json({ message: 'Cancellation proposed — awaiting AM approval (finalization loop)', Stage: 'AwaitingAMApproval' });
            }

            // Pre-confirmation: immediate cancellation
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('reason', sql.NVarChar(sql.MAX), reason)
                .input('by', sql.Int, req.user?.employeeId || null)
                .input('byN', sql.NVarChar(100), req.user?.userName || null)
                .query(`UPDATE dms_SalesBookings
                        SET Status='Cancelled', CancelledAt=GETDATE(), CancellationReason=@reason,
                            UpdatedAt=GETDATE(), UpdatedByEmployeeID=@by, UpdatedByName=@byN
                        WHERE BookingID=@id`);
            await logTransition(tx, id, status, 'Cancelled', req.user, reason);
            await new sql.Request(tx).input('id', sql.Int, id)
                .query(`UPDATE dms_NegotiationRequests SET Status='Withdrawn', DecidedAt=GETDATE()
                        WHERE BookingID=@id AND Status='Pending'`);
            await incentive.reverseForBooking(tx, id, `Booking cancelled (pre-confirmation): ${reason}`);
            await tx.commit();
            res.json({ message: 'Cancelled (no minimum payment received yet — no AM approval required)', Stage: 'Cancelled' });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============================================================================
// CANCELLATION APPROVAL LOOP (Stage 2 + 3) — AM approves, Admin executes
// ============================================================================

// GET /api/sales/cancellations?status=Pending
exports.listCancellations = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status) { r.input('s', sql.NVarChar(20), req.query.status); conds.push('c.Status=@s'); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT c.CancellationID, c.BookingID, b.BookingNo, b.Status AS BookingStatus,
                   b.NegotiatedPrice, b.AmountPaidToDate,
                   p.PartyName, m.ModelCode, v.VariantName,
                   c.Status, c.ProposerEmployeeID, c.ProposerName, c.ProposalReason, c.ProposedAt,
                   c.AMDecision, c.AMName, c.AMComments, c.AMDecidedAt,
                   c.AdminName, c.AdminNotes, c.ExecutedAt, c.RefundAmount
            FROM dms_SalesBookingCancellations c
            JOIN dms_SalesBookings b ON c.BookingID = b.BookingID
            LEFT JOIN gen_PartiesInfo p ON b.PartyID = p.PartyID
            LEFT JOIN dms_VehicleModel m ON b.VehicleModelID = m.ModelID
            LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
            ${where}
            ORDER BY c.ProposedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/cancellations/:id/am-approve  { Comments? }
exports.amApproveCancellation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_SalesBookingCancellations WHERE CancellationID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Cancellation not found' });
        const c = cur.recordset[0];
        if (c.Status !== 'Pending') return res.status(409).json({ error: `Already ${c.Status}.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('comm', sql.NVarChar(sql.MAX), req.body?.Comments || null)
                .query(`UPDATE dms_SalesBookingCancellations
                        SET Status='AMApproved', AMEmployeeID=@emp, AMName=@empN,
                            AMDecision='Approved', AMComments=@comm, AMDecidedAt=GETDATE()
                        WHERE CancellationID=@id`);
            await new sql.Request(tx).input('id', sql.Int, c.BookingID)
                .query(`UPDATE dms_SalesBookings SET Status='CancellationApproved', UpdatedAt=GETDATE() WHERE BookingID=@id`);
            await logTransition(tx, c.BookingID, 'PendingCancelApproval', 'CancellationApproved', req.user,
                `AM approved cancellation: ${req.body?.Comments || '(no comments)'}. Awaiting admin to execute (refund + accrual reversal).`);
            await tx.commit();
            res.json({ message: 'AM approved — awaiting admin execution' });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/cancellations/:id/am-reject  { Reason }
exports.amRejectCancellation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = req.body?.Reason?.trim();
        if (!reason) return res.status(400).json({ error: 'Reason is required.' });
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_SalesBookingCancellations WHERE CancellationID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Cancellation not found' });
        const c = cur.recordset[0];
        if (c.Status !== 'Pending') return res.status(409).json({ error: `Already ${c.Status}.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('reason', sql.NVarChar(sql.MAX), reason)
                .query(`UPDATE dms_SalesBookingCancellations
                        SET Status='AMRejected', AMEmployeeID=@emp, AMName=@empN,
                            AMDecision='Rejected', AMComments=@reason, AMDecidedAt=GETDATE()
                        WHERE CancellationID=@id`);
            // Revert booking to BookingConfirmed (it was set to PendingCancelApproval when proposed)
            await new sql.Request(tx).input('id', sql.Int, c.BookingID)
                .query(`UPDATE dms_SalesBookings SET Status='BookingConfirmed', UpdatedAt=GETDATE() WHERE BookingID=@id`);
            await logTransition(tx, c.BookingID, 'PendingCancelApproval', 'BookingConfirmed', req.user,
                `AM rejected cancellation: ${reason}`);
            await tx.commit();
            res.json({ message: 'AM rejected — booking remains active' });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/cancellations/:id/admin-execute  { RefundAmount, AdminNotes? }
// Stage 3 — final execution. Cancels booking, releases vehicle, reverses staff accrual, optionally records refund.
exports.adminExecuteCancellation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_SalesBookingCancellations WHERE CancellationID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Cancellation not found' });
        const c = cur.recordset[0];
        if (c.Status !== 'AMApproved') return res.status(409).json({ error: `Must be AMApproved first (currently ${c.Status}).` });

        const refundAmount = req.body?.RefundAmount != null ? Number(req.body.RefundAmount) : null;
        if (refundAmount != null && refundAmount < 0) return res.status(400).json({ error: 'RefundAmount must be ≥ 0.' });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // Mark cancellation row Executed
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('notes', sql.NVarChar(sql.MAX), req.body?.AdminNotes || null)
                .input('rf', sql.Decimal(18,2), refundAmount)
                .query(`UPDATE dms_SalesBookingCancellations
                        SET Status='Executed', AdminEmployeeID=@emp, AdminName=@empN,
                            AdminNotes=@notes, RefundAmount=@rf, ExecutedAt=GETDATE()
                        WHERE CancellationID=@id`);

            // Cancel the booking and release the vehicle if any
            const bk = await new sql.Request(tx).input('id', sql.Int, c.BookingID)
                .query(`SELECT AllocatedVehicleID FROM dms_SalesBookings WHERE BookingID=@id`);
            const allocatedVehicleId = bk.recordset[0]?.AllocatedVehicleID;

            await new sql.Request(tx)
                .input('id', sql.Int, c.BookingID)
                .input('reason', sql.NVarChar(sql.MAX), `Cancellation #${id} — ${c.ProposalReason}`)
                .input('by', sql.Int, req.user?.employeeId || null)
                .input('byN', sql.NVarChar(100), req.user?.userName || null)
                .query(`UPDATE dms_SalesBookings
                        SET Status='Cancelled', CancelledAt=GETDATE(), CancellationReason=@reason,
                            AllocatedVehicleID=NULL,
                            UpdatedAt=GETDATE(), UpdatedByEmployeeID=@by, UpdatedByName=@byN
                        WHERE BookingID=@id`);

            if (allocatedVehicleId) {
                await new sql.Request(tx).input('vid', sql.Int, allocatedVehicleId)
                    .query(`UPDATE dms_Vehicle SET CurrentBookingID=NULL, Status='AtDealer', UpdatedAt=GETDATE() WHERE VehicleID=@vid`);
            }

            // Clawback any staff incentive accrual
            await incentive.reverseForBooking(tx, c.BookingID, `Booking cancelled via finalization loop (Cancellation #${id})`);

            await logTransition(tx, c.BookingID, 'CancellationApproved', 'Cancelled', req.user,
                `Admin executed cancellation #${id}. ${refundAmount != null ? `Refund: PKR ${refundAmount.toLocaleString()}.` : ''} ${req.body?.AdminNotes || ''}`);

            await tx.commit();
            res.json({ message: 'Cancellation executed', RefundAmount: refundAmount });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/cancellations/:id/withdraw — proposer withdraws their own proposal
exports.withdrawCancellation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT BookingID, Status, ProposerEmployeeID FROM dms_SalesBookingCancellations WHERE CancellationID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Cancellation not found' });
        const c = cur.recordset[0];
        if (c.Status !== 'Pending') return res.status(409).json({ error: 'Can only withdraw a Pending request.' });
        if (c.ProposerEmployeeID !== req.user?.employeeId) return res.status(403).json({ error: 'Only the proposer can withdraw.' });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx).input('id', sql.Int, id)
                .query(`UPDATE dms_SalesBookingCancellations SET Status='Withdrawn' WHERE CancellationID=@id`);
            await new sql.Request(tx).input('id', sql.Int, c.BookingID)
                .query(`UPDATE dms_SalesBookings SET Status='BookingConfirmed', UpdatedAt=GETDATE() WHERE BookingID=@id`);
            await logTransition(tx, c.BookingID, 'PendingCancelApproval', 'BookingConfirmed', req.user, 'Cancellation request withdrawn by proposer.');
            await tx.commit();
            res.json({ message: 'Withdrawn' });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============================================================================
// NEGOTIATION
// ============================================================================

// GET /api/sales/negotiations?status=Pending
exports.listNegotiations = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status) { r.input('s', sql.NVarChar(20), req.query.status); conds.push('n.Status=@s'); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT n.RequestID, n.BookingID, b.BookingNo, b.Status AS BookingStatus,
                   n.StandardPrice, n.ProposedPrice, n.DiscountAmount, n.DiscountPct,
                   n.Reason, n.Status,
                   n.ProposerEmpID, n.ProposerName, n.ProposedAt,
                   n.ApproverEmpID, n.ApproverName, n.ApproverComments, n.DecidedAt,
                   p.PartyName, m.ModelCode, v.VariantCode, v.VariantName
            FROM dms_NegotiationRequests n
            JOIN dms_SalesBookings b ON n.BookingID = b.BookingID
            LEFT JOIN gen_PartiesInfo p ON b.PartyID = p.PartyID
            LEFT JOIN dms_VehicleModel m ON b.VehicleModelID = m.ModelID
            LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
            ${where}
            ORDER BY n.ProposedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/negotiations/:id/approve  { Comments }
exports.approveNegotiation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const comments = req.body?.Comments || null;

        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_NegotiationRequests WHERE RequestID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Request not found' });
        const neg = cur.recordset[0];
        if (neg.Status !== 'Pending') return res.status(409).json({ error: `Already ${neg.Status}.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('comm', sql.NVarChar(sql.MAX), comments)
                .query(`UPDATE dms_NegotiationRequests
                        SET Status='Approved', ApproverEmpID=@emp, ApproverName=@empN,
                            ApproverComments=@comm, DecidedAt=GETDATE()
                        WHERE RequestID=@id`);
            // Snapshot the negotiated price onto the booking + advance state to PendingPayment
            await new sql.Request(tx)
                .input('bid', sql.Int, neg.BookingID)
                .input('np', sql.Decimal(18, 2), neg.ProposedPrice)
                .query(`UPDATE dms_SalesBookings
                        SET NegotiatedPrice=@np, Status='PendingPayment', UpdatedAt=GETDATE()
                        WHERE BookingID=@bid`);
            await logTransition(tx, neg.BookingID, 'PendingApproval', 'PendingPayment', req.user,
                `Discount approved by ${req.user?.userName || 'admin'}; negotiated price snapshotted at PKR ${Number(neg.ProposedPrice).toLocaleString()}.`);
            // Now that price is finalized, accrue staff incentive (decision #8 + #10)
            await incentive.accrueForBooking(tx, neg.BookingID);
            await tx.commit();
            res.json({ message: 'Approved', BookingID: neg.BookingID });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/negotiations/:id/reject  { Reason }
exports.rejectNegotiation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = req.body?.Reason?.trim();
        if (!reason) return res.status(400).json({ error: 'Reason is required.' });

        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_NegotiationRequests WHERE RequestID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Request not found' });
        const neg = cur.recordset[0];
        if (neg.Status !== 'Pending') return res.status(409).json({ error: `Already ${neg.Status}.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .input('reason', sql.NVarChar(sql.MAX), reason)
                .query(`UPDATE dms_NegotiationRequests
                        SET Status='Rejected', ApproverEmpID=@emp, ApproverName=@empN,
                            ApproverComments=@reason, DecidedAt=GETDATE()
                        WHERE RequestID=@id`);
            // Booking goes back to Draft (executive can re-quote or cancel)
            await new sql.Request(tx).input('bid', sql.Int, neg.BookingID)
                .query(`UPDATE dms_SalesBookings SET Status='Draft', PriceApprovalID=NULL, UpdatedAt=GETDATE() WHERE BookingID=@bid`);
            await logTransition(tx, neg.BookingID, 'PendingApproval', 'Draft', req.user,
                `Discount rejected: ${reason}`);
            await tx.commit();
            res.json({ message: 'Rejected', BookingID: neg.BookingID });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============================================================================
// PAYMENTS — Direct path only for this slice; PayOrder added in next iteration
// ============================================================================

// POST /api/sales/bookings/:id/payments  (multipart/form-data — mandatory proof file)
// Form fields: PaymentPath, PaymentMode, Amount, PremiumPortion?, BankAccountID?, ChequeNumber?, ChequeDate?,
//              POSTransactionRef?, PayOrderNumber?, PayOrderBankName?, Notes?, ProofDescription
// File: 'proof' (single, mandatory) — JPG/PNG/WEBP/PDF
exports.recordPayment = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const amount = Number(b.Amount);
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be > 0.' });
        if (!['Direct', 'PayOrder'].includes(b.PaymentPath)) return res.status(400).json({ error: 'Invalid PaymentPath' });
        if (!['Cash', 'BankTransfer', 'Cheque', 'POS', 'PayOrder'].includes(b.PaymentMode)) return res.status(400).json({ error: 'Invalid PaymentMode' });
        if (!req.file) return res.status(400).json({ error: 'Proof of payment file is required (field name: "proof"). Upload a JPG/PNG/PDF picture of the receipt or bank slip.' });
        const proofDescription = (b.ProofDescription || '').trim() || `Proof for payment of PKR ${amount.toLocaleString()} via ${b.PaymentMode}`;

        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, id)
            .query(`SELECT b.BookingID, b.Status, b.NegotiatedPrice, b.AmountPaidToDate, v.MinimumBookingAmount
                    FROM dms_SalesBookings b
                    LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
                    WHERE b.BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const booking = bk.recordset[0];
        const acceptable = ['PendingBookingPayment', 'BookingConfirmed', 'PendingPayment', 'Allocated', 'MasterInvoicePending', 'MasterInvoicePosted', 'ReadyForDelivery'];
        if (!acceptable.includes(booking.Status)) {
            return res.status(409).json({ error: `Cannot accept payment in status ${booking.Status}` });
        }

        // Compute new total to decide if state thresholds are crossed
        const minAmt = Number(booking.MinimumBookingAmount) || 0;
        const negotiated = Number(booking.NegotiatedPrice) || 0;
        const newTotal = Number(booking.AmountPaidToDate) + amount;
        const willConfirmBooking = booking.Status === 'PendingBookingPayment' && newTotal >= minAmt;
        // Advance to PendingPayment once the booking is fully paid — this is what
        // unlocks the Allocate Vehicle button on the booking detail screen.
        const willFlagFullyPaid = ['PendingBookingPayment', 'BookingConfirmed'].includes(booking.Status)
            && negotiated > 0 && newTotal >= negotiated - 0.01;

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const r = await new sql.Request(tx)
                .input('bid', sql.Int, id)
                .input('path', sql.NVarChar(20), b.PaymentPath)
                .input('mode', sql.NVarChar(30), b.PaymentMode)
                .input('amt', sql.Decimal(18, 2), amount)
                .input('prem', sql.Decimal(18, 2), Number(b.PremiumPortion) || 0)
                .input('bnk', sql.Int, b.BankAccountID ? Number(b.BankAccountID) : null)
                .input('chq', sql.NVarChar(50), b.ChequeNumber || null)
                .input('chqDt', sql.Date, b.ChequeDate ? new Date(b.ChequeDate) : null)
                .input('pos', sql.NVarChar(100), b.POSTransactionRef || null)
                .input('po', sql.NVarChar(50), b.PayOrderNumber || null)
                .input('poBank', sql.NVarChar(100), b.PayOrderBankName || null)
                .input('notes', sql.NVarChar(sql.MAX), b.Notes || null)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .query(`DECLARE @ins TABLE (PaymentID INT);
                        INSERT INTO dms_SalesPayments
                            (BookingID, PaymentPath, PaymentMode, Amount, PremiumPortion,
                             BankAccountID, ChequeNumber, ChequeDate, POSTransactionRef,
                             PayOrderNumber, PayOrderBankName,
                             Notes, ReceivedByEmployeeID, ReceivedByName, CreatedByEmployeeID)
                        OUTPUT INSERTED.PaymentID INTO @ins
                        VALUES (@bid, @path, @mode, @amt, @prem,
                                @bnk, @chq, @chqDt, @pos,
                                @po, @poBank,
                                @notes, @emp, @empN, @emp);
                        SELECT PaymentID FROM @ins;`);
            const paymentId = r.recordset[0].PaymentID;

            // Insert the proof document
            const relPath = `uploads/sales/${require('path').basename(req.file.path)}`;
            await new sql.Request(tx)
                .input('dt', sql.NVarChar(40), 'ProofOfPayment')
                .input('desc', sql.NVarChar(500), proofDescription)
                .input('fp', sql.NVarChar(500), relPath)
                .input('orig', sql.NVarChar(255), req.file.originalname)
                .input('mime', sql.NVarChar(100), req.file.mimetype)
                .input('sz', sql.BigInt, req.file.size)
                .input('bid', sql.Int, id)
                .input('pid', sql.Int, paymentId)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO dms_SalesDocuments
                            (DocType, Description, FilePath, OriginalFileName, MimeType, SizeBytes,
                             BookingID, LinkedPaymentID, UploadedByEmployeeID, UploadedByName)
                        VALUES (@dt, @desc, @fp, @orig, @mime, @sz, @bid, @pid, @emp, @empN)`);

            // If minimum booking payment is now satisfied, advance the booking state
            if (willConfirmBooking) {
                await new sql.Request(tx).input('id', sql.Int, id)
                    .query(`UPDATE dms_SalesBookings SET Status='BookingConfirmed', UpdatedAt=GETDATE() WHERE BookingID=@id`);
                await logTransition(tx, id, 'PendingBookingPayment', 'BookingConfirmed', req.user,
                    `Minimum booking amount (PKR ${minAmt.toLocaleString()}) received. Booking confirmed. Cancellation now requires AM approval.`);
            }

            // Once the booking is fully paid (or over-paid), advance to
            // PendingPayment so the Allocate Vehicle button becomes available.
            // This jump may skip BookingConfirmed if min and full are crossed
            // by the same payment.
            if (willFlagFullyPaid) {
                const fromState = willConfirmBooking ? 'BookingConfirmed' : booking.Status;
                await new sql.Request(tx).input('id', sql.Int, id)
                    .query(`UPDATE dms_SalesBookings SET Status='PendingPayment', UpdatedAt=GETDATE() WHERE BookingID=@id`);
                await logTransition(tx, id, fromState, 'PendingPayment', req.user,
                    `Booking fully paid (PKR ${newTotal.toLocaleString()} of ${negotiated.toLocaleString()}). Ready for vehicle allocation.`);
            }

            // GL posting — gated. If any required system-account role is unmapped,
            // we keep the payment row and skip posting (admin must map roles in
            // Accounting › System Accounts). Any other error rolls back the tx.
            let glPostingSkipped = null;
            let voucherId = null;
            try {
                const { postSalesPaymentVoucher } = require('../services/salesPaymentPostingService');
                voucherId = await postSalesPaymentVoucher(paymentId, req.user, tx);
            } catch (glErr) {
                if (glErr.code === 'SYSTEM_ACCOUNT_NOT_CONFIGURED') {
                    glPostingSkipped = glErr.message;
                    console.warn(`[sales] GL posting SKIPPED for payment ${paymentId} — ${glErr.message}`);
                } else {
                    throw glErr;
                }
            }

            await tx.commit();
            res.status(201).json({
                message: 'Payment recorded',
                PaymentID: paymentId,
                VoucherID: voucherId,
                GLPostingSkipped: glPostingSkipped,
                MinimumBookingMet: willConfirmBooking || booking.Status !== 'PendingBookingPayment',
                BookingConfirmedNow: willConfirmBooking,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('recordPayment:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/sales/bookings/:id/payments
exports.listPayments = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT * FROM dms_SalesPayments WHERE BookingID=@id ORDER BY ReceivedAt DESC`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
