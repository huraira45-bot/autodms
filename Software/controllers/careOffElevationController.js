/**
 * Care-Off discount cap elevation workflow.
 *
 * Users with `careoff_request_elevation` can request an admin raise a
 * specific Job Card's discount cap above the assigned care-off employee's
 * normal MaxDiscountPct. Admins with `careoff_approve_elevation` decide.
 *
 * The effective cap used by the JC save/finalize path is the MAX of the
 * care-off's normal MaxDiscountPct and any APPROVED elevation for that JC —
 * see `getEffectiveCapForJC` (exported for the workshop controller).
 *
 * Owner ask 2026-07-23.
 */
const { sql, getPool } = require('../config/db');

const requirePerm = (req, key) => (req.user?.modules || []).includes(key);

// ─── Helper used by workshopController.saveJobCard ───────────────────
// Returns the effective cap % (0–100) for a JC given a base cap. Reads any
// approved elevation request for the JobCardID and takes the MAX. If no
// elevation exists, returns the base cap unchanged.
async function getEffectiveCapForJC(jobCardId, baseCapPct) {
    if (!jobCardId) return baseCapPct;
    const pool = await getPool();
    const r = await pool.request()
        .input('jcId', sql.Int, jobCardId)
        .query(`SELECT MAX(RequestedCapPct) AS ElevCap
                FROM   dms_CareOffElevationRequests
                WHERE  JobCardID = @jcId AND Status = 'APPROVED'`);
    const elev = r.recordset[0]?.ElevCap;
    return elev != null ? Math.max(Number(baseCapPct) || 0, Number(elev)) : baseCapPct;
}

