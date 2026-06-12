/**
 * CRO Surveys — trigger + response service.
 *
 * Two triggers (cro-module-design.md §12):
 *   - PostJobCard:   fired when a JC is finalized
 *   - PostComplaint: fired when a complaint is Closed
 *
 * Lifecycle:  Triggered → Sent → Responded   (or Expired after 30d / Cancelled on STOP)
 *
 * Tokens: 32-char URL-safe random slug, 30-day expiry, single-use.
 *
 * Best-effort: a survey trigger failure MUST NOT roll back the JC finalize or
 * complaint close that produced it. Callers should pass-through errors as
 * warnings only.
 */
const crypto = require('crypto');
const { sql, getPool } = require('../config/db');

const TOKEN_BYTES   = 24;          // 24 bytes → 32 chars base64url
const TOKEN_TTL_DAYS = 30;

function makeToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Look up the active template for a survey type.
 * Returns { TemplateID, QuestionsJSON } or null.
 */
async function getActiveTemplate(executor, surveyType) {
    const r = await executor.request()
        .input('t', sql.NVarChar(30), surveyType)
        .query(`SELECT TOP 1 TemplateID, QuestionsJSON
                FROM dms_CRO_SurveyTemplates
                WHERE SurveyType=@t AND IsActive=1
                ORDER BY Version DESC`);
    return r.recordset[0] || null;
}

/**
 * Core survey row creator. Used by:
 *   - triggerPostJobCard / triggerPostComplaint  (auto-trigger on finalize / close)
 *   - controller POST /api/cro/surveys           (manual create from the UI)
 *
 * input: {
 *   surveyType: 'PostJobCard'|'PostComplaint',
 *   jobCardId?: int,
 *   complaintId?: int,
 *   contactPhone?: string,            // optional override (else snapshotted from JC/complaint)
 *   customerProfileId?: int,          // optional override
 *   templateId?: int,                 // optional — defaults to active template for surveyType
 *   idempotent?: boolean,             // when true, skips if a row already exists for the same (type, jcId|cid)
 *   ttlDays?: number,                 // override token expiry (default 30)
 * }
 *
 * Returns { SurveyID, ResponseToken, SurveyType } on success,
 *         { skipped: true, reason, SurveyID } on idempotent skip,
 *         throws on hard error.
 */
async function createSurvey(input) {
    const { surveyType, jobCardId, complaintId, idempotent = false } = input || {};
    if (!['PostJobCard', 'PostComplaint'].includes(surveyType)) {
        const e = new Error(`Invalid surveyType: ${surveyType}`); e.code = 'VALIDATION'; throw e;
    }
    if (!jobCardId && !complaintId) {
        const e = new Error('JobCardID or ComplaintID is required.'); e.code = 'VALIDATION'; throw e;
    }
    if (surveyType === 'PostJobCard'   && !jobCardId)   { const e = new Error('PostJobCard requires JobCardID.');   e.code='VALIDATION'; throw e; }
    if (surveyType === 'PostComplaint' && !complaintId) { const e = new Error('PostComplaint requires ComplaintID.'); e.code='VALIDATION'; throw e; }

    const pool = await getPool();

    if (idempotent) {
        const dupQ = surveyType === 'PostJobCard'
            ? `SELECT TOP 1 SurveyID FROM dms_CRO_Surveys WHERE JobCardID=@k AND SurveyType='PostJobCard'`
            : `SELECT TOP 1 SurveyID FROM dms_CRO_Surveys WHERE ComplaintID=@k AND SurveyType='PostComplaint'`;
        const dup = await pool.request().input('k', sql.Int, jobCardId || complaintId).query(dupQ);
        if (dup.recordset.length) return { skipped: true, reason: 'already-triggered', SurveyID: dup.recordset[0].SurveyID };
    }

    // Resolve template
    let tplId = input.templateId;
    let tplJson = null;
    if (tplId) {
        const r = await pool.request().input('id', sql.Int, tplId).query(
            `SELECT QuestionsJSON, SurveyType FROM dms_CRO_SurveyTemplates WHERE TemplateID=@id AND IsActive=1`);
        if (!r.recordset.length) { const e = new Error('Template not found or inactive.'); e.code='VALIDATION'; throw e; }
        if (r.recordset[0].SurveyType !== surveyType) {
            const e = new Error(`Template type mismatch: expected ${surveyType}.`); e.code='VALIDATION'; throw e;
        }
        tplJson = r.recordset[0].QuestionsJSON;
    } else {
        const tpl = await getActiveTemplate(pool, surveyType);
        if (!tpl) { const e = new Error(`No active template for ${surveyType}.`); e.code='VALIDATION'; throw e; }
        tplId = tpl.TemplateID;
        tplJson = tpl.QuestionsJSON;
    }

    // Snapshot customer/contact info from the source row, unless caller overrides
    let phone = input.contactPhone || null;
    let profileId = input.customerProfileId || null;

    if (jobCardId && (!phone || !profileId)) {
        const r = await pool.request().input('j', sql.Int, jobCardId).query(`
            SELECT j.EndUserID, COALESCE(ac.PhoneNo, p.PhoneOne) AS Phone
            FROM Addata_JobCardInfo j
            LEFT JOIN addata_CustomerInfo ac ON j.EndUserID = ac.ProfileID
            LEFT JOIN gen_PartiesInfo p ON j.PartyID = p.PartyID
            WHERE j.JobCardId = @j`);
        const row = r.recordset[0];
        if (!row) { const e = new Error('JobCard not found.'); e.code='VALIDATION'; throw e; }
        phone = phone || row.Phone;
        profileId = profileId || row.EndUserID;
    } else if (complaintId && (!phone || !profileId)) {
        const r = await pool.request().input('c', sql.Int, complaintId).query(
            `SELECT CustomerProfileID, ContactPhone FROM dms_CRO_Complaints WHERE ComplaintID=@c`);
        const row = r.recordset[0];
        if (!row) { const e = new Error('Complaint not found.'); e.code='VALIDATION'; throw e; }
        phone = phone || row.ContactPhone;
        profileId = profileId || row.CustomerProfileID;
    }

    const token = makeToken();
    const ttlDays = input.ttlDays || TOKEN_TTL_DAYS;
    const ins = await pool.request()
        .input('type',  sql.NVarChar(30), surveyType)
        .input('tpl',   sql.Int,           tplId)
        .input('jc',    sql.Int,           jobCardId || null)
        .input('cid',   sql.Int,           complaintId || null)
        .input('prof',  sql.Int,           profileId || null)
        .input('phone', sql.NVarChar(50),  phone || null)
        .input('qjson', sql.NVarChar(sql.MAX), tplJson)
        .input('tok',   sql.NVarChar(64),  token)
        .input('exp',   sql.DateTime,      new Date(Date.now() + ttlDays * 86_400_000))
        .query(`INSERT INTO dms_CRO_Surveys
                    (SurveyType, TemplateID, JobCardID, ComplaintID, CustomerProfileID, ContactPhone,
                     TriggeredAt, QuestionsJSON, Status, ResponseToken, TokenExpiresAt)
                OUTPUT INSERTED.SurveyID
                VALUES (@type, @tpl, @jc, @cid, @prof, @phone, GETDATE(), @qjson, 'Triggered', @tok, @exp)`);

    return { SurveyID: ins.recordset[0].SurveyID, ResponseToken: token, SurveyType: surveyType };
}

