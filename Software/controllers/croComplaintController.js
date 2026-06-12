/**
 * CRO Complaint controller — Phase 2.
 *
 * Source contract: .claude/planning/cro-module-design.md §7 (lifecycle), §8 (workflow), §9 (escalation).
 *
 * Status state machine:
 *   New → Assigned (auto on create)
 *   Assigned → InProgress (responder accepts/starts)
 *   InProgress → PendingCROVerify (responder posts Resolved; gated on ≥1 screenshot OR override)
 *   PendingCROVerify → Closed                            (verdict = Satisfied)
 *   PendingCROVerify → ReOpened → Assigned, escalation forced to L2 (verdict = NotSatisfied, decision #5)
 *   PendingCROVerify → stays (verdict = NoResponse, retry policy: 3 × 24h then auto-close)
 *
 * Every transition writes a dms_CRO_ComplaintActions row.
 */
const { sql, getPool } = require('../config/db');
const {
    createComplaint,
    writeAction,
    generateComplaintNo,
    resolveInitialAssignment,
    VALID_TYPES,
    VALID_SOURCES,
    VALID_SEVERITIES,
} = require('../services/croComplaintService');

const VALID_STATUSES = new Set(['New', 'Assigned', 'InProgress', 'PendingCROVerify', 'Closed', 'ReOpened']);
const VALID_VERDICTS = new Set(['Satisfied', 'NotSatisfied', 'NoResponse']);

// ---- Helpers ---------------------------------------------------------------

// Helpers live in services/croComplaintService.js (shared with crdController bridge).

// ---- Public endpoints ------------------------------------------------------

