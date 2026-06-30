/**
 * CRO Survey Templates — CRUD for the question-set definitions.
 *
 * Versioning rule: editing a template bumps Version and creates a new row;
 * the old row stays around (inactive) so in-flight surveys keep their snapshot.
 * Only the latest IsActive=1 row per SurveyType is used when triggering new surveys.
 *
 * Hard-delete is allowed only when no survey row references the template
 * (FK from dms_CRO_Surveys.TemplateID). Otherwise admin should "deactivate".
 */
const { sql, getPool } = require('../config/db');

const VALID_TYPES = new Set(['PostJobCard', 'PostComplaint', 'PostCampaign']);
const VALID_Q_TYPES = new Set(['rating', 'yesno', 'text']);

function validateQuestions(questions) {
    if (!Array.isArray(questions) || !questions.length) return 'Questions must be a non-empty array.';
    const ids = new Set();
    for (const q of questions) {
        if (!q.id || typeof q.id !== 'string') return 'Each question needs a non-empty `id`.';
        if (ids.has(q.id)) return `Duplicate question id: ${q.id}`;
        ids.add(q.id);
        if (!VALID_Q_TYPES.has(q.type)) return `Invalid type "${q.type}" — expected one of ${[...VALID_Q_TYPES].join(', ')}.`;
        if (!q.text?.trim()) return `Question ${q.id} needs text.`;
        if (q.type === 'rating') {
            const s = parseInt(q.scale);
            if (!Number.isFinite(s) || s < 2 || s > 10) return `Question ${q.id}: rating scale must be 2..10.`;
        }
    }
    return null;
}

// GET /api/cro/survey-templates?type=&activeOnly=1
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.type)        { r.input('t', sql.NVarChar(30), req.query.type); conds.push('SurveyType=@t'); }
        if (req.query.activeOnly === '1') conds.push('IsActive=1');
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT TemplateID, SurveyType, Version, QuestionsJSON, IsActive, CreatedAt, CreatedByName
            FROM dms_CRO_SurveyTemplates
            ${where}
            ORDER BY SurveyType, Version DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/cro/survey-templates/:id
exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT * FROM dms_CRO_SurveyTemplates WHERE TemplateID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Template not found' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/survey-templates  { SurveyType, Questions[], IsActive }
// Creates a NEW template with Version = max(Version)+1 for that SurveyType.
// If IsActive=1, all other rows of the same SurveyType are deactivated first.
exports.create = async (req, res) => {
    try {
        const b = req.body || {};
        if (!VALID_TYPES.has(b.SurveyType)) return res.status(400).json({ error: `Invalid SurveyType: ${b.SurveyType}` });
        const vErr = validateQuestions(b.Questions);
        if (vErr) return res.status(400).json({ error: vErr });

        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const next = await new sql.Request(tx).input('t', sql.NVarChar(30), b.SurveyType)
                .query(`SELECT ISNULL(MAX(Version), 0) + 1 AS v FROM dms_CRO_SurveyTemplates WHERE SurveyType=@t`);
            const version = next.recordset[0].v;

            if (b.IsActive) {
                await new sql.Request(tx).input('t', sql.NVarChar(30), b.SurveyType)
                    .query(`UPDATE dms_CRO_SurveyTemplates SET IsActive=0 WHERE SurveyType=@t AND IsActive=1`);
            }

            const ins = await new sql.Request(tx)
                .input('t',   sql.NVarChar(30), b.SurveyType)
                .input('v',   sql.Int, version)
                .input('q',   sql.NVarChar(sql.MAX), JSON.stringify(b.Questions))
                .input('act', sql.Bit, b.IsActive ? 1 : 0)
                // CreatedByEmployeeID has an FK to gen_EmployeeInfo — must be employeeId, not userId.
                .input('cby', sql.Int, req.user?.employeeId || null)
                .input('cbyN', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO dms_CRO_SurveyTemplates
                            (SurveyType, Version, QuestionsJSON, IsActive, CreatedAt, CreatedByEmployeeID, CreatedByName)
                        OUTPUT INSERTED.TemplateID
                        VALUES (@t, @v, @q, @act, GETDATE(), @cby, @cbyN)`);

            await tx.commit();
            res.status(201).json({ message: 'Template created', TemplateID: ins.recordset[0].TemplateID, Version: version });
        } catch (err) { await tx.rollback(); throw err; }
    } catch (err) {
        console.error('Template create:', err);
        res.status(400).json({ error: err.message });
    }
};

// PUT /api/cro/survey-templates/:id — patch IsActive and/or Questions.
// Editing Questions in place is allowed (no auto-versioning here — caller can POST for a new version if they want history).
exports.update = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_CRO_SurveyTemplates WHERE TemplateID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Template not found' });
        const t = cur.recordset[0];

        if (b.Questions !== undefined) {
            const vErr = validateQuestions(b.Questions);
            if (vErr) return res.status(400).json({ error: vErr });
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // If activating this template, deactivate siblings of the same SurveyType.
            if (b.IsActive === true || b.IsActive === 1) {
                await new sql.Request(tx).input('t', sql.NVarChar(30), t.SurveyType)
                    .query(`UPDATE dms_CRO_SurveyTemplates SET IsActive=0 WHERE SurveyType=@t AND IsActive=1`);
            }

            const r = new sql.Request(tx).input('id', sql.Int, id);
            const sets = [];
            if (b.Questions !== undefined) {
                r.input('q', sql.NVarChar(sql.MAX), JSON.stringify(b.Questions));
                sets.push('QuestionsJSON=@q');
            }
            if (b.IsActive !== undefined) {
                r.input('act', sql.Bit, b.IsActive ? 1 : 0);
                sets.push('IsActive=@act');
            }
            if (!sets.length) {
                await tx.rollback();
                return res.status(400).json({ error: 'Nothing to update.' });
            }
            await r.query(`UPDATE dms_CRO_SurveyTemplates SET ${sets.join(', ')} WHERE TemplateID=@id`);
            await tx.commit();
            res.json({ message: 'Template updated', TemplateID: id });
        } catch (err) { await tx.rollback(); throw err; }
    } catch (err) {
        console.error('Template update:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/cro/survey-templates/:id — hard delete if no surveys reference it.
exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const used = await pool.request().input('id', sql.Int, id)
            .query(`SELECT COUNT(*) AS n FROM dms_CRO_Surveys WHERE TemplateID=@id`);
        if (used.recordset[0].n > 0) {
            return res.status(409).json({
                error: `Template is referenced by ${used.recordset[0].n} survey(s). Deactivate instead.`,
                inUseCount: used.recordset[0].n,
            });
        }
        const r = await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_CRO_SurveyTemplates OUTPUT DELETED.TemplateID WHERE TemplateID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Template not found' });
        res.json({ message: 'Template deleted', TemplateID: id });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
