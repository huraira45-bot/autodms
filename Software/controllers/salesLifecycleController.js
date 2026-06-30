/**
 * Sales Module — Lifecycle transitions: Allocation, Master Invoice, Delivery, Gate Pass.
 *
 * Source spec: .claude/planning/sales-module-design.md §12 (booking lifecycle), §13 (Master), §18 (workflow).
 *
 * Each transition:
 *   1. Validates the booking is in the right prior state
 *   2. Validates the new state's preconditions (e.g., delivery requires payment or partial-delivery co-sign)
 *   3. Writes audit rows (state transition, accrual rows where applicable)
 *   4. Posts the matching §14 voucher IF system-account roles are mapped; otherwise warns and continues
 *      (the booking flow is usable from day one; GL impact lights up the moment admin maps the roles)
 */
const { sql, getPool } = require('../config/db');
const docs = require('./salesDocumentController');

// =========================================================================
// Helpers
// =========================================================================

const { logAudit } = require('../services/salesAuditService');

function addDaysISO(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// POST /api/sales/bookings/:id/pay-master  body: { Amount, Mode, BankAccountGLCAID?, Reference?, Notes? }
//
// Agency-model step: dealer remits the wholesale price to Master Motors for
// this booking. Dr BOOKING_VARIANT_RECEIVABLE / Cr Bank|Cash.
exports.payMaster = async (req, res) => {
    const bookingId = parseInt(req.params.id);
    const { Amount, Mode, BankAccountGLCAID, Reference, Notes } = req.body || {};
    const amt = Number(Amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Amount must be > 0.' });
    if (!['Cash', 'Bank'].includes(Mode))   return res.status(400).json({ error: 'Mode must be Cash or Bank.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const { postPayMasterVoucher } = require('../services/payMasterService');
        const { voucherId, voucherNo } = await postPayMasterVoucher({
            bookingId, amount: amt, mode: Mode,
            bankAccountGLCAID: BankAccountGLCAID ? Number(BankAccountGLCAID) : null,
            reference: Reference, notes: Notes,
        }, req.user, tx);

        await logAudit(tx, {
            bookingId, entityType: 'Booking', entityId: bookingId,
            action: 'PayMaster',
            newValue: { amount: amt, mode: Mode, voucherNo },
            actor: req.user, notes: Notes,
        });

        await tx.commit();
        res.json({ message: 'Master payment recorded.', VoucherID: voucherId, VoucherNo: voucherNo });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('payMaster:', err);
        res.status(400).json({ error: err.message });
    }
};

// GET /api/sales/bookings/:id/audit — chronological audit timeline for a booking
exports.bookingAudit = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('bid', sql.Int, id).query(`
            SELECT AuditID, EntityType, EntityID, Action, OldValue, NewValue,
                   ActorEmployeeID, ActorName, At, Notes
            FROM dms_SalesAuditLog
            WHERE BookingID=@bid
            ORDER BY At DESC, AuditID DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('bookingAudit:', err);
        res.status(500).json({ error: err.message });
    }
};

async function logTransition(tx, bookingId, fromState, toState, user, reason) {
    await new sql.Request(tx)
        .input('bid', sql.Int, bookingId)
        .input('from', sql.NVarChar(30), fromState)
        .input('to', sql.NVarChar(30), toState)
        .input('emp', sql.Int, user?.employeeId || null)
        .input('name', sql.NVarChar(100), user?.userName || null)
        .input('role', sql.NVarChar(50), user?.groupTitle || null)
        .input('reason', sql.NVarChar(sql.MAX), reason || null)
        .query(`INSERT INTO dms_BookingStateTransitions
                    (BookingID, FromState, ToState, ActorEmployeeID, ActorName, ActorRole, Reason)
                VALUES (@bid, @from, @to, @emp, @name, @role, @reason)`);
    // Mirror into the wider audit log (§23) — never throws.
    await logAudit(tx, {
        bookingId, entityType: 'Booking', entityId: bookingId,
        action: `Transition: ${fromState} → ${toState}`,
        oldValue: fromState, newValue: toState, actor: user, notes: reason,
    });
}

// Resolve a system-account role to its GL account ID. Returns null if unmapped.
async function resolveRole(executor, roleKey) {
    const r = await executor.request().input('k', sql.NVarChar(50), roleKey)
        .query(`SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey=@k`);
    return r.recordset[0]?.GLCAID || null;
}

// Resolve all roles needed for a given operation. Returns { resolved: {key: glcaid}, missing: [keys] }.
async function resolveRolesBatch(executor, roleKeys) {
    const resolved = {}; const missing = [];
    for (const k of roleKeys) {
        const id = await resolveRole(executor, k);
        if (id) resolved[k] = id; else missing.push(k);
    }
    return { resolved, missing };
}

// =========================================================================
// ALLOCATION — assign a Vehicle to a Booking (Sales Manager role)
// =========================================================================

// GET /api/sales/bookings/:id/allocation-readiness — preflight for the UI
exports.allocationReadiness = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, id).query(`
            SELECT b.BookingID, b.Status, b.AllocatedVehicleID, b.AmountPaidToDate, b.NegotiatedPrice,
                   v.MinimumBookingAmount, v.VariantCode, v.VariantName
            FROM dms_SalesBookings b
            LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
            WHERE b.BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const b = bk.recordset[0];

        const reasons = [];
        const minAmt = Number(b.MinimumBookingAmount) || 0;
        const paid = Number(b.AmountPaidToDate) || 0;

        if (b.AllocatedVehicleID) reasons.push('Already allocated');
        if (!['BookingConfirmed', 'PendingPayment', 'MasterInvoicePending'].includes(b.Status)) {
            reasons.push(`Booking status is "${b.Status}" — must be BookingConfirmed / PendingPayment`);
        }
        if (minAmt > 0 && paid < minAmt) reasons.push(`Minimum booking payment of PKR ${minAmt.toLocaleString()} not yet received (paid: PKR ${paid.toLocaleString()})`);
        if (minAmt <= 0 && paid <= 0)   reasons.push('No payment received yet');

        const missingDocs = await docs.missingRequiredDocs(pool, id, ['PBO', 'CNIC']);
        for (const t of missingDocs) reasons.push(`Required document missing: ${t}`);

        res.json({
            ready: reasons.length === 0,
            blockingReasons: reasons,
            paidAmount: paid,
            minimumRequired: minAmt,
            missingDocuments: missingDocs,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/bookings/:id/allocate  { VehicleID, Notes? }
exports.allocateVehicle = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const vehicleId = parseInt(req.body?.VehicleID);
        if (!vehicleId) return res.status(400).json({ error: 'VehicleID is required.' });

        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, bookingId).query(`
            SELECT b.BookingID, b.Status, b.AllocatedVehicleID, b.VehicleVariantID,
                   b.AmountPaidToDate, b.NegotiatedPrice,
                   v.MinimumBookingAmount
            FROM dms_SalesBookings b
            LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
            WHERE b.BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const booking = bk.recordset[0];

        // Booking must not be already allocated and must be in a post-confirmation state
        if (booking.AllocatedVehicleID) return res.status(409).json({ error: `Booking already allocated to vehicle #${booking.AllocatedVehicleID}` });
        if (!['BookingConfirmed', 'PendingPayment', 'MasterInvoicePending'].includes(booking.Status)) {
            return res.status(409).json({ error: `Cannot allocate from status "${booking.Status}". Must be BookingConfirmed / PendingPayment / MasterInvoicePending.` });
        }

        // PAYMENT GATE
        const minAmt = Number(booking.MinimumBookingAmount) || 0;
        const paid = Number(booking.AmountPaidToDate) || 0;
        if (minAmt > 0 && paid < minAmt) {
            return res.status(412).json({ error: `Minimum booking payment of PKR ${minAmt.toLocaleString()} not yet received (paid: PKR ${paid.toLocaleString()}).` });
        }
        if (minAmt <= 0 && paid <= 0) {
            return res.status(412).json({ error: 'At least one payment must be received before a vehicle can be allocated.' });
        }

        // DOCUMENT GATE — PBO + CNIC required
        const missing = await docs.missingRequiredDocs(pool, bookingId, ['PBO', 'CNIC']);
        if (missing.length) {
            return res.status(412).json({ error: `Required customer documents missing: ${missing.join(', ')}. Upload them on the booking page before allocating a vehicle.` });
        }

        const vh = await pool.request().input('vid', sql.Int, vehicleId)
            .query(`SELECT VehicleID, VariantID, Status, AllocationType, CurrentBookingID, ChasisNo FROM dms_Vehicle WHERE VehicleID=@vid`);
        if (!vh.recordset.length) return res.status(404).json({ error: 'Vehicle not found' });
        const vehicle = vh.recordset[0];

        if (vehicle.VariantID !== booking.VehicleVariantID) {
            return res.status(409).json({ error: 'Vehicle variant does not match the booking variant.' });
        }
        if (vehicle.CurrentBookingID && vehicle.CurrentBookingID !== bookingId) {
            return res.status(409).json({ error: `Vehicle is already allocated to booking #${vehicle.CurrentBookingID}` });
        }
        if (!['AtMaster', 'InTransit', 'AtDealer'].includes(vehicle.Status)) {
            return res.status(409).json({ error: `Vehicle status "${vehicle.Status}" is not allocatable.` });
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('bid', sql.Int, bookingId)
                .input('vid', sql.Int, vehicleId)
                .input('by', sql.Int, req.user?.employeeId || null)
                .input('byN', sql.NVarChar(100), req.user?.userName || null)
                .query(`UPDATE dms_SalesBookings
                        SET AllocatedVehicleID=@vid, Status='Allocated',
                            UpdatedAt=GETDATE(), UpdatedByEmployeeID=@by, UpdatedByName=@byN
                        WHERE BookingID=@bid`);

            await new sql.Request(tx)
                .input('vid', sql.Int, vehicleId)
                .input('bid', sql.Int, bookingId)
                .input('by', sql.Int, req.user?.employeeId || null)
                .input('byN', sql.NVarChar(100), req.user?.userName || null)
                .query(`UPDATE dms_Vehicle
                        SET CurrentBookingID=@bid, Status='Allocated',
                            UpdatedAt=GETDATE(), UpdatedByEmployeeID=@by, UpdatedByName=@byN
                        WHERE VehicleID=@vid`);

            await logTransition(tx, bookingId, booking.Status, 'Allocated', req.user,
                `Vehicle ${vehicle.ChasisNo} allocated by ${req.user?.userName || 'manager'}${req.body?.Notes ? ` — ${req.body.Notes}` : ''}.`);

            await tx.commit();
            res.json({ message: 'Allocated', BookingID: bookingId, VehicleID: vehicleId, ChasisNo: vehicle.ChasisNo });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('allocateVehicle:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/bookings/:id/unallocate  — Sales Manager only, reverts to PendingPayment
exports.unallocateVehicle = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const reason = req.body?.Reason?.trim();
        if (!reason) return res.status(400).json({ error: 'Reason is required.' });

        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, bookingId)
            .query(`SELECT BookingID, Status, AllocatedVehicleID FROM dms_SalesBookings WHERE BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const booking = bk.recordset[0];

        if (booking.Status !== 'Allocated') return res.status(409).json({ error: `Can only unallocate from Allocated status (currently ${booking.Status}).` });
        if (!booking.AllocatedVehicleID) return res.status(409).json({ error: 'Booking has no allocated vehicle.' });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const vehicleId = booking.AllocatedVehicleID;
            await new sql.Request(tx).input('bid', sql.Int, bookingId)
                .query(`UPDATE dms_SalesBookings SET AllocatedVehicleID=NULL, Status='PendingPayment', UpdatedAt=GETDATE() WHERE BookingID=@bid`);
            await new sql.Request(tx).input('vid', sql.Int, vehicleId)
                .query(`UPDATE dms_Vehicle SET CurrentBookingID=NULL, Status='AtDealer', UpdatedAt=GETDATE() WHERE VehicleID=@vid`);
            await logTransition(tx, bookingId, 'Allocated', 'PendingPayment', req.user, `Unallocated: ${reason}`);
            await tx.commit();
            res.json({ message: 'Unallocated' });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// =========================================================================
// MASTER INVOICE POSTING — flips Allocated → MasterInvoicePosted + accrual rows
// =========================================================================

// POST /api/sales/bookings/:id/post-master-invoice
// body: { MasterInvoiceNo, MasterInvoiceDate, WholesalePrice?, Notes? }
exports.postMasterInvoice = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const b = req.body || {};
        if (!b.MasterInvoiceNo?.trim()) return res.status(400).json({ error: 'MasterInvoiceNo is required.' });
        if (!b.MasterInvoiceDate) return res.status(400).json({ error: 'MasterInvoiceDate is required.' });

        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, bookingId).query(`
            SELECT b.BookingID, b.Status, b.AllocatedVehicleID, b.VehicleVariantID, b.NegotiatedPrice,
                   v.StandardIncentiveAmount, v.StandardIncentiveTaxTreatment,
                   v.WholesalePrice AS VariantWholesale,
                   veh.ChasisNo
            FROM dms_SalesBookings b
            LEFT JOIN dms_VehicleVariant v ON b.VehicleVariantID = v.VariantID
            LEFT JOIN dms_Vehicle veh ON b.AllocatedVehicleID = veh.VehicleID
            WHERE b.BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const booking = bk.recordset[0];

        if (!booking.AllocatedVehicleID) return res.status(409).json({ error: 'Booking must have an allocated vehicle first.' });
        if (booking.Status !== 'Allocated' && booking.Status !== 'MasterInvoicePending') {
            return res.status(409).json({ error: `Cannot post Master invoice from "${booking.Status}".` });
        }

        const wholesalePrice = b.WholesalePrice != null ? Number(b.WholesalePrice) : Number(booking.VariantWholesale);
        if (!Number.isFinite(wholesalePrice) || wholesalePrice <= 0) return res.status(400).json({ error: 'Wholesale price must be > 0.' });

        const invoiceDate = new Date(b.MasterInvoiceDate);

        // Look up applicable campaigns (Special + Additional) for this Variant + invoice date
        const camps = await pool.request()
            .input('vid', sql.Int, booking.VehicleVariantID)
            .input('dt', sql.Date, invoiceDate)
            .query(`SELECT CampaignID, Name, IncentiveType, AmountPerCar, TaxTreatment
                    FROM dms_MasterIncentiveCampaigns
                    WHERE Status='Active'
                      AND (AppliesToVariantID = @vid OR AppliesToVariantID IS NULL)
                      AND EffectiveFrom <= @dt
                      AND (EffectiveTo IS NULL OR EffectiveTo >= @dt)`);

        const specialSum    = camps.recordset.filter(c => c.IncentiveType === 'Special').reduce((s, c) => s + Number(c.AmountPerCar), 0);
        const additionalSum = camps.recordset.filter(c => c.IncentiveType === 'Additional').reduce((s, c) => s + Number(c.AmountPerCar), 0);
        const standardAmt   = Number(booking.StandardIncentiveAmount) || 0;

        // Resolve system-account roles (GL posting gated on this)
        const required = ['VEHICLE_INVENTORY', 'MASTER_VEHICLE_PAYABLE',
                          'MASTER_INCENTIVE_RECEIVABLE', 'MASTER_INCENTIVE_INCOME'];
        const { resolved, missing } = await resolveRolesBatch(pool, required);
        const glPostingEnabled = missing.length === 0;

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // Insert accrual rows (always — they're our own records)
            const campaignIDs = camps.recordset.map(c => c.CampaignID);
            const accruals = [];

            if (standardAmt > 0) {
                const ar = await new sql.Request(tx)
                    .input('bid', sql.Int, bookingId)
                    .input('vid', sql.Int, booking.AllocatedVehicleID)
                    .input('amt', sql.Decimal(18, 2), standardAmt)
                    .input('base', sql.Decimal(18, 2), booking.NegotiatedPrice)
                    .input('tt', sql.NVarChar(30), booking.StandardIncentiveTaxTreatment)
                    .query(`INSERT INTO dms_SalesIncentiveAccruals
                                (BookingID, VehicleID, EarnerType, IncentiveCategory,
                                 AmountAccrued, IncentiveBaseAmount, TaxTreatment, Status, AccruedAt)
                            OUTPUT INSERTED.AccrualID
                            VALUES (@bid, @vid, 'Master', 'Standard', @amt, @base, @tt, 'Accrued', GETDATE())`);
                accruals.push({ id: ar.recordset[0].AccrualID, category: 'Standard', amount: standardAmt });
            }
            if (specialSum > 0) {
                const ar = await new sql.Request(tx)
                    .input('bid', sql.Int, bookingId)
                    .input('vid', sql.Int, booking.AllocatedVehicleID)
                    .input('amt', sql.Decimal(18, 2), specialSum)
                    .input('camps', sql.NVarChar(sql.MAX), JSON.stringify(camps.recordset.filter(c => c.IncentiveType === 'Special')))
                    .query(`INSERT INTO dms_SalesIncentiveAccruals
                                (BookingID, VehicleID, EarnerType, IncentiveCategory,
                                 AmountAccrued, MasterCampaignIDsJSON, Status, AccruedAt)
                            OUTPUT INSERTED.AccrualID
                            VALUES (@bid, @vid, 'Master', 'Special', @amt, @camps, 'Accrued', GETDATE())`);
                accruals.push({ id: ar.recordset[0].AccrualID, category: 'Special', amount: specialSum });
            }
            if (additionalSum > 0) {
                const ar = await new sql.Request(tx)
                    .input('bid', sql.Int, bookingId)
                    .input('vid', sql.Int, booking.AllocatedVehicleID)
                    .input('amt', sql.Decimal(18, 2), additionalSum)
                    .input('camps', sql.NVarChar(sql.MAX), JSON.stringify(camps.recordset.filter(c => c.IncentiveType === 'Additional')))
                    .query(`INSERT INTO dms_SalesIncentiveAccruals
                                (BookingID, VehicleID, EarnerType, IncentiveCategory,
                                 AmountAccrued, MasterCampaignIDsJSON, Status, AccruedAt)
                            OUTPUT INSERTED.AccrualID
                            VALUES (@bid, @vid, 'Master', 'Additional', @amt, @camps, 'Accrued', GETDATE())`);
                accruals.push({ id: ar.recordset[0].AccrualID, category: 'Additional', amount: additionalSum });
            }

            // Vehicle update: record the Master invoice reference (voucher-id will be wired when GL posts)
            await new sql.Request(tx)
                .input('vid', sql.Int, booking.AllocatedVehicleID)
                .query(`UPDATE dms_Vehicle SET UpdatedAt=GETDATE() WHERE VehicleID=@vid`);

            // Booking → MasterInvoicePosted
            await new sql.Request(tx).input('bid', sql.Int, bookingId)
                .query(`UPDATE dms_SalesBookings SET Status='MasterInvoicePosted', UpdatedAt=GETDATE() WHERE BookingID=@bid`);

            // GL posting — if roles are mapped, post the Master invoice voucher
            // (Dr Vehicle Inventory + Master Incentive Receivable; Cr Master
            // Payable + Master Incentive Income). Special/Additional campaign
            // incentives go through their own accrual vouchers via the
            // incentive posting service if mapped — they're already saved as
            // accrual rows above with Status='Accrued'.
            let masterVoucherId = null;
            if (glPostingEnabled) {
                try {
                    const { postMasterInvoiceVoucher } = require('../services/salesMasterInvoicePostingService');
                    masterVoucherId = await postMasterInvoiceVoucher(bookingId, {
                        invoiceNo: b.MasterInvoiceNo.trim(),
                        invoiceDate,
                        wholesalePrice,
                        stdIncentive: standardAmt,
                    }, req.user, tx);
                } catch (glErr) {
                    if (glErr.code !== 'SYSTEM_ACCOUNT_NOT_CONFIGURED') throw glErr;
                    console.warn(`[sales] Master invoice GL posting SKIPPED — ${glErr.message}`);
                }
            }

            const glIntent = masterVoucherId
                ? `GL posted as voucher #${masterVoucherId}.`
                : glPostingEnabled
                    ? `GL posting attempted but service raised; check logs.`
                    : `GL posting SKIPPED — unmapped roles: ${missing.join(', ')}. Admin must map via /accounting/setup.`;
            await logTransition(tx, bookingId, booking.Status, 'MasterInvoicePosted', req.user,
                `Master invoice ${b.MasterInvoiceNo} posted (${invoiceDate.toISOString().slice(0,10)}). Wholesale: PKR ${wholesalePrice.toLocaleString()}. Std incentive: ${standardAmt.toLocaleString()}, Special: ${specialSum.toLocaleString()}, Additional: ${additionalSum.toLocaleString()}. ${glIntent}`);

            await tx.commit();

            res.json({
                message: 'Master invoice posted',
                BookingID: bookingId,
                WholesalePrice: wholesalePrice,
                MasterInvoiceVoucherID: masterVoucherId,
                IncentiveAccrued: { standard: standardAmt, special: specialSum, additional: additionalSum, total: standardAmt + specialSum + additionalSum },
                ContributingCampaigns: camps.recordset,
                AccrualsCreated: accruals,
                GLPostingEnabled: glPostingEnabled,
                UnmappedRoles: missing,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('postMasterInvoice:', err);
        res.status(500).json({ error: err.message });
    }
};

// =========================================================================
// DELIVERY — readiness check + approval (with partial-delivery co-sign per #13)
// =========================================================================

// GET /api/sales/bookings/:id/delivery-readiness — preflight check for the UI
exports.deliveryReadiness = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id).query(`
            SELECT BookingID, Status, AllocatedVehicleID, NegotiatedPrice, AmountPaidToDate,
                   AllowPartialDelivery, PartialDeliveryApprovedByGM, PartialDeliveryApprovedByFinance
            FROM dms_SalesBookings WHERE BookingID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const b = r.recordset[0];

        const paidPct = b.NegotiatedPrice > 0 ? Number(b.AmountPaidToDate) / Number(b.NegotiatedPrice) * 100 : 0;
        const fullyPaid = paidPct >= 100;
        const reasons = [];
        if (!b.AllocatedVehicleID) reasons.push('Vehicle not allocated');
        if (b.Status !== 'MasterInvoicePosted' && b.Status !== 'ReadyForDelivery') reasons.push(`Status must be MasterInvoicePosted or ReadyForDelivery (currently ${b.Status})`);

        if (!fullyPaid) {
            if (!b.AllowPartialDelivery) reasons.push('Not fully paid AND AllowPartialDelivery flag is off');
            else {
                if (paidPct < 50) reasons.push(`Paid only ${paidPct.toFixed(1)}% — below the 50% partial-delivery floor`);
                if (!b.PartialDeliveryApprovedByGM) reasons.push('Partial delivery needs GM Sales approval');
                if (!b.PartialDeliveryApprovedByFinance) reasons.push('Partial delivery needs Finance Head approval');
            }
        }
        res.json({
            ready: reasons.length === 0,
            blockingReasons: reasons,
            paidPercentage: +paidPct.toFixed(2),
            fullyPaid,
            partialDeliveryEnabled: !!b.AllowPartialDelivery,
            gmApproved: !!b.PartialDeliveryApprovedByGM,
            financeApproved: !!b.PartialDeliveryApprovedByFinance,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/bookings/:id/enable-partial-delivery  { Reason } — GM Sales action
exports.enablePartialDelivery = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = req.body?.Reason?.trim();
        if (!reason) return res.status(400).json({ error: 'Reason is required.' });
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, id)
            .input('reason', sql.NVarChar(sql.MAX), reason)
            .input('emp', sql.Int, req.user?.employeeId || null)
            .query(`UPDATE dms_SalesBookings
                    SET AllowPartialDelivery=1,
                        PartialDeliveryReason=@reason,
                        PartialDeliveryApprovedByGM=@emp,
                        UpdatedAt=GETDATE()
                    WHERE BookingID=@id`);
        res.json({ message: 'Partial delivery enabled — Finance Head co-sign still required.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/bookings/:id/finance-cosign  — Finance Head action
exports.financeCoSignPartial = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id).query(
            `SELECT AllowPartialDelivery, PartialDeliveryApprovedByGM FROM dms_SalesBookings WHERE BookingID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        if (!r.recordset[0].AllowPartialDelivery || !r.recordset[0].PartialDeliveryApprovedByGM) {
            return res.status(409).json({ error: 'GM Sales must approve partial delivery first.' });
        }
        await pool.request()
            .input('id', sql.Int, id)
            .input('emp', sql.Int, req.user?.employeeId || null)
            .query(`UPDATE dms_SalesBookings
                    SET PartialDeliveryApprovedByFinance=@emp,
                        PartialDeliveryApprovedAt=GETDATE(),
                        UpdatedAt=GETDATE()
                    WHERE BookingID=@id`);
        res.json({ message: 'Finance Head co-signed' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/bookings/:id/issue-gate-pass — final step, moves to Closed
// body: { GatePassNumber?, Notes? }
exports.issueGatePass = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, id).query(`
            SELECT BookingID, Status, AllocatedVehicleID, NegotiatedPrice, AmountPaidToDate,
                   AllowPartialDelivery, PartialDeliveryApprovedByGM, PartialDeliveryApprovedByFinance
            FROM dms_SalesBookings WHERE BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found' });
        const b = bk.recordset[0];

        // Re-run readiness gate inside the request (UI may be stale)
        const paidPct = b.NegotiatedPrice > 0 ? Number(b.AmountPaidToDate) / Number(b.NegotiatedPrice) * 100 : 0;
        const fullyPaid = paidPct >= 100;
        if (!b.AllocatedVehicleID) return res.status(409).json({ error: 'Vehicle not allocated' });
        if (!['Allocated', 'MasterInvoicePosted', 'ReadyForDelivery'].includes(b.Status)) {
            return res.status(409).json({ error: `Status must be Allocated / MasterInvoicePosted / ReadyForDelivery (got ${b.Status})` });
        }
        if (!fullyPaid) {
            if (!b.AllowPartialDelivery) return res.status(409).json({ error: 'Not fully paid and partial delivery not authorized.' });
            if (paidPct < 50) return res.status(409).json({ error: `Paid only ${paidPct.toFixed(1)}% — below floor.` });
            if (!b.PartialDeliveryApprovedByGM || !b.PartialDeliveryApprovedByFinance) {
                return res.status(409).json({ error: 'Partial delivery needs both GM Sales and Finance Head co-sign.' });
            }
        }

        // Resolve roles for delivery voucher posting (gated)
        const required = ['BOOKING_ADVANCE', 'BOOKING_RECEIVABLE', 'VEHICLE_SALES_REVENUE',
                          'VEHICLE_INVENTORY', 'COGS_VEHICLES', 'PREMIUM_INCOME'];
        const { resolved, missing } = await resolveRolesBatch(pool, required);
        const glPostingEnabled = missing.length === 0;

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const gatePassNo = req.body?.GatePassNumber || `GP-${Date.now()}`;
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('by', sql.Int, req.user?.employeeId || null)
                .input('byN', sql.NVarChar(100), req.user?.userName || null)
                .query(`UPDATE dms_SalesBookings
                        SET Status='Closed',
                            GatePassIssuedAt=GETDATE(),
                            DeliveredAt=COALESCE(DeliveredAt, GETDATE()),
                            ClosedAt=GETDATE(),
                            UpdatedAt=GETDATE(), UpdatedByEmployeeID=@by, UpdatedByName=@byN
                        WHERE BookingID=@id`);
            await new sql.Request(tx)
                .input('vid', sql.Int, b.AllocatedVehicleID)
                .query(`UPDATE dms_Vehicle SET Status='Sold', SoldDeliveredAt=GETDATE(), UpdatedAt=GETDATE() WHERE VehicleID=@vid`);

            // Mark open-allocation memo as Sold (if applicable)
            await new sql.Request(tx)
                .input('vid', sql.Int, b.AllocatedVehicleID)
                .input('bid', sql.Int, id)
                .query(`UPDATE dms_OpenAllocationLedger
                        SET Status='Sold', SoldAt=GETDATE(), SoldToBookingID=@bid
                        WHERE VehicleID=@vid AND Status='AtDealer'`);

            // GL post — revenue recognition + COGS + premium (if any).
            // The service joins to dms_VehicleVariant to pull WholesalePrice for the COGS leg.
            let deliveryVoucherId = null;
            if (glPostingEnabled) {
                try {
                    const { postDeliveryVoucher } = require('../services/salesDeliveryPostingService');
                    deliveryVoucherId = await postDeliveryVoucher(id, req.user, tx);
                } catch (glErr) {
                    if (glErr.code !== 'SYSTEM_ACCOUNT_NOT_CONFIGURED') throw glErr;
                    console.warn(`[sales] Delivery GL posting SKIPPED — ${glErr.message}`);
                }
            }

            const glIntent = deliveryVoucherId
                ? `GL posted as voucher #${deliveryVoucherId}.`
                : glPostingEnabled
                    ? `GL posting attempted but service raised; check logs.`
                    : `GL posting SKIPPED — unmapped roles: ${missing.join(', ')}.`;
            await logTransition(tx, id, b.Status, 'Closed', req.user,
                `Gate pass ${gatePassNo} issued. ${fullyPaid ? 'Fully paid.' : `Partial delivery (${paidPct.toFixed(1)}% paid; remainder reclassified to receivable).`} ${glIntent}`);

            // Auto-create a placeholder recovery plan when delivery proceeds
            // without full payment. The plan holds a single installment due in
            // 30 days; the recovery officer adjusts the schedule afterward.
            let autoRecoveryPlanId = null;
            if (!fullyPaid) {
                const remainder = Number(b.NegotiatedPrice) - Number(b.AmountPaidToDate);
                if (remainder > 0.01) {
                    const planIns = await new sql.Request(tx)
                        .input('bid',   sql.Int,             id)
                        .input('rem',   sql.Decimal(18,2),   remainder)
                        .input('json',  sql.NVarChar(sql.MAX),
                               JSON.stringify([{ DueDate: addDaysISO(30), AmountDue: remainder, Notes: 'Auto-created at gate pass — adjust schedule.' }]))
                        .input('cby',   sql.Int,             req.user?.employeeId || null)
                        .input('cbyN',  sql.NVarChar(100),   req.user?.userName || null)
                        .query(`INSERT INTO dms_SalesRecoveryPlans
                                    (BookingID, TotalRemainingAtDelivery, InstallmentsJSON,
                                     Status, CreatedByEmployeeID, CreatedByName)
                                OUTPUT INSERTED.RecoveryPlanID
                                VALUES (@bid, @rem, @json, 'Active', @cby, @cbyN)`);
                    autoRecoveryPlanId = planIns.recordset[0].RecoveryPlanID;
                    await new sql.Request(tx)
                        .input('pid', sql.Int,           autoRecoveryPlanId)
                        .input('bid', sql.Int,           id)
                        .input('due', sql.Date,          addDaysISO(30))
                        .input('amt', sql.Decimal(18,2), remainder)
                        .query(`INSERT INTO dms_SalesRecoveryInstallments
                                    (RecoveryPlanID, BookingID, SeqNo, DueDate, AmountDue, Notes)
                                VALUES (@pid, @bid, 1, @due, @amt, 'Auto-created at gate pass — adjust schedule.')`);
                }
            }

            await tx.commit();
            res.json({
                message: 'Gate pass issued — booking closed',
                BookingID: id,
                GatePassNumber: gatePassNo,
                FullyPaid: fullyPaid,
                DeliveryVoucherID: deliveryVoucherId,
                PartialDeliveryRemainder: fullyPaid ? 0 : (Number(b.NegotiatedPrice) - Number(b.AmountPaidToDate)),
                GLPostingEnabled: glPostingEnabled,
                UnmappedRoles: missing,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('issueGatePass:', err);
        res.status(500).json({ error: err.message });
    }
};
