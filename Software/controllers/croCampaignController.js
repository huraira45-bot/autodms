/**
 * CRO Campaigns — HTTP layer.
 *   GET    /api/cro/campaigns                 — list with counts
 *   GET    /api/cro/campaigns/:id             — detail + send-row aggregates
 *   POST   /api/cro/campaigns                 — create Draft
 *   PUT    /api/cro/campaigns/:id             — edit Draft / Scheduled (not Sent)
 *   DELETE /api/cro/campaigns/:id             — delete Draft only
 *   POST   /api/cro/campaigns/preview         — segment-rules dry run (no campaign required)
 *   POST   /api/cro/campaigns/:id/send-now    — run executeCampaign in the background; returns immediately
 *   POST   /api/cro/campaigns/:id/cancel      — mark Cancelled (only if not yet Sent)
 *   GET    /api/cro/campaigns/:id/sends       — paginated send rows
 */
const { sql, getPool } = require('../config/db');
const { previewSegment, executeCampaign } = require('../services/croCampaignService');

const VALID_CHANNELS = new Set(['WhatsApp', 'SMS']);
const VALID_STATUSES = new Set(['Draft', 'Scheduled', 'Sending', 'Sent', 'Cancelled', 'Failed']);

exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status) { r.input('s', sql.NVarChar(20), req.query.status); conds.push('Status=@s'); }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('Name LIKE @q');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT CampaignID, Name, Channel, Status,
                   ScheduledAt, ExecutedAt, CreatedAt, CreatedByName,
                   TotalRecipients, SentCount, RespondedCount,
                   LEFT(SegmentRulesJSON, 200) AS RulesPreview
            FROM dms_CRO_Campaigns
            ${where}
            ORDER BY
                CASE Status WHEN 'Draft' THEN 0 WHEN 'Scheduled' THEN 1 WHEN 'Sending' THEN 2 WHEN 'Sent' THEN 3 ELSE 4 END,
                CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const id = parseInt(req.params.id);
        const camp = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_CRO_Campaigns WHERE CampaignID=@id`);
        if (!camp.recordset.length) return res.status(404).json({ error: 'Campaign not found' });
        const sendStats = await pool.request().input('id', sql.Int, id).query(`
            SELECT
                COUNT(*) AS TotalQueued,
                SUM(CASE WHEN DeliveryStatus='Sent' OR DeliveryStatus='delivered' OR DeliveryStatus='read' THEN 1 ELSE 0 END) AS Delivered,
                SUM(CASE WHEN DeliveryStatus='Failed' THEN 1 ELSE 0 END) AS Failed,
                SUM(CASE WHEN RespondedAt IS NOT NULL THEN 1 ELSE 0 END) AS Responded
            FROM dms_CRO_CampaignSends
            WHERE CampaignID=@id
        `);
        res.json({ ...camp.recordset[0], stats: sendStats.recordset[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.create = async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.Name?.trim()) return res.status(400).json({ error: 'Name is required' });
        if (!VALID_CHANNELS.has(b.Channel || 'WhatsApp')) return res.status(400).json({ error: 'Invalid Channel' });
        if (!b.SegmentRules || typeof b.SegmentRules !== 'object') return res.status(400).json({ error: 'SegmentRules must be an object' });
        if (!b.MessageTemplate?.trim() && !b.TemplateSid?.trim()) {
            return res.status(400).json({ error: 'MessageTemplate (free-text) or TemplateSid is required' });
        }

        const pool = await getPool();
        const r = await pool.request()
            .input('n',  sql.NVarChar(200), b.Name.trim())
            .input('ch', sql.NVarChar(20),  b.Channel || 'WhatsApp')
            .input('rj', sql.NVarChar(sql.MAX), JSON.stringify(b.SegmentRules))
            .input('mt', sql.NVarChar(sql.MAX), b.MessageTemplate || null)
            .input('tp', sql.NVarChar(100), b.TemplateSid || null)
            .input('sa', sql.DateTime, b.ScheduledAt ? new Date(b.ScheduledAt) : null)
            // CreatedByEmployeeID has an FK to gen_EmployeeInfo — must be employeeId, not userId.
            .input('eby', sql.Int, req.user?.employeeId || null)
            .input('ebyN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_CRO_Campaigns
                        (Name, Channel, SegmentRulesJSON, MessageTemplate, TemplateSid,
                         ScheduledAt, Status, CreatedAt, CreatedByEmployeeID, CreatedByName)
                    OUTPUT INSERTED.CampaignID
                    VALUES (@n, @ch, @rj, @mt, @tp, @sa,
                            CASE WHEN @sa IS NULL THEN 'Draft' ELSE 'Scheduled' END,
                            GETDATE(), @eby, @ebyN)`);
        res.status(201).json({ message: 'Campaign created', CampaignID: r.recordset[0].CampaignID });
    } catch (err) {
        console.error('Campaign create:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.update = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT Status FROM dms_CRO_Campaigns WHERE CampaignID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Not found' });
        if (!['Draft', 'Scheduled'].includes(cur.recordset[0].Status)) {
            return res.status(409).json({ error: `Cannot edit — status is ${cur.recordset[0].Status}` });
        }

        const r = pool.request().input('id', sql.Int, id);
        const sets = [];
        if (b.Name !== undefined)            { r.input('n', sql.NVarChar(200), b.Name.trim()); sets.push('Name=@n'); }
        if (b.SegmentRules !== undefined)    { r.input('rj', sql.NVarChar(sql.MAX), JSON.stringify(b.SegmentRules)); sets.push('SegmentRulesJSON=@rj'); }
        if (b.MessageTemplate !== undefined) { r.input('mt', sql.NVarChar(sql.MAX), b.MessageTemplate || null); sets.push('MessageTemplate=@mt'); }
        if (b.TemplateSid !== undefined)     { r.input('tp', sql.NVarChar(100), b.TemplateSid || null); sets.push('TemplateSid=@tp'); }
        if (b.ScheduledAt !== undefined) {
            r.input('sa', sql.DateTime, b.ScheduledAt ? new Date(b.ScheduledAt) : null);
            sets.push('ScheduledAt=@sa');
            sets.push("Status = CASE WHEN @sa IS NULL THEN 'Draft' ELSE 'Scheduled' END");
        }
        if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
        await r.query(`UPDATE dms_CRO_Campaigns SET ${sets.join(', ')} WHERE CampaignID=@id`);
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT Status FROM dms_CRO_Campaigns WHERE CampaignID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Not found' });
        if (cur.recordset[0].Status !== 'Draft') return res.status(409).json({ error: 'Only Draft campaigns can be deleted. Cancel + recreate instead.' });
        await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_CRO_CampaignSends WHERE CampaignID=@id;
                    DELETE FROM dms_CRO_Campaigns WHERE CampaignID=@id`);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/campaigns/preview { SegmentRules: {...} } — dry-run segment without creating
exports.previewRules = async (req, res) => {
    try {
        const rules = req.body?.SegmentRules || req.body?.rules || {};
        const out = await previewSegment(rules);
        res.json(out);
    } catch (err) {
        console.error('Campaign preview:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/campaigns/:id/send-now
// Fires the campaign in the background. Returns 202 immediately so the UI doesn't block on a long bulk-send.
exports.sendNow = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT Status FROM dms_CRO_Campaigns WHERE CampaignID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Not found' });
        if (!['Draft', 'Scheduled'].includes(cur.recordset[0].Status)) {
            return res.status(409).json({ error: `Cannot send — status is ${cur.recordset[0].Status}` });
        }
        // Run in background; respond 202 with a started ack.
        executeCampaign(id).catch(err => {
            console.error('[campaign] background execute failed:', err.message);
            pool.request().input('id', sql.Int, id)
                .query(`UPDATE dms_CRO_Campaigns SET Status='Failed' WHERE CampaignID=@id`).catch(() => {});
        });
        res.status(202).json({ message: 'Send started in background', CampaignID: id });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.cancel = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query(`UPDATE dms_CRO_Campaigns SET Status='Cancelled'
                    OUTPUT INSERTED.CampaignID
                    WHERE CampaignID=@id AND Status IN ('Draft','Scheduled','Sending')`);
        if (!r.recordset.length) return res.status(409).json({ error: 'Cannot cancel — already Sent or already Cancelled' });
        res.json({ message: 'Cancelled' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/cro/campaigns/:id/sends?status=&limit=&offset=
exports.sends = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = pool.request().input('id', sql.Int, id);
        const conds = ['CampaignID=@id'];
        if (req.query.status) { r.input('s', sql.NVarChar(20), req.query.status); conds.push('DeliveryStatus=@s'); }
        const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
        const offset = parseInt(req.query.offset) || 0;
        r.input('lim', sql.Int, limit).input('off', sql.Int, offset);
        const result = await r.query(`
            SELECT s.SendID, s.CustomerProfileID, c.endUserName AS CustomerName,
                   s.ContactPhone, s.SentAt, s.DeliveryStatus, s.TwilioMessageSid,
                   s.RespondedAt, s.Response, s.ErrorCode, s.ErrorMessage
            FROM dms_CRO_CampaignSends s
            LEFT JOIN addata_CustomerInfo c ON s.CustomerProfileID = c.ProfileID
            WHERE ${conds.join(' AND ')}
            ORDER BY s.SendID DESC
            OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
