/**
 * Twilio WhatsApp service — Phase 1 STUB.
 *
 * Current behavior: logs every send to console + writes a row to
 * dms_CRO_WhatsAppMessages so the audit trail is identical to a real send.
 * No HTTP call is made.
 *
 * To go live: run `npm install twilio`, set the .env keys below, and replace
 * the body of sendTemplate/sendText/sendMedia with the real Twilio client
 * call. Webhook signature verification ships pre-wired (validates against
 * TWILIO_WEBHOOK_VALIDATION_TOKEN env var).
 *
 * Source contract: .claude/planning/cro-module-design.md §10.
 */
const { sql, getPool } = require('../config/db');

const SANDBOX_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const IS_STUB = !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN;

let twilioClient = null;
let twilioLib    = null;
if (!IS_STUB) {
    try {
        twilioLib    = require('twilio');
        twilioClient = twilioLib(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        console.log('[twilioWhatsAppService] Live mode — Twilio client initialized for', SANDBOX_FROM);
    } catch (err) {
        console.error('[twilioWhatsAppService] Failed to load twilio package — falling back to stub:', err.message);
    }
}
if (IS_STUB) {
    console.warn('[twilioWhatsAppService] Running in STUB mode (no TWILIO_ACCOUNT_SID set). Outbound messages logged only.');
}

function statusCallbackUrl() {
    const base = process.env.PUBLIC_API_BASE;
    return base ? `${base}/api/cro/whatsapp/status` : null;
}

function generateMockSid(prefix = 'SMmock') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeWhatsAppNumber(num) {
    if (!num) return null;
    const trimmed = String(num).trim();
    if (trimmed.startsWith('whatsapp:')) return trimmed;
    // Strip non-digits except leading +
    const digits = trimmed.replace(/[^\d+]/g, '');
    return `whatsapp:${digits.startsWith('+') ? digits : '+' + digits}`;
}

/**
 * Persist an outbound row to dms_CRO_WhatsAppMessages.
 * Returns the row.
 */
async function recordOutbound({ sid, to, body, mediaUrls, templateName, sourceType, sourceId, customerProfileId, status, errorCode, errorMessage }) {
    const pool = await getPool();
    await pool.request()
        .input('sid',    sql.NVarChar(100), sid)
        .input('dir',    sql.NVarChar(10),  'Outbound')
        .input('status', sql.NVarChar(20),  status || (IS_STUB ? 'Sent' : 'Queued'))
        .input('from',   sql.NVarChar(50),  SANDBOX_FROM)
        .input('to',     sql.NVarChar(50),  to)
        .input('body',   sql.NVarChar(sql.MAX), body || null)
        .input('media',  sql.NVarChar(sql.MAX), mediaUrls ? JSON.stringify(mediaUrls) : null)
        .input('tpl',    sql.NVarChar(100), templateName || null)
        .input('srcT',   sql.NVarChar(30),  sourceType || null)
        .input('srcId',  sql.Int,           sourceId || null)
        .input('prof',   sql.Int,           customerProfileId || null)
        .input('sentAt', sql.DateTime,      IS_STUB ? new Date() : null)
        .input('errC',   sql.NVarChar(20),  errorCode || null)
        .input('errM',   sql.NVarChar(500), errorMessage || null)
        .query(`INSERT INTO dms_CRO_WhatsAppMessages
                    (TwilioMessageSid, Direction, Status, FromNumber, ToNumber, Body, MediaUrls,
                     TemplateName, SourceType, SourceID, CustomerProfileID, SentAt, ErrorCode, ErrorMessage)
                VALUES (@sid, @dir, @status, @from, @to, @body, @media,
                        @tpl, @srcT, @srcId, @prof, @sentAt, @errC, @errM)`);
    return { sid, status };
}

/**
 * Send a template-based outbound message.
 * @param {object} args
 * @param {string} args.to - destination phone (will be normalized to whatsapp:+...)
 * @param {string} args.templateSid - Twilio approved template SID (in real mode)
 * @param {string} args.templateName - human-friendly name (e.g. 'cro_service_reminder')
 * @param {object} args.variables - variable bindings {{1}}, {{2}}, ...
 * @param {string} args.sourceType - 'Complaint'|'Survey'|'ServiceReminder'|'Campaign'
 * @param {number} args.sourceId
 * @param {number} args.customerProfileId
 * @returns {Promise<{ sid: string, status: string }>}
 */
async function sendTemplate({ to, templateSid, templateName, variables, sourceType, sourceId, customerProfileId }) {
    const normalizedTo = normalizeWhatsAppNumber(to);
    if (!normalizedTo) throw new Error('sendTemplate: invalid to-number');

    const bodyPreview = `[TEMPLATE: ${templateName}] vars=${JSON.stringify(variables || {})}`;

    if (IS_STUB) {
        console.log('[twilio-stub] sendTemplate', { to: normalizedTo, templateName, variables, sourceType, sourceId });
        return recordOutbound({
            sid: generateMockSid('SMstub_tpl'),
            to: normalizedTo, body: bodyPreview, templateName,
            sourceType, sourceId, customerProfileId, status: 'Sent'
        });
    }

    if (!twilioClient) throw new Error('Twilio client not initialized — set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.');
    try {
        const payload = {
            from: SANDBOX_FROM,
            to:   normalizedTo,
            contentSid: templateSid,
            contentVariables: JSON.stringify(variables || {}),
        };
        const cb = statusCallbackUrl();
        if (cb) payload.statusCallback = cb;
        const msg = await twilioClient.messages.create(payload);
        return recordOutbound({ sid: msg.sid, to: normalizedTo, body: bodyPreview, templateName, sourceType, sourceId, customerProfileId, status: 'Queued' });
    } catch (err) {
        return recordOutbound({
            sid: generateMockSid('SMfail_tpl'),
            to: normalizedTo, body: bodyPreview, templateName,
            sourceType, sourceId, customerProfileId, status: 'Failed',
            errorCode: err.code, errorMessage: err.message,
        });
    }
}

/**
 * Free-form text — only valid within the 24-hour customer-initiated session window.
 */
async function sendText({ to, body, sourceType, sourceId, customerProfileId }) {
    const normalizedTo = normalizeWhatsAppNumber(to);
    if (!normalizedTo) throw new Error('sendText: invalid to-number');

    if (IS_STUB) {
        console.log('[twilio-stub] sendText', { to: normalizedTo, body, sourceType, sourceId });
        return recordOutbound({
            sid: generateMockSid('SMstub_txt'),
            to: normalizedTo, body,
            sourceType, sourceId, customerProfileId, status: 'Sent'
        });
    }

    if (!twilioClient) throw new Error('Twilio client not initialized — set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.');
    try {
        const payload = { from: SANDBOX_FROM, to: normalizedTo, body };
        const cb = statusCallbackUrl();
        if (cb) payload.statusCallback = cb;
        const msg = await twilioClient.messages.create(payload);
        return recordOutbound({ sid: msg.sid, to: normalizedTo, body, sourceType, sourceId, customerProfileId, status: 'Queued' });
    } catch (err) {
        return recordOutbound({
            sid: generateMockSid('SMfail_txt'),
            to: normalizedTo, body, sourceType, sourceId, customerProfileId,
            status: 'Failed', errorCode: err.code, errorMessage: err.message,
        });
    }
}

/**
 * Send text + media (image/document URL) — used for surveys with attached forms.
 */
async function sendMedia({ to, body, mediaUrl, sourceType, sourceId, customerProfileId }) {
    const normalizedTo = normalizeWhatsAppNumber(to);
    if (!normalizedTo) throw new Error('sendMedia: invalid to-number');
    const mediaUrls = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];

    if (IS_STUB) {
        console.log('[twilio-stub] sendMedia', { to: normalizedTo, body, mediaUrls });
        return recordOutbound({
            sid: generateMockSid('SMstub_med'),
            to: normalizedTo, body, mediaUrls,
            sourceType, sourceId, customerProfileId, status: 'Sent'
        });
    }
    if (!twilioClient) throw new Error('Twilio client not initialized — set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.');
    try {
        const payload = { from: SANDBOX_FROM, to: normalizedTo, body, mediaUrl: mediaUrls };
        const cb = statusCallbackUrl();
        if (cb) payload.statusCallback = cb;
        const msg = await twilioClient.messages.create(payload);
        return recordOutbound({ sid: msg.sid, to: normalizedTo, body, mediaUrls, sourceType, sourceId, customerProfileId, status: 'Queued' });
    } catch (err) {
        return recordOutbound({
            sid: generateMockSid('SMfail_med'),
            to: normalizedTo, body, mediaUrls, sourceType, sourceId, customerProfileId,
            status: 'Failed', errorCode: err.code, errorMessage: err.message,
        });
    }
}

/**
 * Verify Twilio webhook signature. In stub mode, accepts everything.
 * Real implementation should use twilio.validateRequest().
 */
function verifyWebhookSignature(req) {
    if (IS_STUB) return true;
    if (!twilioLib) return false;
    const sig = req.headers['x-twilio-signature'];
    const base = process.env.PUBLIC_API_BASE;
    if (!sig || !base) return false;
    const url = base.replace(/\/$/, '') + req.originalUrl;
    return twilioLib.validateRequest(process.env.TWILIO_AUTH_TOKEN, sig, url, req.body || {});
}

module.exports = {
    sendTemplate,
    sendText,
    sendMedia,
    verifyWebhookSignature,
    normalizeWhatsAppNumber,
    IS_STUB,
};