// Thin wrappers used by the auto-trigger hooks; idempotent so finalize/close can be re-fired safely.
async function triggerPostJobCard(jobCardId) {
    try { return await createSurvey({ surveyType: 'PostJobCard', jobCardId, idempotent: true }); }
    catch (err) { console.error('[Survey] triggerPostJobCard JC', jobCardId, err.message); return { error: err.message }; }
}
async function triggerPostComplaint(complaintId) {
    try { return await createSurvey({ surveyType: 'PostComplaint', complaintId, idempotent: true }); }
    catch (err) { console.error('[Survey] triggerPostComplaint CMP', complaintId, err.message); return { error: err.message }; }
}

/**
 * Compute "overall rating" from a responses array.
 * Rule: average of all `rating` answers; ignore yesno/text. Null if no ratings.
 */
function computeOverallRating(questions, responses) {
    const responsesById = {};
    for (const r of responses) responsesById[r.id] = r.answer;
    let sum = 0, n = 0;
    for (const q of questions) {
        if (q.type === 'rating') {
            const v = Number(responsesById[q.id]);
            if (!isNaN(v) && v > 0) { sum += v; n++; }
        }
    }
    return n > 0 ? +(sum / n).toFixed(2) : null;
}

/**
 * Record a survey response. Public flow uses token; CRO-officer manual capture
 * uses the same path with `capturedByEmployeeId`.
 *
 * responses: array of { id, answer }
 */
async function recordResponse({ token, surveyId, responses, capturedByEmployeeId = null }) {
    if (!Array.isArray(responses)) throw new Error('responses must be an array');

    const pool = await getPool();
    let survey;

    if (token) {
        const r = await pool.request().input('t', sql.NVarChar(64), token)
            .query(`SELECT * FROM dms_CRO_Surveys WHERE ResponseToken=@t`);
        survey = r.recordset[0];
        if (!survey) { const e = new Error('Survey not found'); e.code = 'NOT_FOUND'; throw e; }
        if (survey.TokenExpiresAt && new Date(survey.TokenExpiresAt) < new Date()) {
            const e = new Error('Survey link has expired'); e.code = 'EXPIRED'; throw e;
        }
    } else if (surveyId) {
        const r = await pool.request().input('id', sql.Int, surveyId)
            .query(`SELECT * FROM dms_CRO_Surveys WHERE SurveyID=@id`);
        survey = r.recordset[0];
        if (!survey) { const e = new Error('Survey not found'); e.code = 'NOT_FOUND'; throw e; }
    } else {
        throw new Error('token or surveyId is required');
    }

    if (survey.Status === 'Responded') {
        const e = new Error('Survey already responded to');
        e.code = 'ALREADY_RESPONDED';
        throw e;
    }
    if (survey.Status === 'Cancelled' || survey.Status === 'Expired') {
        const e = new Error(`Survey is ${survey.Status}`);
        e.code = 'CLOSED';
        throw e;
    }

    const questions = JSON.parse(survey.QuestionsJSON || '[]');
    const rating = computeOverallRating(questions, responses);

    await pool.request()
        .input('id',    sql.Int,              survey.SurveyID)
        .input('rjson', sql.NVarChar(sql.MAX), JSON.stringify(responses))
        .input('rating', sql.Decimal(3, 2),   rating)
        .input('cap',   sql.Int,              capturedByEmployeeId)
        .input('via',   sql.NVarChar(20),     capturedByEmployeeId ? 'Manual' : 'Public')
        .query(`UPDATE dms_CRO_Surveys
                SET Status='Responded',
                    RespondedAt=GETDATE(),
                    ResponsesJSON=@rjson,
                    OverallRating=@rating,
                    CapturedByEmployeeID=@cap,
                    SentVia=COALESCE(SentVia, @via),
                    SentAt=COALESCE(SentAt, GETDATE())
                WHERE SurveyID=@id`);

    return { SurveyID: survey.SurveyID, OverallRating: rating, Status: 'Responded' };
}

module.exports = {
    createSurvey,
    triggerPostJobCard,
    triggerPostComplaint,
    recordResponse,
    computeOverallRating,
};