// GET /api/cro/complaints — list with optional filters
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status) {
            r.input('s', sql.NVarChar(20), req.query.status);
            conds.push('c.Status = @s');
        }
        if (req.query.assignedToMe && req.user?.employeeId) {
            r.input('me', sql.Int, req.user.employeeId);
            conds.push('c.AssignedEmployeeID = @me');
        }
        if (req.query.assignedEmployeeId) {
            r.input('emp', sql.Int, parseInt(req.query.assignedEmployeeId));
            conds.push('c.AssignedEmployeeID = @emp');
        }
        if (req.query.deptId) {
            r.input('dpt', sql.Int, parseInt(req.query.deptId));
            conds.push('c.AssignedDepartmentID = @dpt');
        }
        if (req.query.partyId) {
            r.input('pty', sql.Int, parseInt(req.query.partyId));
            conds.push('c.PartyID = @pty');
        }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push(`(c.ComplaintNo LIKE @q OR c.Subject LIKE @q OR c.ContactName LIKE @q OR c.ContactPhone LIKE @q)`);
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const result = await r.query(`
            SELECT c.ComplaintID, c.ComplaintNo, c.ComplaintType, c.Source, c.Subject,
                   c.JobCardID, j.JobCardNo, jt.CardCode AS BusinessType, jt.Title AS BusinessTypeTitle,
                   c.CustomerProfileID, c.PartyID, p.PartyName,
                   c.ContactName, c.ContactPhone,
                   c.AssignedDepartmentID, d.DepartmentName AS AssignedDepartment,
                   c.AssignedEmployeeID, e.EmployeeName AS AssignedEmployee,
                   c.CurrentEscalationLevel, c.Status, c.Severity,
                   c.OpenedAt, c.ClosedAt,
                   DATEDIFF(hour, c.OpenedAt, ISNULL(c.ClosedAt, GETDATE())) AS AgeHours
            FROM dms_CRO_Complaints c
            LEFT JOIN Addata_JobCardInfo j ON c.JobCardID = j.JobCardId
            LEFT JOIN gen_JobCardType jt ON j.JobTypeId = jt.JobCardTypeId
            LEFT JOIN gen_PartiesInfo p ON c.PartyID = p.PartyID
            LEFT JOIN gen_DepartmentInfo d ON c.AssignedDepartmentID = d.DepartmentID
            LEFT JOIN gen_EmployeeInfo e ON c.AssignedEmployeeID = e.EmployeeID
            ${where}
            ORDER BY
                CASE c.Status
                    WHEN 'Assigned' THEN 0
                    WHEN 'InProgress' THEN 1
                    WHEN 'PendingCROVerify' THEN 2
                    WHEN 'ReOpened' THEN 3
                    WHEN 'New' THEN 4
                    ELSE 5
                END,
                c.CurrentEscalationLevel DESC,
                c.OpenedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('CRO complaint list:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/complaints/stats — KPI counts for the workspace dashboard
exports.stats = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT
                SUM(CASE WHEN Status IN ('New','Assigned','InProgress') THEN 1 ELSE 0 END) AS OpenCount,
                SUM(CASE WHEN Status = 'PendingCROVerify' THEN 1 ELSE 0 END) AS PendingVerifyCount,
                SUM(CASE WHEN Status = 'Closed' THEN 1 ELSE 0 END) AS ClosedCount,
                SUM(CASE WHEN Status = 'ReOpened' THEN 1 ELSE 0 END) AS ReOpenedCount,
                SUM(CASE WHEN CurrentEscalationLevel >= 1 AND Status NOT IN ('Closed') THEN 1 ELSE 0 END) AS EscalatedCount,
                SUM(CASE WHEN Severity = 'Critical' AND Status NOT IN ('Closed') THEN 1 ELSE 0 END) AS CriticalCount
            FROM dms_CRO_Complaints
        `);
        res.json(r.recordset[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/complaints/:id — full detail (header + actions + attachments)
exports.get = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();

        const hdr = await pool.request()
            .input('id', sql.Int, id)
            .query(`
                SELECT c.*,
                       j.JobCardNo, j.JobCardDate, j.VehicleRegNo, j.ChasisNo AS JC_Chasis, j.EngineNo AS JC_Engine,
                       jt.CardCode AS BusinessType, jt.Title AS BusinessTypeTitle,
                       jt.ManagerEmployeeID AS BUManagerEmpID,
                       buMgr.EmployeeName AS BUManagerName,
                       sa.EmployeeName AS ServiceAdvisorName,
                       p.PartyName, p.PhoneOne AS PartyPhone,
                       cust.endUserName, cust.PhoneNo AS CustomerPhoneOnFile,
                       d.DepartmentName AS AssignedDepartmentName,
                       e.EmployeeName AS AssignedEmployeeName,
                       (SELECT COUNT(*) FROM dms_CRO_Attachments a
                        WHERE a.ComplaintID = c.ComplaintID
                          AND a.AttachmentType = 'WhatsAppScreenshot'
                          AND a.DeletedAt IS NULL) AS WhatsAppScreenshotCount
                FROM dms_CRO_Complaints c
                LEFT JOIN Addata_JobCardInfo j ON c.JobCardID = j.JobCardId
                LEFT JOIN gen_JobCardType jt ON j.JobTypeId = jt.JobCardTypeId
                LEFT JOIN gen_EmployeeInfo buMgr ON jt.ManagerEmployeeID = buMgr.EmployeeID
                LEFT JOIN gen_EmployeeInfo sa ON j.ServiceAdvisorID = sa.EmployeeID
                LEFT JOIN gen_PartiesInfo p ON c.PartyID = p.PartyID
                LEFT JOIN addata_CustomerInfo cust ON c.CustomerProfileID = cust.ProfileID
                LEFT JOIN gen_DepartmentInfo d ON c.AssignedDepartmentID = d.DepartmentID
                LEFT JOIN gen_EmployeeInfo e ON c.AssignedEmployeeID = e.EmployeeID
                WHERE c.ComplaintID = @id
            `);
        if (!hdr.recordset.length) return res.status(404).json({ error: 'Complaint not found' });

        const actions = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT * FROM dms_CRO_ComplaintActions
                    WHERE ComplaintID = @id
                    ORDER BY PerformedAt ASC, ActionID ASC`);

        const attachments = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT AttachmentID, AttachmentType, FilePath, OriginalFileName, MimeType, SizeBytes,
                           UploadedByEmployeeID, UploadedByName, UploadedAt, Description
                    FROM dms_CRO_Attachments
                    WHERE ComplaintID = @id AND DeletedAt IS NULL
                    ORDER BY UploadedAt DESC`);

        res.json({
            ...hdr.recordset[0],
            actions: actions.recordset,
            attachments: attachments.recordset,
        });
    } catch (err) {
        console.error('CRO complaint get:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/customers/:profileId/jobcards — recent finalized JCs for picker
exports.getRecentJobCardsForCustomer = async (req, res) => {
    try {
        const profileId = parseInt(req.params.profileId);
        const pool = await getPool();
        const r = await pool.request()
            .input('p', sql.Int, profileId)
            .query(`SELECT TOP 20 j.JobCardId, j.JobCardNo, j.JobCardDate, j.VehicleRegNo,
                           jt.CardCode AS BusinessType, jt.Title AS BusinessTypeTitle,
                           j.JobStatus, j.IsFinalized, j.ServiceAdvisor
                    FROM Addata_JobCardInfo j
                    LEFT JOIN gen_JobCardType jt ON j.JobTypeId = jt.JobCardTypeId
                    WHERE j.EndUserID = @p
                    ORDER BY j.JobCardDate DESC`);
        res.json(r.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/complaints — create new complaint (always linked to JC, decision #1)
exports.create = async (req, res) => {
    try {
        const out = await createComplaint(req.body, req.user);
        res.status(201).json({ message: 'Complaint created', ...out });
    } catch (err) {
        if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
        console.error('CRO complaint create:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/complaints/:id/actions — generic Note / status comment
exports.addAction = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { Notes, ActionType } = req.body || {};
        const type = ActionType || 'Note';
        if (!Notes?.trim()) return res.status(400).json({ error: 'Notes are required.' });

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await writeAction(transaction, id, type, {
                employeeId: req.user?.userId,
                employeeName: req.user?.userName,
                notes: Notes.trim(),
            });
            // If a Note arrives while complaint is 'Assigned', flip to 'InProgress' (responder picked it up)
            if (type === 'Note') {
                await new sql.Request(transaction)
                    .input('id', sql.Int, id)
                    .input('uby', sql.Int, req.user?.userId || null)
                    .query(`UPDATE dms_CRO_Complaints
                            SET Status='InProgress', UpdatedAt=GETDATE(), UpdatedBy=@uby
                            WHERE ComplaintID=@id AND Status='Assigned'`);
            }
            await transaction.commit();
            res.json({ message: 'Action recorded' });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) {
        console.error('CRO addAction:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/cro/complaints/:id/resolve — responder marks complaint resolved
// Gate: must have ≥1 WhatsApp screenshot, OR a WhatsAppProofOverride action on file.
exports.markResolved = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { Notes } = req.body || {};
        const pool = await getPool();

        // Status precheck
        const status = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT Status FROM dms_CRO_Complaints WHERE ComplaintID=@id`);
        if (!status.recordset.length) return res.status(404).json({ error: 'Complaint not found' });
        const s = status.recordset[0].Status;
        if (!['Assigned', 'InProgress'].includes(s)) {
            return res.status(409).json({ error: `Cannot resolve from status "${s}".` });
        }

        // Proof gate (§11): need ≥1 screenshot OR a WhatsAppProofOverride action
        const proof = await pool.request().input('id', sql.Int, id).query(`
            SELECT
              (SELECT COUNT(*) FROM dms_CRO_Attachments
               WHERE ComplaintID=@id AND AttachmentType='WhatsAppScreenshot' AND DeletedAt IS NULL) AS Screenshots,
              (SELECT COUNT(*) FROM dms_CRO_ComplaintActions
               WHERE ComplaintID=@id AND ActionType='WhatsAppProofOverride') AS Overrides
        `);
        const { Screenshots, Overrides } = proof.recordset[0];
        if (Screenshots === 0 && Overrides === 0) {
            return res.status(409).json({
                error: 'Cannot mark resolved without proof. Upload a WhatsApp screenshot OR have CRO Manager grant an override.'
            });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await new sql.Request(transaction)
                .input('id', sql.Int, id)
                .input('uby', sql.Int, req.user?.userId || null)
                .query(`UPDATE dms_CRO_Complaints
                        SET Status='PendingCROVerify', UpdatedAt=GETDATE(), UpdatedBy=@uby
                        WHERE ComplaintID=@id`);
            await writeAction(transaction, id, 'Resolved', {
                employeeId: req.user?.userId,
                employeeName: req.user?.userName,
                notes: Notes || 'Resolution posted; awaiting CRO verification.',
            });
            await transaction.commit();
            res.json({ message: 'Marked Resolved — pending CRO verification.' });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) {
        console.error('CRO markResolved:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/cro/complaints/:id/whatsapp-override — CRO Manager grants offline-customer override
exports.whatsAppOverride = async (req, res) => {
    try {
        if (!req.user?.modules?.includes('cro_admin')) {
            return res.status(403).json({ error: 'CRO Manager (cro_admin) only.' });
        }
        const id = parseInt(req.params.id);
        const { Reason } = req.body || {};
        if (!Reason?.trim()) return res.status(400).json({ error: 'Reason is required.' });

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await writeAction(transaction, id, 'WhatsAppProofOverride', {
                employeeId: req.user?.userId,
                employeeName: req.user?.userName,
                notes: `OVERRIDE: ${Reason.trim()}`,
            });
            await transaction.commit();
            res.json({ message: 'WhatsApp-proof override granted.' });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// POST /api/cro/complaints/:id/verdict — CRO records customer verdict
exports.recordVerdict = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { Verdict, Notes } = req.body || {};
        if (!VALID_VERDICTS.has(Verdict)) return res.status(400).json({ error: `Verdict must be one of ${[...VALID_VERDICTS].join(',')}` });

        const pool = await getPool();
        const status = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT Status, CurrentEscalationLevel FROM dms_CRO_Complaints WHERE ComplaintID=@id`);
        if (!status.recordset.length) return res.status(404).json({ error: 'Complaint not found' });
        if (status.recordset[0].Status !== 'PendingCROVerify') {
            return res.status(409).json({ error: `Cannot record verdict — current status is "${status.recordset[0].Status}".` });
        }
        const levelBefore = status.recordset[0].CurrentEscalationLevel;

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await writeAction(transaction, id, 'CustomerVerdict', {
                employeeId: req.user?.userId,
                employeeName: req.user?.userName,
                notes: Notes || `Verdict: ${Verdict}`,
                customerVerdict: Verdict,
                escalationLevelBefore: levelBefore,
            });

            let newStatus, newLevel = levelBefore;
            if (Verdict === 'Satisfied') {
                newStatus = 'Closed';
            } else if (Verdict === 'NotSatisfied') {
                // Decision #5: force L2 (Executive). Chain is 0/1/2; L2 = max.
                newStatus = 'Assigned';
                newLevel = 2;
                await writeAction(transaction, id, 'ReOpened', {
                    employeeId: req.user?.userId,
                    employeeName: req.user?.userName,
                    notes: 'Customer rejected resolution — escalated to L2.',
                    escalationLevelBefore: levelBefore,
                    escalationLevelAfter: 2,
                });
                await writeAction(transaction, id, 'Escalated', {
                    employeeId: req.user?.userId,
                    employeeName: req.user?.userName,
                    notes: 'Forced L2 escalation per NotSatisfied kickback rule (decision #5).',
                    escalationLevelBefore: levelBefore,
                    escalationLevelAfter: 2,
                });
            } else {
                // NoResponse: stay in PendingCROVerify; auto-close handled by cron
                newStatus = 'PendingCROVerify';
            }

            await new sql.Request(transaction)
                .input('id', sql.Int, id)
                .input('s',  sql.NVarChar(20), newStatus)
                .input('lvl', sql.TinyInt, newLevel)
                .input('closedAt', sql.DateTime, newStatus === 'Closed' ? new Date() : null)
                .input('uby', sql.Int, req.user?.userId || null)
                .query(`UPDATE dms_CRO_Complaints
                        SET Status=@s, CurrentEscalationLevel=@lvl,
                            LastEscalationAt=CASE WHEN @lvl > CurrentEscalationLevel THEN GETDATE() ELSE LastEscalationAt END,
                            ClosedAt=@closedAt, UpdatedAt=GETDATE(), UpdatedBy=@uby
                        WHERE ComplaintID=@id`);

            if (newStatus === 'Closed') {
                await writeAction(transaction, id, 'Closed', {
                    employeeId: req.user?.userId,
                    employeeName: req.user?.userName,
                    notes: 'Complaint closed — customer satisfied.',
                });
            }

            await transaction.commit();

            // Post-commit, best-effort: fire PostComplaint survey on close.
            // A failure here must NOT affect the verdict response.
            if (newStatus === 'Closed') {
                require('../services/croSurveyService').triggerPostComplaint(id)
                    .catch(e => console.error('[Survey] triggerPostComplaint post-close failed:', e.message));
            }

            res.json({ message: 'Verdict recorded', newStatus, escalationLevel: newLevel });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) {
        console.error('CRO recordVerdict:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/cro/complaints/:id/escalate — manual escalation (CRO admin)
exports.manualEscalate = async (req, res) => {
    try {
        if (!req.user?.modules?.includes('cro_admin')) {
            return res.status(403).json({ error: 'CRO Manager (cro_admin) only.' });
        }
        const id = parseInt(req.params.id);
        const { TargetLevel, Reason } = req.body || {};
        const targetLevel = parseInt(TargetLevel);
        if (!(targetLevel >= 1 && targetLevel <= 2)) return res.status(400).json({ error: 'TargetLevel must be 1 or 2.' });
        if (!Reason?.trim()) return res.status(400).json({ error: 'Reason is required.' });

        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT CurrentEscalationLevel FROM dms_CRO_Complaints WHERE ComplaintID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Complaint not found' });
        const levelBefore = cur.recordset[0].CurrentEscalationLevel;
        if (targetLevel <= levelBefore) return res.status(409).json({ error: `Already at level ${levelBefore}; cannot manually go ≤.` });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await writeAction(tx, id, 'Escalated', {
                employeeId: req.user?.userId,
                employeeName: req.user?.userName,
                notes: `MANUAL: ${Reason.trim()}`,
                escalationLevelBefore: levelBefore,
                escalationLevelAfter: targetLevel,
            });
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('lvl', sql.TinyInt, targetLevel)
                .input('uby', sql.Int, req.user?.userId || null)
                .query(`UPDATE dms_CRO_Complaints
                        SET CurrentEscalationLevel=@lvl, LastEscalationAt=GETDATE(),
                            UpdatedAt=GETDATE(), UpdatedBy=@uby
                        WHERE ComplaintID=@id`);
            await tx.commit();
            res.json({ message: `Escalated to L${targetLevel}.` });
        } catch (err) { await tx.rollback(); throw err; }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// POST /api/cro/complaints/:id/reassign — change AssignedEmployeeID
exports.reassign = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { AssignedEmployeeID, Reason } = req.body || {};
        if (!AssignedEmployeeID) return res.status(400).json({ error: 'AssignedEmployeeID is required.' });

        const pool = await getPool();
        const empRow = await pool.request().input('e', sql.Int, parseInt(AssignedEmployeeID))
            .query(`SELECT EmployeeName, DepartmentID FROM gen_EmployeeInfo WHERE EmployeeID=@e AND IsActive=1`);
        if (!empRow.recordset.length) return res.status(404).json({ error: 'Target employee not active.' });

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('id', sql.Int, id)
                .input('emp', sql.Int, parseInt(AssignedEmployeeID))
                .input('dpt', sql.Int, empRow.recordset[0].DepartmentID || null)
                .input('uby', sql.Int, req.user?.userId || null)
                .query(`UPDATE dms_CRO_Complaints
                        SET AssignedEmployeeID=@emp, AssignedDepartmentID=@dpt,
                            UpdatedAt=GETDATE(), UpdatedBy=@uby
                        WHERE ComplaintID=@id`);
            await writeAction(tx, id, 'Reassigned', {
                employeeId: req.user?.userId,
                employeeName: req.user?.userName,
                notes: `Reassigned to ${empRow.recordset[0].EmployeeName}${Reason ? ` — ${Reason}` : ''}.`,
            });
            await tx.commit();
            res.json({ message: 'Reassigned.' });
        } catch (err) { await tx.rollback(); throw err; }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
