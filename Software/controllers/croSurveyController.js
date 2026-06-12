/**
 * CRO Surveys — HTTP layer.
 *
 *   Public (no auth — token-based):
 *     GET  /api/cro/surveys/public/:token         → survey + questions
 *     POST /api/cro/surveys/public/:token/respond → customer submits answers
 *
 *   Authenticated (cro_workspace / cro_admin):
 *     GET  /api/cro/surveys                       → list (filters: status, type, search)
 *     GET  /api/cro/surveys/:id                   → detail
 *     POST /api/cro/surveys/:id/capture           → CRO officer captures answers by phone
 *     POST /api/cro/surveys/:id/mark-sent         → mark Triggered → Sent (after WhatsApp/SMS dispatch)
 *     POST /api/cro/surveys/:id/cancel            → mark Cancelled
 */
const { sql, getPool } = require('../config/db');
const { recordResponse, createSurvey } = require('../services/croSurveyService');

// ---- Public ----

// GET /api/cro/surveys/public/:token
exports.publicGet = async (req, res) => {
    try {
        const token = req.params.token;
        const pool = await getPool();
        const r = await pool.request().input('t', sql.NVarChar(64), token).query(`
            SELECT s.SurveyID, s.SurveyType, s.Status, s.TokenExpiresAt, s.QuestionsJSON,
                   s.RespondedAt, s.JobCardID, j.JobCardNo, s.ComplaintID, c.ComplaintNo
            FROM dms_CRO_Surveys s
            LEFT JOIN Addata_JobCardInfo j ON s.JobCardID = j.JobCardId
            LEFT JOIN dms_CRO_Complaints  c ON s.ComplaintID = c.ComplaintID
            WHERE s.ResponseToken = @t
        `);
        if (!r.recordset.length) return res.status(404).json({ error: 'Survey not found.' });
        const s = r.recordset[0];
        if (s.TokenExpiresAt && new Date(s.TokenExpiresAt) < new Date()) {
            return res.status(410).json({ error: 'This survey link has expired.', status: 'Expired' });
        }
        if (s.Status === 'Responded') return res.status(409).json({ error: 'Already submitted. Thank you!', status: 'Responded' });
        if (s.Status === 'Cancelled') return res.status(410).json({ error: 'This survey has been cancelled.', status: 'Cancelled' });

        res.json({
            SurveyID: s.SurveyID,
            SurveyType: s.SurveyType,
            Status: s.Status,
            JobCardNo: s.JobCardNo,
            ComplaintNo: s.ComplaintNo,
            Questions: JSON.parse(s.QuestionsJSON || '[]'),
        });
    } catch (err) {
        console.error('Survey publicGet:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/surveys/public/:token/respond  { responses: [{id, answer}, ...] }
exports.publicRespond = async (req, res) => {
    try {
        const out = await recordResponse({ token: req.params.token, responses: req.body?.responses || [] });
        res.json({ message: 'Thank you for your feedback.', ...out });
    } catch (err) {
        const status =
            err.code === 'NOT_FOUND' ? 404 :
            err.code === 'EXPIRED' || err.code === 'CLOSED' ? 410 :
            err.code === 'ALREADY_RESPONDED' ? 409 :
            400;
        res.status(status).json({ error: err.message, code: err.code });
    }
};

// ---- Authenticated ----

// GET /api/cro/surveys/by-job-card/:jobCardId — returns latest PostJobCard survey for that JC, or null
exports.byJobCard = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('j', sql.Int, parseInt(req.params.jobCardId)).query(`
            SELECT TOP 1 s.*, j.JobCardNo
            FROM dms_CRO_Surveys s
            JOIN Addata_JobCardInfo j ON s.JobCardID = j.JobCardId
            WHERE s.JobCardID=@j AND s.SurveyType='PostJobCard'
            ORDER BY s.SurveyID DESC
        `);
        if (!r.recordset.length) return res.json({ found: false });
        res.json({ found: true, survey: r.recordset[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/surveys — manual create (admin/CRO officer for ad-hoc cases)
// body: { SurveyType, JobCardID?, ComplaintID?, ContactPhone?, TemplateID?, TtlDays? }
exports.create = async (req, res) => {
    try {
        const b = req.body || {};
        const out = await createSurvey({
            surveyType:        b.SurveyType,
            jobCardId:         b.JobCardID ? parseInt(b.JobCardID) : null,
            complaintId:       b.ComplaintID ? parseInt(b.ComplaintID) : null,
            contactPhone:      b.ContactPhone || null,
            customerProfileId: b.CustomerProfileID ? parseInt(b.CustomerProfileID) : null,
            templateId:        b.TemplateID ? parseInt(b.TemplateID) : null,
            ttlDays:           b.TtlDays ? parseInt(b.TtlDays) : undefined,
            idempotent:        false,
        });
        res.status(201).json({ message: 'Survey created', ...out });
    } catch (err) {
        if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
        console.error('Survey create:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/cro/surveys/:id — patch a survey row.
// Allowed fields: ContactPhone, TokenExpiresAt (any status); ResponsesJSON+OverallRating (Responded — for correcting captured answers)
exports.update = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_CRO_Surveys WHERE SurveyID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Survey not found' });
        const survey = cur.recordset[0];

        const r = pool.request().input('id', sql.Int, id);
        const sets = [];
        if (b.ContactPhone !== undefined) {
            r.input('phone', sql.NVarChar(50), b.ContactPhone || null);
            sets.push('ContactPhone=@phone');
        }
        if (b.TokenExpiresAt !== undefined) {
            r.input('exp', sql.DateTime, b.TokenExpiresAt ? new Date(b.TokenExpiresAt) : null);
            sets.push('TokenExpiresAt=@exp');
        }
        if (b.Responses !== undefined) {
            if (survey.Status !== 'Responded') {
                return res.status(409).json({ error: 'Can only edit responses on a Responded survey. Use /capture for non-responded.' });
            }
            if (!Array.isArray(b.Responses)) return res.status(400).json({ error: 'Responses must be an array.' });
            // Recompute OverallRating
            const questions = JSON.parse(survey.QuestionsJSON || '[]');
            const { computeOverallRating } = require('../services/croSurveyService');
            const rating = computeOverallRating(questions, b.Responses);
            r.input('rjson', sql.NVarChar(sql.MAX), JSON.stringify(b.Responses));
            r.input('rating', sql.Decimal(3, 2), rating);
            sets.push('ResponsesJSON=@rjson', 'OverallRating=@rating');
        }
        if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });

        await r.query(`UPDATE dms_CRO_Surveys SET ${sets.join(', ')} WHERE SurveyID=@id`);
        res.json({ message: 'Survey updated', SurveyID: id });
    } catch (err) {
        console.error('Survey update:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/cro/surveys/:id — hard delete (cro_admin only).
// Soft-cancel is via POST /:id/cancel; this is the "really remove it" path.
exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_CRO_Surveys OUTPUT DELETED.SurveyID WHERE SurveyID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Survey not found' });
        res.json({ message: 'Survey deleted', SurveyID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/surveys?status=&type=&search=
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status) { r.input('s', sql.NVarChar(20), req.query.status); conds.push('s.Status=@s'); }
        if (req.query.type)   { r.input('t', sql.NVarChar(30), req.query.type);   conds.push('s.SurveyType=@t'); }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push(`(j.JobCardNo LIKE @q OR c.ComplaintNo LIKE @q OR s.ContactPhone LIKE @q)`);
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const result = await r.query(`
            SELECT s.SurveyID, s.SurveyType, s.Status, s.TriggeredAt, s.SentAt, s.RespondedAt,
                   s.OverallRating, s.ContactPhone, s.SentVia,
                   s.JobCardID, j.JobCardNo, j.ServiceAdvisorID, sa.EmployeeName AS ServiceAdvisorName,
                   s.ComplaintID, c.ComplaintNo
            FROM dms_CRO_Surveys s
            LEFT JOIN Addata_JobCardInfo j ON s.JobCardID = j.JobCardId
            LEFT JOIN gen_EmployeeInfo sa ON j.ServiceAdvisorID = sa.EmployeeID
            LEFT JOIN dms_CRO_Complaints c ON s.ComplaintID = c.ComplaintID
            ${where}
            ORDER BY s.TriggeredAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Survey list:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/surveys/:id
exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id)).query(`
            SELECT s.*, j.JobCardNo, c.ComplaintNo,
                   sa.EmployeeName AS ServiceAdvisorName, sa.EmployeeID AS ServiceAdvisorID,
                   cap.EmployeeName AS CapturedByName
            FROM dms_CRO_Surveys s
            LEFT JOIN Addata_JobCardInfo j ON s.JobCardID = j.JobCardId
            LEFT JOIN dms_CRO_Complaints c ON s.ComplaintID = c.ComplaintID
            LEFT JOIN gen_EmployeeInfo sa  ON j.ServiceAdvisorID = sa.EmployeeID
            LEFT JOIN gen_EmployeeInfo cap ON s.CapturedByEmployeeID = cap.EmployeeID
            WHERE s.SurveyID=@id
        `);
        if (!r.recordset.length) return res.status(404).json({ error: 'Survey not found' });
        res.json(r.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/surveys/:id/capture { responses: [{id, answer}, ...] }
exports.capture = async (req, res) => {
    try {
        const empId = req.user?.employeeId;
        if (!empId) return res.status(400).json({ error: 'CRO officer must have a linked employee record.' });

        const out = await recordResponse({
            surveyId: parseInt(req.params.id),
            responses: req.body?.responses || [],
            capturedByEmployeeId: empId,
        });
        res.json({ message: 'Captured.', ...out });
    } catch (err) {
        const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'ALREADY_RESPONDED' ? 409 : 400;
        res.status(status).json({ error: err.message, code: err.code });
    }
};

// POST /api/cro/surveys/:id/mark-sent — admin records that the link was dispatched
exports.markSent = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const via = req.body?.SentVia || 'Manual';
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('via', sql.NVarChar(20), via)
            .query(`UPDATE dms_CRO_Surveys
                    SET Status='Sent', SentAt=COALESCE(SentAt, GETDATE()), SentVia=@via
                    OUTPUT INSERTED.SurveyID
                    WHERE SurveyID=@id AND Status='Triggered'`);
        if (!r.recordset.length) return res.status(409).json({ error: 'Survey is not in Triggered status.' });
        res.json({ message: 'Marked Sent.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/surveys/:id/cancel
exports.cancel = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        await pool.request().input('id', sql.Int, id)
            .query(`UPDATE dms_CRO_Surveys SET Status='Cancelled' WHERE SurveyID=@id AND Status NOT IN ('Responded','Cancelled')`);
        res.json({ message: 'Cancelled.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