// GET /api/careoff-elevations?status=PENDING|APPROVED|REJECTED|ALL
exports.list = async (req, res) => {
    if (!requirePerm(req, 'careoff_request_elevation') && !requirePerm(req, 'careoff_approve_elevation')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }
    try {
        const status = (req.query.status || 'ALL').toUpperCase();
        const pool = await getPool();
        const rq = pool.request();
        let where = '';
        if (['PENDING','APPROVED','REJECTED'].includes(status)) {
            rq.input('st', sql.NVarChar(20), status);
            where = 'WHERE r.Status = @st';
        }
        const rows = await rq.query(`
            SELECT r.*,
                   j.JobCardNo, j.jobCode, j.VehicleRegNo,
                   c.MaxDiscountPct AS CurrentMaxCap,
                   e.EmployeeName   AS CareOffEmployeeCurrentName
            FROM   dms_CareOffElevationRequests r
            LEFT   JOIN Addata_JobCardInfo   j ON j.JobCardId = r.JobCardID
            LEFT   JOIN dms_CareOff           c ON c.CareOffID  = r.CareOffID
            LEFT   JOIN gen_EmployeeInfo      e ON e.EmployeeId = c.EmployeeId
            ${where}
            ORDER  BY r.RequestedAt DESC, r.RequestID DESC`);
        res.json(rows.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/careoff-elevations/for-jc/:id — latest approved cap for a JC
exports.forJC = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('jcId', sql.Int, parseInt(req.params.id))
            .query(`SELECT TOP 1 RequestID, RequestedCapPct, OriginalCapPct, Status, DecidedAt, DecidedByName
                    FROM   dms_CareOffElevationRequests
                    WHERE  JobCardID = @jcId
                    ORDER  BY CASE Status WHEN 'APPROVED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
                             RequestedAt DESC`);
        res.json(r.recordset[0] || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/careoff-elevations
// body: { JobCardID, CareOffID, RequestedCapPct, Reason }
exports.create = async (req, res) => {
    if (!requirePerm(req, 'careoff_request_elevation')) {
        return res.status(403).json({ error: 'You do not have permission to request cap elevations.' });
    }
    try {
        const { JobCardID, CareOffID, RequestedCapPct, Reason } = req.body;
        if (!JobCardID || !CareOffID || RequestedCapPct == null) {
            return res.status(400).json({ error: 'JobCardID, CareOffID, and RequestedCapPct are required.' });
        }
        const pool = await getPool();
        // Look up the care-off's current cap + employee for the audit trail
        const co = await pool.request()
            .input('coId', sql.Int, parseInt(CareOffID))
            .query(`SELECT c.CareOffID, c.MaxDiscountPct, c.EmployeeId, e.EmployeeName
                    FROM   dms_CareOff c
                    LEFT   JOIN gen_EmployeeInfo e ON e.EmployeeId = c.EmployeeId
                    WHERE  c.CareOffID = @coId AND c.IsActive = 1`);
        if (!co.recordset.length) return res.status(400).json({ error: 'Care-Off is inactive or not found.' });
        const original = Number(co.recordset[0].MaxDiscountPct) || 0;
        const requested = Number(RequestedCapPct);
        if (!(requested > original)) {
            return res.status(400).json({ error: `Requested cap (${requested}%) must be higher than the current cap (${original}%).` });
        }
        if (requested > 100) return res.status(400).json({ error: 'Cap cannot exceed 100%.' });

        // Refuse if there's already a PENDING request for this JC
        const dup = await pool.request()
            .input('jcId', sql.Int, parseInt(JobCardID))
            .query(`SELECT 1 FROM dms_CareOffElevationRequests
                    WHERE JobCardID = @jcId AND Status = 'PENDING'`);
        if (dup.recordset.length) {
            return res.status(409).json({ error: 'A pending elevation request already exists for this Job Card. Wait for the admin decision or cancel it first.' });
        }

        const ins = await pool.request()
            .input('jcId',      sql.Int,          parseInt(JobCardID))
            .input('coId',      sql.Int,          parseInt(CareOffID))
            .input('empId',     sql.Int,          co.recordset[0].EmployeeId || null)
            .input('empName',   sql.NVarChar(200),co.recordset[0].EmployeeName || null)
            .input('orig',      sql.Decimal(5,2), original)
            .input('req',       sql.Decimal(5,2), requested)
            .input('reason',    sql.NVarChar(500),Reason || null)
            .input('by',        sql.Int,          req.user?.userId || null)
            .input('byName',    sql.NVarChar(100),req.user?.userName || null)
            .query(`INSERT INTO dms_CareOffElevationRequests
                        (JobCardID, CareOffID, CareOffEmployeeID, CareOffEmployeeName,
                         OriginalCapPct, RequestedCapPct, Reason, Status,
                         RequestedBy, RequestedByName)
                    OUTPUT INSERTED.RequestID
                    VALUES (@jcId, @coId, @empId, @empName, @orig, @req, @reason, 'PENDING', @by, @byName)`);
        res.status(201).json({ message: 'Elevation request submitted for admin approval.', RequestID: ins.recordset[0].RequestID });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// PATCH /api/careoff-elevations/:id/approve  body: { DecisionReason? }
exports.approve = async (req, res) => {
    if (!requirePerm(req, 'careoff_approve_elevation')) {
        return res.status(403).json({ error: 'Only an admin can approve elevation requests.' });
    }
    try {
        const pool = await getPool();
        const chk = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT Status FROM dms_CareOffElevationRequests WHERE RequestID = @id`);
        if (!chk.recordset.length) return res.status(404).json({ error: 'Request not found.' });
        if (chk.recordset[0].Status !== 'PENDING') return res.status(409).json({ error: `Request is ${chk.recordset[0].Status}, not pending.` });

        await pool.request()
            .input('id',       sql.Int,          parseInt(req.params.id))
            .input('by',       sql.Int,          req.user?.userId || null)
            .input('byName',   sql.NVarChar(100),req.user?.userName || null)
            .input('reason',   sql.NVarChar(500),req.body.DecisionReason || null)
            .query(`UPDATE dms_CareOffElevationRequests
                    SET    Status='APPROVED', DecidedBy=@by, DecidedByName=@byName,
                           DecidedAt=GETDATE(), DecisionReason=@reason
                    WHERE  RequestID = @id`);
        res.json({ message: 'Elevation approved.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// PATCH /api/careoff-elevations/:id/reject  body: { DecisionReason (required) }
exports.reject = async (req, res) => {
    if (!requirePerm(req, 'careoff_approve_elevation')) {
        return res.status(403).json({ error: 'Only an admin can reject elevation requests.' });
    }
    try {
        if (!req.body.DecisionReason?.trim()) {
            return res.status(400).json({ error: 'Please provide a reason for rejection.' });
        }
        const pool = await getPool();
        const chk = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT Status FROM dms_CareOffElevationRequests WHERE RequestID = @id`);
        if (!chk.recordset.length) return res.status(404).json({ error: 'Request not found.' });
        if (chk.recordset[0].Status !== 'PENDING') return res.status(409).json({ error: `Request is ${chk.recordset[0].Status}, not pending.` });

        await pool.request()
            .input('id',       sql.Int,          parseInt(req.params.id))
            .input('by',       sql.Int,          req.user?.userId || null)
            .input('byName',   sql.NVarChar(100),req.user?.userName || null)
            .input('reason',   sql.NVarChar(500),req.body.DecisionReason)
            .query(`UPDATE dms_CareOffElevationRequests
                    SET    Status='REJECTED', DecidedBy=@by, DecidedByName=@byName,
                           DecidedAt=GETDATE(), DecisionReason=@reason
                    WHERE  RequestID = @id`);
        res.json({ message: 'Elevation rejected.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = {
    list:    exports.list,
    forJC:   exports.forJC,
    create:  exports.create,
    approve: exports.approve,
    reject:  exports.reject,
    getEffectiveCapForJC,   // used by workshopController.saveJobCard
};
