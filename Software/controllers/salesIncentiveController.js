/**
 * Sales Module — Incentive policies, assignments, accruals, disbursements.
 *
 * Source spec: .claude/planning/sales-module-design.md §15, §3.2.
 *
 * Decision #8:  Booking-time accrual + admin-discretionary disbursement.
 * Decision #10: Base = negotiated price.
 * Decision #11: v1 = no overrides (architecture supports v2 toggle).
 *
 * Per-employee balance = SUM(accrued) - SUM(disbursed) - SUM(reversed).
 */
const { sql, getPool } = require('../config/db');

const VALID_TRIGGERS = new Set(['AT_BOOKING_SAVE', 'AT_FULL_PAYMENT', 'AT_MASTER_INVOICE_POSTED', 'AT_DELIVERY']);
const VALID_BASE     = new Set(['FlatPerCar', 'PercentOfNegotiatedPrice', 'TieredOnNegotiatedPrice']);
const VALID_LEVEL    = new Set(['SalesExecutive', 'AGMSales', 'GMSales', 'CustomChainOverride']);

// =========================================================================
// POLICIES
// =========================================================================

exports.listPolicies = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.activeOnly === '1') conds.push('IsActive=1');
        if (req.query.level)              { r.input('lvl', sql.NVarChar(30), req.query.level); conds.push('AppliesToHierarchyLevel=@lvl'); }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('Name LIKE @q');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT p.PolicyID, p.Name, p.RecognitionTrigger, p.BaseType, p.BaseAmount,
                   p.AppliesToHierarchyLevel, p.OverrideForReportingChain,
                   p.VariantID, v.VariantCode, v.VariantName,
                   p.EffectiveFrom, p.EffectiveTo, p.IsActive,
                   p.CreatedAt, p.CreatedByName,
                   (SELECT COUNT(*) FROM dms_SalesIncentiveAssignments WHERE PolicyID=p.PolicyID AND IsActive=1) AS ActiveAssignments
            FROM dms_SalesIncentivePolicies p
            LEFT JOIN dms_VehicleVariant v ON p.VariantID = v.VariantID
            ${where}
            ORDER BY p.IsActive DESC, p.EffectiveFrom DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getPolicy = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT * FROM dms_SalesIncentivePolicies WHERE PolicyID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Policy not found' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createPolicy = async (req, res) => {
    try {
        const b = req.body || {};
        const errors = [];
        if (!b.Name?.trim()) errors.push('Name is required');
        if (!VALID_TRIGGERS.has(b.RecognitionTrigger || 'AT_BOOKING_SAVE')) errors.push('Invalid RecognitionTrigger');
        if (!VALID_BASE.has(b.BaseType)) errors.push('Invalid BaseType');
        if (b.BaseType !== 'TieredOnNegotiatedPrice' && b.BaseAmount == null) errors.push('BaseAmount required for non-tiered');
        if (!VALID_LEVEL.has(b.AppliesToHierarchyLevel || 'SalesExecutive')) errors.push('Invalid AppliesToHierarchyLevel');
        if (!b.EffectiveFrom) errors.push('EffectiveFrom is required');
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });

        const pool = await getPool();
        const r = await pool.request()
            .input('n',   sql.NVarChar(200), b.Name.trim())
            .input('rt',  sql.NVarChar(40),  b.RecognitionTrigger || 'AT_BOOKING_SAVE')
            .input('bt',  sql.NVarChar(40),  b.BaseType)
            .input('ba',  sql.Decimal(18,4), b.BaseAmount != null ? Number(b.BaseAmount) : null)
            .input('tj',  sql.NVarChar(sql.MAX), b.TiersJSON ? JSON.stringify(b.TiersJSON) : null)
            .input('lvl', sql.NVarChar(30),  b.AppliesToHierarchyLevel || 'SalesExecutive')
            .input('ovr', sql.Bit,           b.OverrideForReportingChain ? 1 : 0)
            .input('vid', sql.Int,           b.VariantID ? parseInt(b.VariantID) : null)
            .input('ef',  sql.Date,          new Date(b.EffectiveFrom))
            .input('et',  sql.Date,          b.EffectiveTo ? new Date(b.EffectiveTo) : null)
            .input('act', sql.Bit,           b.IsActive === false ? 0 : 1)
            .input('by',  sql.Int,           req.user?.employeeId || null)
            .input('byN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_SalesIncentivePolicies
                        (Name, RecognitionTrigger, BaseType, BaseAmount, TiersJSON,
                         AppliesToHierarchyLevel, OverrideForReportingChain, VariantID,
                         EffectiveFrom, EffectiveTo, IsActive,
                         CreatedByEmployeeID, CreatedByName)
                    OUTPUT INSERTED.PolicyID
                    VALUES (@n, @rt, @bt, @ba, @tj, @lvl, @ovr, @vid, @ef, @et, @act, @by, @byN)`);
        res.status(201).json({ message: 'Policy created', PolicyID: r.recordset[0].PolicyID });
    } catch (err) {
        console.error('createPolicy:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updatePolicy = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const r = pool.request().input('id', sql.Int, id);
        const sets = [];
        if (b.Name !== undefined) { r.input('n', sql.NVarChar(200), b.Name); sets.push('Name=@n'); }
        if (b.BaseAmount !== undefined) { r.input('ba', sql.Decimal(18,4), b.BaseAmount); sets.push('BaseAmount=@ba'); }
        if (b.TiersJSON !== undefined) { r.input('tj', sql.NVarChar(sql.MAX), b.TiersJSON ? JSON.stringify(b.TiersJSON) : null); sets.push('TiersJSON=@tj'); }
        if (b.EffectiveTo !== undefined) { r.input('et', sql.Date, b.EffectiveTo ? new Date(b.EffectiveTo) : null); sets.push('EffectiveTo=@et'); }
        if (b.IsActive !== undefined) { r.input('act', sql.Bit, b.IsActive ? 1 : 0); sets.push('IsActive=@act'); }
        if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
        await r.query(`UPDATE dms_SalesIncentivePolicies SET ${sets.join(', ')} WHERE PolicyID=@id`);
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deletePolicy = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const u = await pool.request().input('id', sql.Int, id)
            .query(`SELECT COUNT(*) AS n FROM dms_SalesIncentiveAccruals WHERE SalesPolicyID=@id`);
        if (u.recordset[0].n > 0) return res.status(409).json({ error: `Policy is referenced by ${u.recordset[0].n} accrual(s). Deactivate instead.` });
        const r = await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_SalesIncentivePolicies OUTPUT DELETED.PolicyID WHERE PolicyID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Policy not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// =========================================================================
// ASSIGNMENTS
// =========================================================================

exports.listAssignments = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.policyId)   { r.input('p', sql.Int, parseInt(req.query.policyId));   conds.push('a.PolicyID=@p'); }
        if (req.query.employeeId) { r.input('e', sql.Int, parseInt(req.query.employeeId)); conds.push('a.EmployeeID=@e'); }
        if (req.query.activeOnly === '1') conds.push('a.IsActive=1');
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT a.AssignmentID, a.PolicyID, p.Name AS PolicyName, p.AppliesToHierarchyLevel,
                   a.EmployeeID, e.EmployeeName,
                   a.EffectiveFrom, a.EffectiveTo, a.IsActive,
                   a.CreatedAt, a.CreatedByName
            FROM dms_SalesIncentiveAssignments a
            JOIN dms_SalesIncentivePolicies p ON a.PolicyID = p.PolicyID
            LEFT JOIN gen_EmployeeInfo e ON a.EmployeeID = e.EmployeeID
            ${where}
            ORDER BY a.IsActive DESC, a.EffectiveFrom DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createAssignment = async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.PolicyID || !b.EmployeeID || !b.EffectiveFrom) return res.status(400).json({ error: 'PolicyID, EmployeeID, EffectiveFrom required.' });
        const pool = await getPool();
        await pool.request()
            .input('p', sql.Int, parseInt(b.PolicyID))
            .input('e', sql.Int, parseInt(b.EmployeeID))
            .input('ef', sql.Date, new Date(b.EffectiveFrom))
            .input('et', sql.Date, b.EffectiveTo ? new Date(b.EffectiveTo) : null)
            .input('by', sql.Int, req.user?.employeeId || null)
            .input('byN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_SalesIncentiveAssignments
                        (PolicyID, EmployeeID, EffectiveFrom, EffectiveTo, IsActive, CreatedByEmployeeID, CreatedByName)
                    VALUES (@p, @e, @ef, @et, 1, @by, @byN)`);
        res.status(201).json({ message: 'Assignment created' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deactivateAssignment = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        await pool.request().input('id', sql.Int, id)
            .query(`UPDATE dms_SalesIncentiveAssignments SET IsActive=0, EffectiveTo=CAST(GETDATE() AS DATE) WHERE AssignmentID=@id`);
        res.json({ message: 'Deactivated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// =========================================================================
// ACCRUAL ENGINE (pure)
// =========================================================================

/**
 * Look up the currently-effective policy for an employee. Returns null if none.
 * Used by the booking-save / approval hooks.
 */
async function activePolicyForEmployee(executor, employeeId, variantId, asOfDate = new Date()) {
    // Prefer variant-specific policies over global (VariantID IS NULL). Most-recently-effective wins on ties.
    const r = await executor.request()
        .input('e', sql.Int, employeeId)
        .input('v', sql.Int, variantId || null)
        .input('d', sql.Date, asOfDate)
        .query(`
            SELECT TOP 1 p.*,
                   CASE WHEN p.VariantID = @v THEN 1 ELSE 0 END AS IsVariantSpecific
            FROM dms_SalesIncentiveAssignments a
            JOIN dms_SalesIncentivePolicies p ON a.PolicyID = p.PolicyID
            WHERE a.EmployeeID = @e AND a.IsActive = 1 AND p.IsActive = 1
              AND a.EffectiveFrom <= @d AND (a.EffectiveTo IS NULL OR a.EffectiveTo >= @d)
              AND p.EffectiveFrom <= @d AND (p.EffectiveTo IS NULL OR p.EffectiveTo >= @d)
              AND p.RecognitionTrigger = 'AT_BOOKING_SAVE'
              AND (p.VariantID IS NULL OR p.VariantID = @v)
            ORDER BY IsVariantSpecific DESC, a.EffectiveFrom DESC, p.EffectiveFrom DESC
        `);
    return r.recordset[0] || null;
}

/**
 * Compute accrual amount from a policy + booking's negotiated price.
 */
function computeAmount(policy, negotiatedPrice) {
    if (!policy) return 0;
    if (policy.BaseType === 'FlatPerCar') return Number(policy.BaseAmount) || 0;
    if (policy.BaseType === 'PercentOfNegotiatedPrice') {
        return +(Number(negotiatedPrice) * (Number(policy.BaseAmount) || 0) / 100).toFixed(2);
    }
    if (policy.BaseType === 'TieredOnNegotiatedPrice') {
        try {
            const tiers = JSON.parse(policy.TiersJSON || '[]');
            // Find the highest tier whose floor ≤ negotiatedPrice
            const sorted = tiers.slice().sort((a, b) => (b.floorAmount || 0) - (a.floorAmount || 0));
            const hit = sorted.find(t => Number(negotiatedPrice) >= (Number(t.floorAmount) || 0));
            return hit ? Number(hit.rateOrFlat) || 0 : 0;
        } catch { return 0; }
    }
    return 0;
}

/**
 * Accrue staff incentive for a booking — called inline from booking-create
 * (when no discount) or negotiation-approve (when discount approved).
 * Writes an accrual row + (when GL roles map) a journal entry.
 *
 * Idempotent on (BookingID, EarnerEmployeeID, Category='SalesStaff') — only one accrual per executive per booking.
 *
 * MUST be passed an open transaction.
 */
async function accrueForBooking(tx, bookingId) {
    // Booking details
    const r = await new sql.Request(tx).input('id', sql.Int, bookingId).query(`
        SELECT BookingID, NegotiatedPrice, CreatedBy_SalesExecutiveID, Status, VehicleVariantID
        FROM dms_SalesBookings WHERE BookingID=@id`);
    if (!r.recordset.length) return { skipped: 'booking-not-found' };
    const booking = r.recordset[0];
    if (!booking.CreatedBy_SalesExecutiveID) return { skipped: 'no-executive' };

    // Idempotency check
    const dup = await new sql.Request(tx)
        .input('b', sql.Int, bookingId)
        .input('e', sql.Int, booking.CreatedBy_SalesExecutiveID)
        .query(`SELECT TOP 1 AccrualID FROM dms_SalesIncentiveAccruals
                WHERE BookingID=@b AND EarnerEmployeeID=@e AND IncentiveCategory='SalesStaff' AND Status='Accrued'`);
    if (dup.recordset.length) return { skipped: 'already-accrued', AccrualID: dup.recordset[0].AccrualID };

    const policy = await activePolicyForEmployee(tx, booking.CreatedBy_SalesExecutiveID, booking.VehicleVariantID);
    if (!policy) return { skipped: 'no-policy' };

    const amount = computeAmount(policy, booking.NegotiatedPrice);
    if (amount <= 0) return { skipped: 'zero-amount' };

    const ar = await new sql.Request(tx)
        .input('b', sql.Int, bookingId)
        .input('e', sql.Int, booking.CreatedBy_SalesExecutiveID)
        .input('cat', sql.NVarChar(20), 'SalesStaff')
        .input('amt', sql.Decimal(18,2), amount)
        .input('base', sql.Decimal(18,2), booking.NegotiatedPrice)
        .input('p', sql.Int, policy.PolicyID)
        .input('snap', sql.NVarChar(sql.MAX), JSON.stringify(policy))
        .query(`INSERT INTO dms_SalesIncentiveAccruals
                    (BookingID, EarnerType, EarnerEmployeeID, IncentiveCategory,
                     AmountAccrued, IncentiveBaseAmount, SalesPolicyID, PolicySnapshotJSON, Status, AccruedAt)
                OUTPUT INSERTED.AccrualID
                VALUES (@b, 'Employee', @e, @cat, @amt, @base, @p, @snap, 'Accrued', GETDATE())`);
    const accrualId = ar.recordset[0].AccrualID;

    // GL post — gated. If the staff-incentive roles aren't mapped, skip silently.
    let voucherId = null;
    try {
        const { postAccrualVoucher } = require('../services/salesIncentivePostingService');
        voucherId = await postAccrualVoucher(accrualId, null, tx);
    } catch (glErr) {
        if (glErr.code !== 'SYSTEM_ACCOUNT_NOT_CONFIGURED') throw glErr;
        // unmapped — leave the accrual row stand, no GL hit yet
    }
    return { AccrualID: accrualId, AmountAccrued: amount, PolicyID: policy.PolicyID, VoucherID: voucherId };
}

/**
 * Reverse a booking's staff accrual (clawback on cancel).
 */
async function reverseForBooking(tx, bookingId, reason) {
    const r = await new sql.Request(tx).input('b', sql.Int, bookingId)
        .query(`SELECT AccrualID FROM dms_SalesIncentiveAccruals
                WHERE BookingID=@b AND IncentiveCategory='SalesStaff' AND Status='Accrued'`);
    if (!r.recordset.length) return { skipped: 'no-active-accrual' };
    const ids = r.recordset.map(x => x.AccrualID);
    await new sql.Request(tx).input('r', sql.NVarChar(sql.MAX), reason || 'Booking cancelled')
        .query(`UPDATE dms_SalesIncentiveAccruals
                SET Status='Reversed', ReversedAt=GETDATE(), ReversalReason=@r
                WHERE AccrualID IN (${ids.join(',')})`);
    return { ReversedCount: ids.length };
}

// =========================================================================
// DISBURSEMENT
// =========================================================================

// GET /api/sales/incentives/balances — per-employee accrued / disbursed / outstanding
exports.balances = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT a.EarnerEmployeeID, e.EmployeeName,
                   SUM(CASE WHEN a.Status IN ('Accrued','PartiallyDisbursed') THEN a.AmountAccrued ELSE 0 END) AS TotalAccrued,
                   SUM(a.DisbursedAmount) AS TotalDisbursed,
                   SUM(CASE WHEN a.Status='Reversed' THEN a.AmountAccrued ELSE 0 END) AS TotalReversed,
                   SUM(CASE WHEN a.Status IN ('Accrued','PartiallyDisbursed') THEN a.AmountAccrued - a.DisbursedAmount ELSE 0 END) AS Outstanding,
                   COUNT(*) AS AccrualCount,
                   MAX(a.AccruedAt) AS LastAccruedAt,
                   MAX(a.LastDisbursedAt) AS LastDisbursedAt
            FROM dms_SalesIncentiveAccruals a
            LEFT JOIN gen_EmployeeInfo e ON a.EarnerEmployeeID = e.EmployeeID
            WHERE a.EarnerType='Employee'
            GROUP BY a.EarnerEmployeeID, e.EmployeeName
            ORDER BY Outstanding DESC
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/sales/incentives/accruals?employeeId=&status=
exports.listAccruals = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = ['a.EarnerType=\'Employee\''];
        if (req.query.employeeId) { r.input('e', sql.Int, parseInt(req.query.employeeId)); conds.push('a.EarnerEmployeeID=@e'); }
        if (req.query.status)     { r.input('s', sql.NVarChar(20), req.query.status); conds.push('a.Status=@s'); }
        const where = `WHERE ${conds.join(' AND ')}`;
        const result = await r.query(`
            SELECT a.AccrualID, a.BookingID, b.BookingNo, b.Status AS BookingStatus,
                   a.EarnerEmployeeID, e.EmployeeName,
                   a.IncentiveCategory, a.AmountAccrued, a.DisbursedAmount,
                   a.AmountAccrued - a.DisbursedAmount AS Outstanding,
                   a.IncentiveBaseAmount, a.SalesPolicyID, p.Name AS PolicyName,
                   a.Status, a.AccruedAt, a.LastDisbursedAt, a.ReversedAt, a.ReversalReason
            FROM dms_SalesIncentiveAccruals a
            LEFT JOIN dms_SalesBookings b ON a.BookingID = b.BookingID
            LEFT JOIN gen_EmployeeInfo e ON a.EarnerEmployeeID = e.EmployeeID
            LEFT JOIN dms_SalesIncentivePolicies p ON a.SalesPolicyID = p.PolicyID
            ${where}
            ORDER BY a.AccruedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/incentives/disburse  { EmployeeID, Amount, PaymentMode, Notes? }
// Distributes the disbursement across the employee's oldest outstanding accruals (FIFO).
// Records disbursement amount per accrual row + (when GL roles map) posts a CPV/BPV voucher.
exports.disburse = async (req, res) => {
    try {
        const b = req.body || {};
        const empId = parseInt(b.EmployeeID);
        const amount = Number(b.Amount);
        if (!empId || !amount || amount <= 0) return res.status(400).json({ error: 'EmployeeID and Amount required.' });

        const pool = await getPool();

        // Get FIFO list of outstanding accruals
        const r = await pool.request().input('e', sql.Int, empId).query(`
            SELECT AccrualID, AmountAccrued, DisbursedAmount, AmountAccrued - DisbursedAmount AS Outstanding
            FROM dms_SalesIncentiveAccruals
            WHERE EarnerType='Employee' AND EarnerEmployeeID=@e
              AND Status IN ('Accrued','PartiallyDisbursed')
              AND (AmountAccrued - DisbursedAmount) > 0
            ORDER BY AccruedAt
        `);
        const outstanding = r.recordset;
        const totalAvail = outstanding.reduce((s, x) => s + Number(x.Outstanding), 0);
        if (amount > totalAvail) return res.status(400).json({ error: `Amount ${amount.toLocaleString()} exceeds outstanding balance ${totalAvail.toLocaleString()}.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            let remaining = amount;
            const distributed = [];
            for (const acc of outstanding) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, Number(acc.Outstanding));
                const newDisbursed = Number(acc.DisbursedAmount) + take;
                const fullyDisbursed = newDisbursed >= Number(acc.AmountAccrued);
                await new sql.Request(tx)
                    .input('id', sql.Int, acc.AccrualID)
                    .input('d', sql.Decimal(18,2), newDisbursed)
                    .input('s', sql.NVarChar(20), fullyDisbursed ? 'Disbursed' : 'PartiallyDisbursed')
                    .query(`UPDATE dms_SalesIncentiveAccruals
                            SET DisbursedAmount=@d, Status=@s, LastDisbursedAt=GETDATE()
                            WHERE AccrualID=@id`);
                distributed.push({ AccrualID: acc.AccrualID, AppliedAmount: take });
                remaining -= take;
            }

            // GL post — gated on STAFF_INCENTIVE_PAYABLE + CASH_BOOK (cash) or BankAccountID (non-cash)
            const mode = b.PaymentMode === 'Cash' ? 'Cash' : 'Bank';
            const bankAccountId = b.BankAccountID ? Number(b.BankAccountID) : null;
            if (mode === 'Bank' && !bankAccountId) {
                throw new Error('BankAccountID is required for non-cash disbursement.');
            }
            let disbVoucherId = null;
            try {
                const { postDisbursementVoucher } = require('../services/salesIncentivePostingService');
                disbVoucherId = await postDisbursementVoucher({
                    totalAmount: amount,
                    bankAccountId,
                    mode,
                    narration: `Staff incentive disbursement to employee #${empId} (${distributed.length} accrual${distributed.length===1?'':'s'})`,
                    sourceDocId: empId,
                }, req.user, tx);
            } catch (glErr) {
                if (glErr.code !== 'SYSTEM_ACCOUNT_NOT_CONFIGURED') throw glErr;
                console.warn(`[sales] Disbursement GL posting SKIPPED — ${glErr.message}`);
            }

            await tx.commit();
            res.json({
                message: 'Disbursed',
                EmployeeID: empId,
                TotalDisbursed: amount,
                AccrualsTouched: distributed.length,
                Distributed: distributed,
                VoucherID: disbVoucherId,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('disburse:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    listPolicies: exports.listPolicies,
    getPolicy: exports.getPolicy,
    createPolicy: exports.createPolicy,
    updatePolicy: exports.updatePolicy,
    deletePolicy: exports.deletePolicy,
    listAssignments: exports.listAssignments,
    createAssignment: exports.createAssignment,
    deactivateAssignment: exports.deactivateAssignment,
    listAccruals: exports.listAccruals,
    balances: exports.balances,
    disburse: exports.disburse,
    // exported for booking controller to call directly
    accrueForBooking,
    reverseForBooking,
};
