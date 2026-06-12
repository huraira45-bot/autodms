/**
 * CRO public routes — NO auth required.
 *
 * Mounted in server.js BEFORE the `/api` auth middleware so customers can
 * respond to a survey via the tokenized link in their WhatsApp/SMS message
 * without logging in.
 *
 * Surface kept deliberately small to limit attack surface — only the two
 * survey-response paths live here.
 */
const express = require('express');
const router = express.Router();
const survey = require('../controllers/croSurveyController');
const wa     = require('../controllers/croWhatsAppController');

router.get( '/surveys/public/:token',         survey.publicGet);
router.post('/surveys/public/:token/respond', survey.publicRespond);

// Twilio webhooks (no auth — signature-verified inside the handlers)
router.post('/whatsapp/inbound',              wa.inbound);
router.post('/whatsapp/status',               wa.status);

module.exports = router;
