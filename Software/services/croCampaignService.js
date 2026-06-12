/**
 * CRO Campaigns — segment resolver + send pipeline (cro-module-design.md §15).
 *
 * Two operations:
 *   - previewSegment(rules)   → { count, sample[] } for the build UI
 *   - executeCampaign(id)     → resolves segment, inserts CampaignSends, throttles sends
 *
 * Segment rules schema (all optional, AND-combined):
 *   {
 *     vehicleBrand: "Changan",     -- matches addata_CustomerInfo.BrandName
 *     vehicleCode:  "CT",
 *     noJCSinceDays: 90,           -- exclude customers with finalized JC in last N days
 *     city: "Lahore",              -- NOT applied — no City column on this schema
 *     hasPhone: true,              -- always true for campaigns (we need a phone to send)
 *     limit: 1000                  -- safety cap
 *   }
 *
 * Customers with DoNotContact=1 are ALWAYS excluded regardless of rules.
 */
const { sql, getPool } = require('../config/db');
const { sendTemplate, sendText } = require('./twilioWhatsAppService');

const DEFAULT_LIMIT      = 1000;
const THROTTLE_DELAY_MS  = 110;   // ~9 msg/sec — safely under Twilio's 80/sec ceiling

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Build the SQL fragment for a segment-rules JSON. Returns { sqlFragment, params, limit }.
 * Designed so the same fragment is shared between previewSegment and executeCampaign.
 */
function buildSegmentSQL(rules = {}) {
    const conds = [
        // Sanity: must have a phone to send to
        `c.PhoneNo IS NOT NULL AND LEN(LTRIM(RTRIM(c.PhoneNo))) > 4`,
        // Always honor opt-out
        `ISNULL(c.DoNotContact, 0) = 0`,
    ];
    const params = [];

    if (rules.vehicleBrand?.trim()) {
        params.push({ name: 'brand', type: sql.NVarChar(100), value: rules.vehicleBrand.trim() });
        conds.push('c.BrandName = @brand');
    }
    if (rules.vehicleCode?.trim()) {
        params.push({ name: 'vcode', type: sql.NVarChar(50), value: rules.vehicleCode.trim() });
        conds.push('c.vehicleCode = @vcode');
    }
    if (rules.noJCSinceDays && parseInt(rules.noJCSinceDays) > 0) {
        params.push({ name: 'gap', type: sql.Int, value: parseInt(rules.noJCSinceDays) });
        // Customers whose most recent JC is older than gap days OR have no JC at all
        conds.push(`
            NOT EXISTS (
                SELECT 1 FROM Addata_JobCardInfo j
                WHERE j.EndUserID = c.ProfileID
                  AND j.IsFinalized = 1
                  AND j.JobCardDate >= DATEADD(DAY, -@gap, GETDATE())
            )
        `);
    }
    if (rules.hasJCEver === true) {
        conds.push(`EXISTS (SELECT 1 FROM Addata_JobCardInfo j WHERE j.EndUserID = c.ProfileID AND j.IsFinalized = 1)`);
    }
    if (rules.hasJCEver === false) {
        conds.push(`NOT EXISTS (SELECT 1 FROM Addata_JobCardInfo j WHERE j.EndUserID = c.ProfileID AND j.IsFinalized = 1)`);
    }
    if (rules.profileIds && Array.isArray(rules.profileIds) && rules.profileIds.length) {
        // For one-off blast to specific customers — bypass other rules logically (still AND-applied)
        const ids = rules.profileIds.map(x => parseInt(x)).filter(n => Number.isFinite(n));
        if (ids.length) conds.push(`c.ProfileID IN (${ids.join(',')})`);
    }

    const limit = Math.min(parseInt(rules.limit) || DEFAULT_LIMIT, 5000);

    return {
        whereClause: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
        params,
        limit,
    };
}

function applyParams(request, params) {
    for (const p of params) request.input(p.name, p.type, p.value);
    return request;
}

async function previewSegment(rules) {
    const pool = await getPool();
    const { whereClause, params, limit } = buildSegmentSQL(rules);

    const countReq = applyParams(pool.request(), params);
    const sampleReq = applyParams(pool.request(), params);

    const countQ = `SELECT COUNT(DISTINCT c.ProfileID) AS n
                    FROM addata_CustomerInfo c
                    ${whereClause}`;
    const sampleQ = `SELECT TOP 10 c.ProfileID, c.endUserName, c.PhoneNo, c.BrandName, c.vehicleCode, c.RegistrationNo
                     FROM addata_CustomerInfo c
                     ${whereClause}
                     ORDER BY c.ProfileID DESC`;
    const [cRes, sRes] = await Promise.all([countReq.query(countQ), sampleReq.query(sampleQ)]);
    const count = cRes.recordset[0]?.n || 0;

    return {
        count,
        cappedCount: Math.min(count, limit),
        limit,
        sample: sRes.recordset,
    };
}

