/**
 * CRD (Customer Relation Department) — follow-up queue controller.
 *
 * Source: post-§14.22 — CRD MVP.
 *
 * Auto-created per JC finalize via crdFollowUpService. CRD staff work the queue,
 * log outcomes, and free-text notes. No GL impact.
 */
const { sql, getPool } = require('../config/db');
const { createComplaint, VALID_SEVERITIES } = require('../services/croComplaintService');

const VALID_STATUSES = new Set(['Pending', 'Contacted', 'Closed', 'NoResponse']);
const VALID_OUTCOMES = new Set(['Satisfied', 'Complaint', 'NeedsAttention', 'NoAnswer']);

// GET /api/crd/follow-ups?status=&assignedTo=&dueBy=&search=
exports.list = async (req, res) => {
    try {
        const { status, assignedTo, dueBy, search } = req.query;
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (status)     { r.input('s',   sql.NVarChar(20), status);     conds.push('f.Status = @s'); }
        if (assignedTo) { r.input('a',   sql.Int,          parseInt(assignedTo)); conds.push('f.AssignedTo = @a'); }
        if (dueBy)      { r.input('due', sql.Date,         new Date(dueBy)); conds.push('f.DueDate <= @due'); }
        if (search) {
            r.input('q', sql.NVarChar(200), `%${search}%`);
            conds.push('(f.CustomerName LIKE @q OR f.PhoneOne LIKE @q OR f.VehicleRegNo LIKE @q OR j.JobCardNo LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const result = await r.query(`
            SELECT f.FollowUpID, f.JobCardID, j.JobCardNo, j.Status AS PaymentType,
                   f.CustomerName, f.PhoneOne, f.VehicleRegNo,
                   f.PartyID, p.PartyName,
                   f.DueDate, f.Status, f.Outcome, f.Notes,
                   f.AssignedTo, f.AssignedToName,
                   f.ContactedBy, f.ContactedByName, f.ContactedAt,
                   f.CreatedAt, f.UpdatedAt,
                   f.LinkedComplaintID, lc.ComplaintNo AS LinkedComplaintNo,
                   DATEDIFF(day, f.DueDate, CAST(GETDATE() AS DATE)) AS DaysOverdue
            FROM dms_CRDFollowUps f
            LEFT JOIN Addata_JobCardInfo j ON f.JobCardID = j.JobCardId
            LEFT JOIN gen_PartiesInfo p    ON f.PartyID = p.PartyID
            LEFT JOIN dms_CRO_Complaints lc ON f.LinkedComplaintID = lc.ComplaintID
            ${where}
            ORDER BY
                CASE f.Status WHEN 'Pending' THEN 0 WHEN 'NoResponse' THEN 1 WHEN 'Contacted' THEN 2 ELSE 3 END,
                f.DueDate ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('CRD list:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/crd/follow-ups/stats — counts for the dashboard cards
exports.stats = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT
                SUM(CASE WHEN Status='Pending'    AND DueDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS Overdue,
                SUM(CASE WHEN Status='Pending'    AND DueDate = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS DueToday,
                SUM(CASE WHEN Status='Pending'    AND DueDate > CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS Upcoming,
                SUM(CASE WHEN Status='NoResponse'  THEN 1 ELSE 0 END) AS NoResponse,
                SUM(CASE WHEN Status='Contacted'   THEN 1 ELSE 0 END) AS Contacted,
                SUM(CASE WHEN Status='Closed'      THEN 1 ELSE 0 END) AS Closed
            FROM dms_CRDFollowUps
        `);
        res.json(r.recordset[0] || {});
    } catch (err) {
        console.error('CRD stats:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/crd/follow-ups/:id
exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`
                SELECT f.*, j.JobCardNo, j.JobCardDate, j.Status AS PaymentType, j.Remarks AS JobRemarks,
                       p.PartyName,
                       lc.ComplaintNo AS LinkedComplaintNo
                FROM dms_CRDFollowUps f
                LEFT JOIN Addata_JobCardInfo j ON f.JobCardID = j.JobCardId
                LEFT JOIN gen_PartiesInfo p    ON f.PartyID = p.PartyID
                LEFT JOIN dms_CRO_Complaints lc ON f.LinkedComplaintID = lc.ComplaintID
                WHERE f.FollowUpID = @id
            `);
        if (!r.recordset.length) return res.status(404).json({ error: 'Follow-up not found' });
        res.json(r.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/crd/follow-ups/:id — log a contact / change status / add notes.
// When Outcome='Complaint', a CRO complaint is auto-created and linked.
// Required extras in that case: Complaint.Subject, Complaint.Severity, Complaint.ComplaintType.
exports.update = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const {
            Status, Outcome, Notes, AssignedTo, AssignedToName, MarkContacted,
            Complaint, // optional payload: { Subject, ComplaintType, Severity, Description }
        } = req.body;

        if (Status && !VALID_STATUSES.has(Status)) {
            return res.status(400).json({ error: `Invalid Status. Expected: ${[...VALID_STATUSES].join(', ')}` });
        }
        if (Outcome && !VALID_OUTCOMES.has(Outcome)) {
            return res.status(400).json({ error: `Invalid Outcome. Expected: ${[...VALID_OUTCOMES].join(', ')}` });
        }

        // Pre-validate complaint payload (do it before opening a tx so we fail fast)
        const wantComplaint = Outcome === 'Complaint';
        if (wantComplaint) {
            if (!Complaint || typeof Complaint !== 'object') {
                return res.status(400).json({ error: 'Outcome=Complaint requires a Complaint payload (Subject, ComplaintType, Severity).' });
            }
            if (!Complaint.Subject?.trim()) return res.status(400).json({ error: 'Complaint.Subject is required.' });
            if (!['Product', 'Service'].includes(Complaint.ComplaintType)) {
                return res.status(400).json({ error: 'Complaint.ComplaintType must be Product or Service.' });
            }
            if (Complaint.Severity && !VALID_SEVERITIES.has(Complaint.Severity)) {
                return res.status(400).json({ error: 'Invalid Complaint.Severity.' });
            }
        }

        const pool = await getPool();

        // Fetch the follow-up row so we have JC/customer context to seed the complaint
        let fuRow = null;
        if (wantComplaint) {
            const r0 = await pool.request().input('id', sql.Int, id)
                .query(`SELECT FollowUpID, JobCardID, CustomerName, PhoneOne, LinkedComplaintID
                        FROM dms_CRDFollowUps WHERE FollowUpID=@id`);
            if (!r0.recordset.length) return res.status(404).json({ error: 'Follow-up not found' });
            fuRow = r0.recordset[0];
            if (fuRow.LinkedComplaintID) {
                return res.status(409).json({
                    error: `This follow-up is already linked to complaint #${fuRow.LinkedComplaintID}.`,
                    LinkedComplaintID: fuRow.LinkedComplaintID,
                });
            }
            if (!fuRow.JobCardID) {
                return res.status(409).json({ error: 'Follow-up has no JobCardID — cannot create a CRO complaint.' });
            }
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // 1. Update the follow-up row first
            const r = new sql.Request(tx)
                .input('id',             sql.Int,           id)
                .input('status',         sql.NVarChar(20),  Status || null)
                .input('outcome',        sql.NVarChar(20),  Outcome || null)
                .input('notes',          sql.NVarChar(sql.MAX), Notes ?? null)
                .input('assignedTo',     sql.Int,           AssignedTo ? parseInt(AssignedTo) : null)
                .input('assignedToName', sql.NVarChar(100), AssignedToName || null)
                .input('userId',         sql.Int,           req.user?.userId || null)
                .input('userName',       sql.NVarChar(100), req.user?.userName || null);

            const sets = [
                `UpdatedAt = GETDATE()`,
                `UpdatedBy = @userId`,
                `UpdatedByName = @userName`
            ];
            if (Status !== undefined)         sets.push('Status = @status');
            if (Outcome !== undefined)        sets.push('Outcome = @outcome');
            if (Notes !== undefined)          sets.push('Notes = @notes');
            if (AssignedTo !== undefined)     sets.push('AssignedTo = @assignedTo');
            if (AssignedToName !== undefined) sets.push('AssignedToName = @assignedToName');
            if (MarkContacted || wantComplaint) {
                sets.push(`ContactedBy = @userId`);
                sets.push(`ContactedByName = @userName`);
                sets.push(`ContactedAt = GETDATE()`);
                if (Status === undefined) sets.push(`Status = 'Contacted'`);
            }

            const result = await r.query(`
                UPDATE dms_CRDFollowUps SET ${sets.join(', ')}
                OUTPUT INSERTED.FollowUpID
                WHERE FollowUpID = @id
            `);
            if (!result.recordset.length) {
                await tx.rollback();
                return res.status(404).json({ error: 'Follow-up not found' });
            }

            // 2. If Outcome=Complaint, create the CRO complaint inside the SAME tx and link it back
            let linkedComplaint = null;
            if (wantComplaint) {
                linkedComplaint = await createComplaint({
                    JobCardID:     fuRow.JobCardID,
                    ComplaintType: Complaint.ComplaintType,
                    Source:        'CRO_OutboundCall',
                    Subject:       Complaint.Subject.trim(),
                    Description:   (Complaint.Description?.trim()) || Notes || null,
                    ContactName:   fuRow.CustomerName,
                    ContactPhone:  fuRow.PhoneOne || 'unknown',
                    Severity:      Complaint.Severity || 'Normal',
                }, req.user, tx);

                await new sql.Request(tx)
                    .input('fid', sql.Int, id)
                    .input('cid', sql.Int, linkedComplaint.ComplaintID)
                    .query(`UPDATE dms_CRDFollowUps SET LinkedComplaintID=@cid WHERE FollowUpID=@fid`);
            }

            await tx.commit();
            res.json({
                message: 'Follow-up updated' + (linkedComplaint ? ` and complaint ${linkedComplaint.ComplaintNo} created` : ''),
                FollowUpID: id,
                ...(linkedComplaint ? { LinkedComplaintID: linkedComplaint.ComplaintID, LinkedComplaintNo: linkedComplaint.ComplaintNo } : {}),
            });
        } catch (err) {
            try { await tx.rollback(); } catch {}
            if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
            throw err;
        }
    } catch (err) {
        console.error('CRD update:', err);
        res.status(500).json({ error: err.message });
    }
};
