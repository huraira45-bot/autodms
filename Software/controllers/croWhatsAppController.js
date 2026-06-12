/**
 * Twilio WhatsApp webhook handlers.
 *
 *   POST /api/cro/whatsapp/inbound  — customer messages
 *   POST /api/cro/whatsapp/status   — Twilio delivery status callbacks
 *
 * Both endpoints are public (no auth) but verify the X-Twilio-Signature header
 * (when not in stub mode). In stub mode we accept everything so smoke tests
 * can hit them via curl.
 *
 * Inbound handling:
 *   1. Persist the inbound row to dms_CRO_WhatsAppMessages
 *   2. Detect opt-out keywords (STOP, CANCEL, UNSUBSCRIBE) → set addata_CustomerInfo.WhatsAppOptOut=1
 *   3. (Future) thread the message back to the linked complaint as an action
 */
const { sql, getPool } = require('../config/db');
const { verifyWebhookSignature, IS_STUB } = require('../services/twilioWhatsAppService');

const OPT_OUT_WORDS = /^(stop|cancel|unsubscribe|end|quit|stopall)$/i;

// POST /api/cro/whatsapp/inbound
exports.inbound = async (req, res) => {
    try {
        if (!verifyWebhookSignature(req)) {
            console.warn('[wa-inbound] signature verification failed');
            return res.status(403).send('Signature invalid');
        }

        const b = req.body || {};
        const from   = b.From || '';                  // "whatsapp:+923001234567"
        const to     = b.To   || '';
        const body   = b.Body || '';
        const sid    = b.MessageSid || b.SmsMessageSid || ('IB_' + Date.now());
        const numMedia = parseInt(b.NumMedia || '0');
        const mediaUrls = [];
        for (let i = 0; i < numMedia; i++) {
            const u = b[`MediaUrl${i}`];
            if (u) mediaUrls.push(u);
        }

        const pool = await getPool();

        // Look up customer by phone (strip "whatsapp:" prefix)
        const phone = from.replace(/^whatsapp:/, '').trim();
        const profQ = await pool.request().input('p', sql.NVarChar(50), phone)
            .query(`SELECT TOP 1 ProfileID FROM addata_CustomerInfo WHERE PhoneNo = @p OR PhoneNo LIKE '%' + RIGHT(@p, 10)`);
        const profileId = profQ.recordset[0]?.ProfileID || null;

        await pool.request()
            .input('sid',   sql.NVarChar(100), sid)
            .input('dir',   sql.NVarChar(10),  'Inbound')
            .input('status', sql.NVarChar(20), 'Received')
            .input('from',  sql.NVarChar(50),  from)
            .input('to',    sql.NVarChar(50),  to)
            .input('body',  sql.NVarChar(sql.MAX), body)
            .input('media', sql.NVarChar(sql.MAX), mediaUrls.length ? JSON.stringify(mediaUrls) : null)
            .input('prof',  sql.Int,           profileId)
            .input('recv',  sql.DateTime,      new Date())
            .query(`INSERT INTO dms_CRO_WhatsAppMessages
                        (TwilioMessageSid, Direction, Status, FromNumber, ToNumber, Body, MediaUrls,
                         CustomerProfileID, SentAt)
                    VALUES (@sid, @dir, @status, @from, @to, @body, @media, @prof, @recv)`);

        // Opt-out keyword detection
        const trimmed = (body || '').trim();
        if (OPT_OUT_WORDS.test(trimmed) && profileId) {
            try {
                await pool.request().input('id', sql.Int, profileId)
                    .query(`UPDATE addata_CustomerInfo SET WhatsAppOptOut = 1 WHERE ProfileID = @id`);
                console.log(`[wa-inbound] Profile ${profileId} opted out via "${trimmed}"`);
            } catch (e) {
                // Column may not exist on older deployments; log and continue
                console.warn('[wa-inbound] opt-out update failed:', e.message);
            }
        }

        // Twilio expects an empty TwiML response (or just 200)
        res.set('Content-Type', 'text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (err) {
        console.error('[wa-inbound] error:', err);
        res.status(500).send('error');
    }
};

// POST /api/cro/whatsapp/status — Twilio updates the message status (Queued → Sent → Delivered → Read)
exports.status = async (req, res) => {
    try {
        if (!verifyWebhookSignature(req)) {
            return res.status(403).send('Signature invalid');
        }
        const b = req.body || {};
        const sid    = b.MessageSid || b.SmsMessageSid;
        const status = b.MessageStatus || b.SmsStatus;
        if (!sid || !status) return res.status(400).send('missing sid/status');

        const pool = await getPool();
        const isDelivered = status === 'delivered';
        const isRead      = status === 'read';
        const isFailed    = status === 'failed' || status === 'undelivered';

        await pool.request()
            .input('sid', sql.NVarChar(100), sid)
            .input('s',   sql.NVarChar(20),  status)
            .input('dt',  sql.DateTime, isDelivered ? new Date() : null)
            .input('rt',  sql.DateTime, isRead ? new Date() : null)
            .input('errC', sql.NVarChar(20), b.ErrorCode || null)
            .input('errM', sql.NVarChar(500), b.ErrorMessage || null)
            .query(`UPDATE dms_CRO_WhatsAppMessages
                    SET Status=@s,
                        DeliveredAt = COALESCE(@dt, DeliveredAt),
                        ReadAt      = COALESCE(@rt, ReadAt),
                        ErrorCode   = COALESCE(@errC, ErrorCode),
                        ErrorMessage= COALESCE(@errM, ErrorMessage)
                    WHERE TwilioMessageSid=@sid`);

        res.set('Content-Type', 'text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (err) {
        console.error('[wa-status] error:', err);
        res.status(500).send('error');
    }
};

// GET /api/cro/whatsapp/messages?direction=Inbound&customerProfileId=... (admin/CRO use)
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.direction)         { r.input('d', sql.NVarChar(10), req.query.direction); conds.push('Direction=@d'); }
        if (req.query.customerProfileId) { r.input('p', sql.Int, parseInt(req.query.customerProfileId)); conds.push('CustomerProfileID=@p'); }
        if (req.query.complaintId)       { r.input('c', sql.Int, parseInt(req.query.complaintId)); conds.push('SourceType=\'Complaint\' AND SourceID=@c'); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT TOP 200 * FROM dms_CRO_WhatsAppMessages
            ${where}
            ORDER BY COALESCE(SentAt, CreatedAt) DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