/**
 * Run a campaign end-to-end:
 *   1. Resolve segment → recipient list
 *   2. INSERT one CampaignSend row per recipient
 *   3. Loop: invoke twilioWhatsAppService.sendTemplate (throttled), update CampaignSends row with sid/status
 *   4. Aggregate counts back onto the Campaign row
 *
 * Returns { total, sent, failed, skipped }.
 *
 * Does NOT begin/commit a single transaction across all sends — each send is its own atomic
 * status update so a mid-run crash doesn't lose the whole batch.
 */
async function executeCampaign(campaignId, { onProgress } = {}) {
    const pool = await getPool();
    const camp = (await pool.request().input('id', sql.Int, campaignId)
        .query(`SELECT * FROM dms_CRO_Campaigns WHERE CampaignID=@id`)).recordset[0];
    if (!camp) { const e = new Error('Campaign not found'); e.code = 'NOT_FOUND'; throw e; }
    if (camp.Status !== 'Draft' && camp.Status !== 'Scheduled') {
        const e = new Error(`Cannot execute — status is ${camp.Status}`); e.code = 'INVALID_STATE'; throw e;
    }

    const rules = JSON.parse(camp.SegmentRulesJSON || '{}');
    const { whereClause, params, limit } = buildSegmentSQL(rules);

    // Resolve recipients
    const recipReq = applyParams(pool.request(), params);
    const recipQ = `SELECT TOP (${limit}) c.ProfileID, c.endUserName, c.PhoneNo, c.BrandName, c.vehicleCode, c.RegistrationNo
                    FROM addata_CustomerInfo c
                    ${whereClause}
                    ORDER BY c.ProfileID DESC`;
    const recipients = (await recipReq.query(recipQ)).recordset;

    // Mark as Sending + record total
    await pool.request()
        .input('id', sql.Int, campaignId)
        .input('total', sql.Int, recipients.length)
        .query(`UPDATE dms_CRO_Campaigns
                SET Status='Sending', ExecutedAt=GETDATE(), TotalRecipients=@total
                WHERE CampaignID=@id`);

    // Pre-insert send rows so the queue is visible even if we crash mid-loop
    for (const r of recipients) {
        await pool.request()
            .input('cid',  sql.Int,  campaignId)
            .input('prof', sql.Int,  r.ProfileID)
            .input('ph',   sql.NVarChar(50), r.PhoneNo)
            .query(`INSERT INTO dms_CRO_CampaignSends (CampaignID, CustomerProfileID, ContactPhone, DeliveryStatus)
                    VALUES (@cid, @prof, @ph, 'Queued')`);
    }

    let sent = 0, failed = 0;
    for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        try {
            const variables = {
                name:    (r.endUserName || '').trim() || 'Customer',
                brand:   r.BrandName || '',
                vehicle: r.RegistrationNo || r.vehicleCode || '',
            };

            const out = camp.TemplateSid
                ? await sendTemplate({
                    to: r.PhoneNo,
                    templateSid: camp.TemplateSid,
                    templateName: camp.Name,
                    variables,
                    sourceType: 'Campaign',
                    sourceId: campaignId,
                    customerProfileId: r.ProfileID,
                })
                : await sendText({
                    to: r.PhoneNo,
                    body: renderTemplate(camp.MessageTemplate, variables),
                    sourceType: 'Campaign',
                    sourceId: campaignId,
                    customerProfileId: r.ProfileID,
                });

            await pool.request()
                .input('cid',  sql.Int, campaignId)
                .input('prof', sql.Int, r.ProfileID)
                .input('sid',  sql.NVarChar(100), out.sid || null)
                .input('st',   sql.NVarChar(20),  out.status || 'Sent')
                .query(`UPDATE dms_CRO_CampaignSends
                        SET TwilioMessageSid=@sid, DeliveryStatus=@st, SentAt=GETDATE()
                        WHERE CampaignID=@cid AND CustomerProfileID=@prof`);
            sent++;
        } catch (err) {
            await pool.request()
                .input('cid',  sql.Int, campaignId)
                .input('prof', sql.Int, r.ProfileID)
                .input('errC', sql.NVarChar(20), err.code || 'ERROR')
                .input('errM', sql.NVarChar(500), err.message || 'send failed')
                .query(`UPDATE dms_CRO_CampaignSends
                        SET DeliveryStatus='Failed', ErrorCode=@errC, ErrorMessage=@errM
                        WHERE CampaignID=@cid AND CustomerProfileID=@prof`);
            failed++;
        }

        onProgress?.({ index: i + 1, total: recipients.length, sent, failed });

        // Throttle to avoid Twilio rate limits
        if (i < recipients.length - 1) await sleep(THROTTLE_DELAY_MS);
    }

    // Finalize
    await pool.request()
        .input('id', sql.Int, campaignId)
        .input('sent', sql.Int, sent)
        .query(`UPDATE dms_CRO_Campaigns
                SET Status='Sent', SentCount=@sent
                WHERE CampaignID=@id`);

    return { total: recipients.length, sent, failed };
}

function renderTemplate(tpl, vars) {
    if (!tpl) return '';
    return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

module.exports = {
    previewSegment,
    executeCampaign,
    buildSegmentSQL,
    renderTemplate,
};
