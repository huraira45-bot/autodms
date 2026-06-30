/**
 * Sales Recovery — installment plans created at delivery time when a booking
 * walks out without 100% paid (Decision per §20). Tracks per-installment due
 * dates, captures payments, computes 30/60/90 aging, and supports write-off
 * with admin approval.
 */
const { sql, getPool } = require('../config/db');
const { logAudit } = require('../services/salesAuditService');

// =========================================================================
// POST /api/sales/recovery/plans         body: { BookingID, OwnerEmployeeID?, Installments: [{ DueDate, AmountDue, Notes? }] }
// =========================================================================
exports.createPlan = async (req, res) => {
    const { BookingID, OwnerEmployeeID, OwnerName, Installments } = req.body || {};
    if (!BookingID) return res.status(400).json({ error: 'BookingID is required.' });
    if (!Array.isArray(Installments) || Installments.length === 0) {
        return res.status(400).json({ error: 'At least one installment is required.' });
    }

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Verify booking exists + compute outstanding
        const bk = await new sql.Request(tx)
            .input('bid', sql.Int, Number(BookingID))
            .query(`SELECT BookingID, BookingNo, NegotiatedPrice, AmountPaidToDate, Status
                    FROM dms_SalesBookings WHERE BookingID=@bid`);
        if (!bk.recordset.length) throw new Error(`Booking ${BookingID} not found.`);
        const b = bk.recordset[0];
        const remaining = Number(b.NegotiatedPrice) - Number(b.AmountPaidToDate);
        if (remaining <= 0.01) throw new Error('Booking is fully paid — no recovery plan needed.');

        // Reject if a non-written-off plan already exists for this booking
        const dup = await new sql.Request(tx)
            .input('bid', sql.Int, Number(BookingID))
            .query(`SELECT TOP 1 RecoveryPlanID FROM dms_SalesRecoveryPlans
                    WHERE BookingID=@bid AND WrittenOffAt IS NULL AND FullyRecoveredAt IS NULL`);
        if (dup.recordset.length) throw new Error('An active recovery plan already exists for this booking.');

        const totalInstallments = Installments.reduce((s, i) => s + Number(i.AmountDue || 0), 0);
        if (Math.abs(totalInstallments - remaining) > 1.0) {
            throw new Error(`Installment total ${totalInstallments.toFixed(2)} doesn't match remaining ${remaining.toFixed(2)}.`);
        }

        // Insert plan
        const planRes = await new sql.Request(tx)
            .input('bid',   sql.Int,           Number(BookingID))
            .input('rem',   sql.Decimal(18,2), remaining)
            .input('json',  sql.NVarChar(sql.MAX), JSON.stringify(Installments))
            .input('oid',   sql.Int,           OwnerEmployeeID || null)
            .input('oname', sql.NVarChar(100), OwnerName || req.user?.userName || null)
            .input('cby',   sql.Int,           req.user?.employeeId || null)
            .input('cbyN',  sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_SalesRecoveryPlans
                        (BookingID, TotalRemainingAtDelivery, InstallmentsJSON,
                         OwnerEmployeeID, OwnerName, Status,
                         CreatedByEmployeeID, CreatedByName)
                    OUTPUT INSERTED.RecoveryPlanID
                    VALUES (@bid, @rem, @json, @oid, @oname, 'Active', @cby, @cbyN)`);
        const planId = planRes.recordset[0].RecoveryPlanID;

        // Insert each installment as an indexed row for aging queries
        let seq = 0;
        for (const inst of Installments) {
            seq++;
            await new sql.Request(tx)
                .input('pid', sql.Int,           planId)
                .input('bid', sql.Int,           Number(BookingID))
                .input('seq', sql.Int,           seq)
                .input('due', sql.Date,          new Date(inst.DueDate))
                .input('amt', sql.Decimal(18,2), Number(inst.AmountDue))
                .input('nts', sql.NVarChar(500), inst.Notes || null)
                .query(`INSERT INTO dms_SalesRecoveryInstallments
                            (RecoveryPlanID, BookingID, SeqNo, DueDate, AmountDue, Notes)
                        VALUES (@pid, @bid, @seq, @due, @amt, @nts)`);
        }

        await logAudit(tx, {
            bookingId: Number(BookingID), entityType: 'RecoveryPlan', entityId: planId,
            action: 'PlanCreated',
            newValue: { installments: Installments.length, totalAmount: remaining },
            actor: req.user,
        });

        await tx.commit();
        res.json({ message: 'Recovery plan created.', RecoveryPlanID: planId, InstallmentCount: seq });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('recovery.createPlan:', err);
        res.status(400).json({ error: err.message });
    }
};

// GET /api/sales/recovery/plans?bookingId=
exports.listPlans = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('bid', sql.Int, req.query.bookingId ? Number(req.query.bookingId) : null)
            .query(`SELECT p.RecoveryPlanID, p.BookingID, b.BookingNo, b.PartyName, b.PartyType,
                           b.VariantName, b.AllocatedChasisNo,
                           p.TotalRemainingAtDelivery, p.OwnerEmployeeID, p.OwnerName, p.Status,
                           p.CreatedAt, p.FullyRecoveredAt, p.WrittenOffAt, p.WriteOffReason,
                           ISNULL(agg.TotalPaid, 0)           AS TotalPaid,
                           p.TotalRemainingAtDelivery - ISNULL(agg.TotalPaid, 0) AS Outstanding,
                           ISNULL(agg.OverdueCount, 0)        AS OverdueCount,
                           ISNULL(agg.UpcomingCount, 0)       AS UpcomingCount
                    FROM dms_SalesRecoveryPlans p
                    LEFT JOIN (
                        SELECT BookingID,
                            SUM(AmountPaid) AS TotalPaid,
                            SUM(CASE WHEN Status IN ('Pending','PartiallyPaid','Overdue') AND DueDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS OverdueCount,
                            SUM(CASE WHEN Status IN ('Pending','PartiallyPaid') AND DueDate >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS UpcomingCount
                        FROM dms_SalesRecoveryInstallments
                        GROUP BY BookingID
                    ) agg ON agg.BookingID = p.BookingID
                    LEFT JOIN (
                        SELECT b.BookingID, b.BookingNo, p.PartyName, p.PartyType, v.VariantName, b.AllocatedChasisNo
                        FROM dms_SalesBookings b
                        LEFT JOIN gen_PartiesInfo p ON p.PartyID = b.PartyID
                        LEFT JOIN dms_VehicleVariant v ON v.VariantID = b.VariantID
                    ) b ON b.BookingID = p.BookingID
                    WHERE (@bid IS NULL OR p.BookingID = @bid)
                    ORDER BY p.CreatedAt DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('recovery.listPlans:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/sales/recovery/plans/:id — plan + installments
exports.getPlan = async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const pool = await getPool();
        const head = await pool.request().input('id', sql.Int, planId).query(`
            SELECT * FROM dms_SalesRecoveryPlans WHERE RecoveryPlanID=@id`);
        if (!head.recordset.length) return res.status(404).json({ error: 'Plan not found.' });
        const inst = await pool.request().input('id', sql.Int, planId).query(`
            SELECT *, DATEDIFF(day, DueDate, GETDATE()) AS DaysOverdue
            FROM dms_SalesRecoveryInstallments WHERE RecoveryPlanID=@id ORDER BY SeqNo`);
        res.json({ plan: head.recordset[0], installments: inst.recordset });
    } catch (err) {
        console.error('recovery.getPlan:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/recovery/installments/:id/mark-paid  body: { AmountPaid, VoucherID?, VoucherNo?, Notes? }
exports.markInstallmentPaid = async (req, res) => {
    const instId = parseInt(req.params.id);
    const { AmountPaid, VoucherID, VoucherNo, Notes } = req.body || {};
    const amt = Number(AmountPaid);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'AmountPaid > 0 required.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const r = await new sql.Request(tx)
            .input('id', sql.Int, instId)
            .query(`SELECT InstallmentID, RecoveryPlanID, BookingID, AmountDue, AmountPaid, Status
                    FROM dms_SalesRecoveryInstallments WITH (UPDLOCK, HOLDLOCK)
                    WHERE InstallmentID=@id`);
        if (!r.recordset.length) throw new Error('Installment not found.');
        const ins = r.recordset[0];
        if (ins.Status === 'Paid' || ins.Status === 'WrittenOff') throw new Error(`Installment already ${ins.Status}.`);

        const newPaid = Math.min(Number(ins.AmountPaid) + amt, Number(ins.AmountDue));
        const newStatus = newPaid >= Number(ins.AmountDue) - 0.01 ? 'Paid' : 'PartiallyPaid';

        await new sql.Request(tx)
            .input('id',  sql.Int,           instId)
            .input('amt', sql.Decimal(18,2), newPaid)
            .input('st',  sql.NVarChar(20),  newStatus)
            .input('vid', sql.Int,           VoucherID || null)
            .input('vno', sql.NVarChar(50),  VoucherNo || null)
            .input('nts', sql.NVarChar(500), Notes || null)
            .query(`UPDATE dms_SalesRecoveryInstallments
                    SET AmountPaid=@amt, Status=@st,
                        PaidVoucherID=COALESCE(@vid, PaidVoucherID),
                        PaidVoucherNo=COALESCE(@vno, PaidVoucherNo),
                        Notes=COALESCE(@nts, Notes)
                    WHERE InstallmentID=@id`);

        // If all installments paid, flag plan FullyRecovered
        const remaining = await new sql.Request(tx)
            .input('pid', sql.Int, ins.RecoveryPlanID)
            .query(`SELECT COUNT(*) AS Open
                    FROM dms_SalesRecoveryInstallments
                    WHERE RecoveryPlanID=@pid AND Status NOT IN ('Paid','WrittenOff')`);
        if (remaining.recordset[0].Open === 0) {
            await new sql.Request(tx)
                .input('pid', sql.Int, ins.RecoveryPlanID)
                .query(`UPDATE dms_SalesRecoveryPlans
                        SET FullyRecoveredAt=GETDATE(), Status='FullyRecovered'
                        WHERE RecoveryPlanID=@pid`);
        }

        await logAudit(tx, {
            bookingId: ins.BookingID, entityType: 'RecoveryInstallment', entityId: instId,
            action: 'InstallmentPaid',
            oldValue: { paid: Number(ins.AmountPaid), status: ins.Status },
            newValue: { paid: newPaid, status: newStatus, voucher: VoucherNo },
            actor: req.user,
        });

        await tx.commit();
        res.json({ message: 'Installment marked paid.' });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('recovery.markInstallmentPaid:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/sales/recovery/plans/:id/write-off    body: { Reason }
exports.writeOffPlan = async (req, res) => {
    const planId = parseInt(req.params.id);
    const { Reason } = req.body || {};
    if (!Reason || !Reason.trim()) return res.status(400).json({ error: 'Reason is required.' });
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const r = await new sql.Request(tx)
            .input('id', sql.Int, planId)
            .query(`SELECT RecoveryPlanID, BookingID, Status, WrittenOffAt
                    FROM dms_SalesRecoveryPlans WITH (UPDLOCK, HOLDLOCK)
                    WHERE RecoveryPlanID=@id`);
        if (!r.recordset.length) throw new Error('Plan not found.');
        const p = r.recordset[0];
        if (p.WrittenOffAt) throw new Error('Plan already written off.');

        await new sql.Request(tx)
            .input('id',  sql.Int,             planId)
            .input('emp', sql.Int,             req.user?.employeeId || null)
            .input('rsn', sql.NVarChar(sql.MAX), Reason.trim())
            .query(`UPDATE dms_SalesRecoveryPlans
                    SET WrittenOffAt=GETDATE(), WriteOffApprovedByEmployeeID=@emp,
                        WriteOffReason=@rsn, Status='WrittenOff'
                    WHERE RecoveryPlanID=@id`);

        // Cascade: mark all still-open installments as WrittenOff
        await new sql.Request(tx)
            .input('pid', sql.Int, planId)
            .query(`UPDATE dms_SalesRecoveryInstallments
                    SET Status='WrittenOff'
                    WHERE RecoveryPlanID=@pid AND Status NOT IN ('Paid','WrittenOff')`);

        await logAudit(tx, {
            bookingId: p.BookingID, entityType: 'RecoveryPlan', entityId: planId,
            action: 'WriteOff', newValue: Reason.trim(), actor: req.user,
        });

        await tx.commit();
        res.json({ message: 'Plan written off.' });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('recovery.writeOffPlan:', err);
        res.status(400).json({ error: err.message });
    }
};

// GET /api/sales/recovery/aging
// Aging report — buckets overdue installments into 0-30 / 31-60 / 61-90 / 90+.
exports.aging = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT
                ISNULL(SUM(CASE WHEN DueDate >= DATEADD(day, -30, GETDATE())                                THEN AmountDue - AmountPaid ELSE 0 END), 0) AS Bucket_0_30,
                ISNULL(SUM(CASE WHEN DueDate <  DATEADD(day, -30, GETDATE()) AND DueDate >= DATEADD(day, -60, GETDATE()) THEN AmountDue - AmountPaid ELSE 0 END), 0) AS Bucket_31_60,
                ISNULL(SUM(CASE WHEN DueDate <  DATEADD(day, -60, GETDATE()) AND DueDate >= DATEADD(day, -90, GETDATE()) THEN AmountDue - AmountPaid ELSE 0 END), 0) AS Bucket_61_90,
                ISNULL(SUM(CASE WHEN DueDate <  DATEADD(day, -90, GETDATE())                                            THEN AmountDue - AmountPaid ELSE 0 END), 0) AS Bucket_Over_90,
                ISNULL(SUM(AmountDue - AmountPaid), 0) AS TotalOutstanding,
                COUNT(*) AS OpenInstallmentCount
            FROM dms_SalesRecoveryInstallments
            WHERE Status IN ('Pending','PartiallyPaid','Overdue')
              AND DueDate < CAST(GETDATE() AS DATE)`);
        const buckets = r.recordset[0] || {};
        // Per-plan detail
        const detail = await pool.request().query(`
            SELECT TOP 200
                i.InstallmentID, i.RecoveryPlanID, i.BookingID, b.BookingNo,
                p.PartyName, i.SeqNo, i.DueDate, i.AmountDue, i.AmountPaid,
                i.AmountDue - i.AmountPaid AS Outstanding,
                DATEDIFF(day, i.DueDate, GETDATE()) AS DaysOverdue,
                rp.OwnerName
            FROM dms_SalesRecoveryInstallments i
            INNER JOIN dms_SalesRecoveryPlans  rp ON rp.RecoveryPlanID = i.RecoveryPlanID
            INNER JOIN dms_SalesBookings       b  ON b.BookingID       = i.BookingID
            LEFT  JOIN gen_PartiesInfo         p  ON p.PartyID         = b.PartyID
            WHERE i.Status IN ('Pending','PartiallyPaid','Overdue')
              AND i.DueDate < CAST(GETDATE() AS DATE)
            ORDER BY i.DueDate ASC`);
        res.json({ buckets, detail: detail.recordset });
    } catch (err) {
        console.error('recovery.aging:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/recovery/sweep-overdue
// Maintenance: flips installments past due to Status='Overdue' (idempotent).
// Wire to a daily cron in salesCron.js if/when one is added.
exports.sweepOverdue = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            UPDATE dms_SalesRecoveryInstallments
            SET Status='Overdue'
            WHERE Status='Pending' AND DueDate < CAST(GETDATE() AS DATE);
            SELECT @@ROWCOUNT AS Updated;`);
        res.json({ message: 'Overdue sweep complete.', Updated: r.recordset[0]?.Updated || 0 });
    } catch (err) {
        console.error('recovery.sweepOverdue:', err);
        res.status(500).json({ error: err.message });
    }
};
