/**
 * Sales Hierarchy + Targets — admin of the executive → AGM → GM reporting line
 * and the per-employee/period sales-unit & revenue targets used by the staff-
 * incentive engine.
 */
const { sql, getPool } = require('../config/db');
const { logAudit } = require('../services/salesAuditService');

const HIERARCHY_ROLES = ['Executive', 'AGM', 'GM'];

// =========================================================================
// HIERARCHY ASSIGNMENTS
// =========================================================================

// GET /api/sales/hierarchy/assignments?activeOnly=true
exports.listAssignments = async (req, res) => {
    try {
        const activeOnly = (req.query.activeOnly || 'true') !== 'false';
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT h.AssignmentID, h.EmployeeID, e.EmployeeName, e.EmployeeCode,
                   h.HierarchyRole, h.AssignedAt, h.AssignedByEmployeeID,
                   h.UnassignedAt, h.Notes
            FROM dms_SalesHierarchyAssignments h
            LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID = h.EmployeeID
            ${activeOnly ? 'WHERE h.UnassignedAt IS NULL' : ''}
            ORDER BY h.HierarchyRole, e.EmployeeName`);
        res.json(r.recordset);
    } catch (err) {
        console.error('hierarchy.listAssignments:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/hierarchy/assignments  body: { EmployeeID, HierarchyRole, Notes? }
exports.assign = async (req, res) => {
    const { EmployeeID, HierarchyRole, Notes } = req.body || {};
    if (!EmployeeID || !HierarchyRole) return res.status(400).json({ error: 'EmployeeID and HierarchyRole required.' });
    if (!HIERARCHY_ROLES.includes(HierarchyRole)) {
        return res.status(400).json({ error: `HierarchyRole must be one of: ${HIERARCHY_ROLES.join(', ')}` });
    }
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // End any current assignment for this employee (one active role at a time)
        await new sql.Request(tx)
            .input('eid', sql.Int, Number(EmployeeID))
            .query(`UPDATE dms_SalesHierarchyAssignments
                    SET UnassignedAt=GETDATE()
                    WHERE EmployeeID=@eid AND UnassignedAt IS NULL`);

        const ins = await new sql.Request(tx)
            .input('eid',  sql.Int,           Number(EmployeeID))
            .input('role', sql.NVarChar(20),  HierarchyRole)
            .input('aby',  sql.Int,           req.user?.employeeId || null)
            .input('nts',  sql.NVarChar(500), Notes || null)
            .query(`INSERT INTO dms_SalesHierarchyAssignments
                        (EmployeeID, HierarchyRole, AssignedByEmployeeID, Notes)
                    OUTPUT INSERTED.AssignmentID
                    VALUES (@eid, @role, @aby, @nts)`);

        await logAudit(tx, {
            entityType: 'HierarchyAssignment', entityId: ins.recordset[0].AssignmentID,
            action: 'Assign', newValue: { EmployeeID, HierarchyRole }, actor: req.user,
        });

        await tx.commit();
        res.json({ message: 'Assignment created.', AssignmentID: ins.recordset[0].AssignmentID });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('hierarchy.assign:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/sales/hierarchy/assignments/:id/end   body: { Notes? }
exports.endAssignment = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request()
            .input('id',  sql.Int,           id)
            .input('nts', sql.NVarChar(500), req.body?.Notes || null)
            .query(`UPDATE dms_SalesHierarchyAssignments
                    SET UnassignedAt=GETDATE(), Notes=COALESCE(@nts, Notes)
                    WHERE AssignmentID=@id AND UnassignedAt IS NULL;
                    SELECT @@ROWCOUNT AS affected;`);
        if (!r.recordset[0].affected) return res.status(409).json({ error: 'Assignment already ended.' });
        res.json({ message: 'Assignment ended.' });
    } catch (err) {
        console.error('hierarchy.endAssignment:', err);
        res.status(500).json({ error: err.message });
    }
};

// =========================================================================
// TARGETS
// =========================================================================

// GET /api/sales/targets?periodType=&from=&to=&employeeId=
exports.listTargets = async (req, res) => {
    try {
        const { periodType, from, to, employeeId } = req.query || {};
        const pool = await getPool();
        const r = await pool.request()
            .input('pt',   sql.NVarChar(20), periodType || null)
            .input('from', sql.Date,         from || null)
            .input('to',   sql.Date,         to   || null)
            .input('eid',  sql.Int,          employeeId ? Number(employeeId) : null)
            .query(`SELECT t.TargetID, t.EmployeeID, e.EmployeeName, e.EmployeeCode,
                           t.PeriodType, t.PeriodStart, t.PeriodEnd,
                           t.UnitsTarget, t.RevenueTarget,
                           t.AssignedByName, t.AssignedAt, t.IsActive, t.Notes
                    FROM dms_SalesTargets t
                    LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID = t.EmployeeID
                    WHERE t.IsActive=1
                      AND (@pt   IS NULL OR t.PeriodType=@pt)
                      AND (@from IS NULL OR t.PeriodEnd   >= @from)
                      AND (@to   IS NULL OR t.PeriodStart <= @to)
                      AND (@eid  IS NULL OR t.EmployeeID = @eid)
                    ORDER BY t.PeriodStart DESC, e.EmployeeName`);
        res.json(r.recordset);
    } catch (err) {
        console.error('hierarchy.listTargets:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/targets  body: { EmployeeID, PeriodType ('Month'|'Quarter'|'Year'),
//                                  PeriodStart, PeriodEnd, UnitsTarget, RevenueTarget, Notes? }
exports.setTarget = async (req, res) => {
    const { EmployeeID, PeriodType, PeriodStart, PeriodEnd, UnitsTarget, RevenueTarget, Notes } = req.body || {};
    if (!EmployeeID || !PeriodType || !PeriodStart || !PeriodEnd) {
        return res.status(400).json({ error: 'EmployeeID, PeriodType, PeriodStart, PeriodEnd required.' });
    }
    if (!['Month', 'Quarter', 'Year'].includes(PeriodType)) {
        return res.status(400).json({ error: 'PeriodType must be Month, Quarter, or Year.' });
    }
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Deactivate any overlapping target for this employee + period
        await new sql.Request(tx)
            .input('eid', sql.Int,  Number(EmployeeID))
            .input('pt',  sql.NVarChar(20), PeriodType)
            .input('ps',  sql.Date, new Date(PeriodStart))
            .input('pe',  sql.Date, new Date(PeriodEnd))
            .query(`UPDATE dms_SalesTargets
                    SET IsActive=0
                    WHERE EmployeeID=@eid AND PeriodType=@pt AND IsActive=1
                      AND PeriodStart=@ps AND PeriodEnd=@pe`);

        const ins = await new sql.Request(tx)
            .input('eid',  sql.Int,           Number(EmployeeID))
            .input('pt',   sql.NVarChar(20),  PeriodType)
            .input('ps',   sql.Date,          new Date(PeriodStart))
            .input('pe',   sql.Date,          new Date(PeriodEnd))
            .input('ut',   sql.Int,           Number(UnitsTarget) || 0)
            .input('rt',   sql.Decimal(18,2), Number(RevenueTarget) || 0)
            .input('aby',  sql.Int,           req.user?.employeeId || null)
            .input('abyN', sql.NVarChar(100), req.user?.userName || null)
            .input('nts',  sql.NVarChar(500), Notes || null)
            .query(`INSERT INTO dms_SalesTargets
                        (EmployeeID, PeriodType, PeriodStart, PeriodEnd,
                         UnitsTarget, RevenueTarget,
                         AssignedByEmployeeID, AssignedByName, IsActive, Notes)
                    OUTPUT INSERTED.TargetID
                    VALUES (@eid, @pt, @ps, @pe, @ut, @rt, @aby, @abyN, 1, @nts)`);

        await logAudit(tx, {
            entityType: 'SalesTarget', entityId: ins.recordset[0].TargetID,
            action: 'TargetSet',
            newValue: { EmployeeID, PeriodType, PeriodStart, PeriodEnd, UnitsTarget, RevenueTarget },
            actor: req.user,
        });

        await tx.commit();
        res.json({ message: 'Target set.', TargetID: ins.recordset[0].TargetID });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('hierarchy.setTarget:', err);
        res.status(400).json({ error: err.message });
    }
};

// GET /api/sales/targets/performance?periodType=&from=&to=
// For each active target, computes actual units delivered and revenue collected
// from dms_SalesBookings where the SalesExecutiveID matches and gate pass was
// issued within the period.
exports.targetPerformance = async (req, res) => {
    try {
        const { periodType, from, to } = req.query || {};
        const pool = await getPool();
        const r = await pool.request()
            .input('pt',   sql.NVarChar(20), periodType || null)
            .input('from', sql.Date,         from || null)
            .input('to',   sql.Date,         to   || null)
            .query(`
                SELECT t.TargetID, t.EmployeeID, e.EmployeeName, e.EmployeeCode,
                       t.PeriodType, t.PeriodStart, t.PeriodEnd,
                       t.UnitsTarget, t.RevenueTarget,
                       ISNULL(p.ActualUnits, 0)   AS ActualUnits,
                       ISNULL(p.ActualRevenue, 0) AS ActualRevenue,
                       CASE WHEN t.UnitsTarget   > 0 THEN ISNULL(p.ActualUnits,   0) * 100.0 / t.UnitsTarget   ELSE NULL END AS UnitsPct,
                       CASE WHEN t.RevenueTarget > 0 THEN ISNULL(p.ActualRevenue, 0) * 100.0 / t.RevenueTarget ELSE NULL END AS RevenuePct
                FROM dms_SalesTargets t
                LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID = t.EmployeeID
                OUTER APPLY (
                    SELECT COUNT(*) AS ActualUnits, SUM(NegotiatedPrice) AS ActualRevenue
                    FROM dms_SalesBookings b
                    WHERE b.SalesExecutiveID = t.EmployeeID
                      AND b.GatePassIssuedAt IS NOT NULL
                      AND b.GatePassIssuedAt >= t.PeriodStart
                      AND b.GatePassIssuedAt <  DATEADD(day, 1, t.PeriodEnd)
                ) p
                WHERE t.IsActive=1
                  AND (@pt   IS NULL OR t.PeriodType=@pt)
                  AND (@from IS NULL OR t.PeriodEnd   >= @from)
                  AND (@to   IS NULL OR t.PeriodStart <= @to)
                ORDER BY t.PeriodStart DESC, e.EmployeeName`);
        res.json(r.recordset);
    } catch (err) {
        console.error('hierarchy.targetPerformance:', err);
        res.status(500).json({ error: err.message });
    }
};
