const express = require('express');
const router = express.Router();
const comp = require('../controllers/croComplaintController');
const att  = require('../controllers/croAttachmentController');
const notif = require('../controllers/croNotificationController');
const rep  = require('../controllers/croReportsController');
const surv = require('../controllers/croSurveyController');
const tmpl = require('../controllers/croSurveyTemplateController');
const rem  = require('../controllers/croReminderController');
const kyc  = require('../controllers/croKYCController');
const inq  = require('../controllers/croInquiryController');
const wa   = require('../controllers/croWhatsAppController');
const camp = require('../controllers/croCampaignController');
const { uploadComplaintImage } = require('../middleware/croUpload');

// Permission gates: cro_workspace = file/view/verify; cro_dept_responder = work on assigned;
// cro_admin = manager overrides + escalation.
const requireAny = (...keys) => (req, res, next) => {
    if (req.user?.modules?.some(m => keys.includes(m))) return next();
    return res.status(403).json({ error: `Access denied: one of (${keys.join(', ')}) required.` });
};

// --- Complaint list / stats / detail ---
router.get('/complaints/stats',          requireAny('cro_workspace','cro_admin','cro_dept_responder','cro_reports'), comp.stats);
router.get('/complaints',                requireAny('cro_workspace','cro_admin','cro_dept_responder','cro_reports'), comp.list);
router.get('/complaints/:id',            requireAny('cro_workspace','cro_admin','cro_dept_responder','cro_reports'), comp.get);

// --- Customer JC picker (for the New Complaint form) ---
router.get('/customers/:profileId/jobcards', requireAny('cro_workspace','cro_admin'), comp.getRecentJobCardsForCustomer);

// --- Create + state transitions ---
router.post('/complaints',                  requireAny('cro_workspace','cro_admin'), comp.create);
router.post('/complaints/:id/actions',      requireAny('cro_workspace','cro_admin','cro_dept_responder'), comp.addAction);
router.post('/complaints/:id/resolve',      requireAny('cro_dept_responder','cro_admin'), comp.markResolved);
router.post('/complaints/:id/whatsapp-override', requireAny('cro_admin'), comp.whatsAppOverride);
router.post('/complaints/:id/verdict',      requireAny('cro_workspace','cro_admin'), comp.recordVerdict);
router.post('/complaints/:id/escalate',     requireAny('cro_admin'), comp.manualEscalate);
router.post('/complaints/:id/reassign',     requireAny('cro_workspace','cro_admin'), comp.reassign);

// --- Attachments ---
router.post(
    '/complaints/:id/attachments',
    requireAny('cro_workspace','cro_admin','cro_dept_responder'),
    uploadComplaintImage.single('file'),
    att.upload
);
router.get('/complaints/:id/attachments/:attId/download',
    requireAny('cro_workspace','cro_admin','cro_dept_responder','cro_reports'), att.download);
router.delete('/complaints/:id/attachments/:attId', requireAny('cro_admin'), att.softDelete);

// --- Reports (cro_reports module) ---
router.get('/reports/open-dashboard',     requireAny('cro_reports','cro_admin'), rep.openDashboard);
router.get('/reports/aged',               requireAny('cro_reports','cro_admin'), rep.aged);
router.get('/reports/resolution-time',    requireAny('cro_reports','cro_admin'), rep.resolutionTime);
router.get('/reports/survey-scores',      requireAny('cro_reports','cro_admin'), rep.surveyScores);
router.get('/reports/reminder-conversion',requireAny('cro_reports','cro_admin'), rep.reminderConversion);
router.get('/reports/kyc-flags',          requireAny('cro_reports','cro_admin'), rep.kycFlags);
router.get('/reports/campaign-roi',       requireAny('cro_reports','cro_admin'), rep.campaignROI);
router.get('/reports/customer-touchpoints', requireAny('cro_reports','cro_admin'), rep.customerTouchpoints);
router.get('/reports/service-ladder',     requireAny('cro_reports','cro_admin'), rep.serviceLadder);
router.get('/reports/by-responder',       requireAny('cro_reports','cro_admin'), rep.byResponder);
router.get('/reports/escalation-heatmap', requireAny('cro_reports','cro_admin'), rep.escalationHeatmap);
router.get('/reports/repeats',            requireAny('cro_reports','cro_admin'), rep.repeatComplaints);
router.get('/reports/verdict-tracker',    requireAny('cro_reports','cro_admin'), rep.verdictTracker);

// --- Surveys (admin/CRO officer side; public token endpoints live in croPublicRoutes.js) ---
router.get(   '/surveys',                       requireAny('cro_workspace','cro_admin','cro_reports'), surv.list);
router.get(   '/surveys/by-job-card/:jobCardId', requireAny('cro_workspace','cro_admin','cro_reports'), surv.byJobCard);
router.get(   '/surveys/:id',                   requireAny('cro_workspace','cro_admin','cro_reports'), surv.get);
router.post(  '/surveys',                       requireAny('cro_workspace','cro_admin'), surv.create);
router.put(   '/surveys/:id',                   requireAny('cro_workspace','cro_admin'), surv.update);
router.delete('/surveys/:id',                   requireAny('cro_admin'),                 surv.remove);
router.post(  '/surveys/:id/capture',           requireAny('cro_workspace','cro_admin'), surv.capture);
router.post(  '/surveys/:id/mark-sent',         requireAny('cro_workspace','cro_admin'), surv.markSent);
router.post(  '/surveys/:id/cancel',            requireAny('cro_admin'),                 surv.cancel);

// --- Survey Templates (cro_admin only — these define the question sets) ---
router.get(   '/survey-templates',         requireAny('cro_workspace','cro_admin','cro_reports'), tmpl.list);
router.get(   '/survey-templates/:id',     requireAny('cro_workspace','cro_admin','cro_reports'), tmpl.get);
router.post(  '/survey-templates',         requireAny('cro_admin'), tmpl.create);
router.put(   '/survey-templates/:id',     requireAny('cro_admin'), tmpl.update);
router.delete('/survey-templates/:id',     requireAny('cro_admin'), tmpl.remove);

// --- Service Reminders ---
router.get( '/reminders',                  requireAny('cro_workspace','cro_admin','cro_reports'), rem.list);
router.post('/reminders/:id/acknowledge',  requireAny('cro_workspace','cro_admin'), rem.acknowledge);
router.post('/reminders/:id/mark-booked',  requireAny('cro_workspace','cro_admin'), rem.markBooked);
router.post('/reminders/:id/cancel',       requireAny('cro_admin'),                 rem.cancel);
router.post('/reminders/regenerate',       requireAny('cro_admin'),                 rem.regenerate);
router.post('/reminders/debug/tick',       requireAny('cro_admin'),                 rem.debugTick);

// --- KYC Flags ---
router.get( '/kyc-flags',                          requireAny('cro_workspace','cro_admin','cro_reports'), kyc.list);
router.get( '/kyc-flags/active-for-chassis/:chasis', kyc.activeForChassis);  // any logged-in user — used by JobCardForm
router.post('/kyc-flags',                          requireAny('cro_workspace','cro_admin'), kyc.create);
router.post('/kyc-flags/:id/acknowledge',          kyc.acknowledge);  // any logged-in advisor
router.post('/kyc-flags/:id/resolve',              requireAny('cro_admin'), kyc.resolve);
router.delete('/kyc-flags/:id',                    requireAny('cro_admin'), kyc.remove);

// --- Inquiries ---
router.get(  '/inquiries',                            requireAny('cro_workspace','cro_admin','cro_reports'), inq.list);
router.post( '/inquiries',                            requireAny('cro_workspace','cro_admin'), inq.create);
router.put(  '/inquiries/:id',                        requireAny('cro_workspace','cro_admin'), inq.update);
router.post( '/inquiries/:id/convert-to-complaint',   requireAny('cro_workspace','cro_admin'), inq.convertToComplaint);
router.post( '/inquiries/:id/link-jobcard',           requireAny('cro_workspace','cro_admin'), inq.linkJobCard);
router.delete('/inquiries/:id',                       requireAny('cro_admin'), inq.remove);

// --- WhatsApp message log (read-only view for cro_admin) ---
router.get('/whatsapp/messages', requireAny('cro_admin'), wa.list);

// --- Campaigns ---
router.get(   '/campaigns',                requireAny('cro_workspace','cro_admin','cro_reports'), camp.list);
router.post(  '/campaigns/preview',        requireAny('cro_workspace','cro_admin'), camp.previewRules);
router.get(   '/campaigns/:id',            requireAny('cro_workspace','cro_admin','cro_reports'), camp.get);
router.post(  '/campaigns',                requireAny('cro_admin'), camp.create);
router.put(   '/campaigns/:id',            requireAny('cro_admin'), camp.update);
router.delete('/campaigns/:id',            requireAny('cro_admin'), camp.remove);
router.post(  '/campaigns/:id/send-now',   requireAny('cro_admin'), camp.sendNow);
router.post(  '/campaigns/:id/cancel',     requireAny('cro_admin'), camp.cancel);
router.get(   '/campaigns/:id/sends',      requireAny('cro_workspace','cro_admin','cro_reports'), camp.sends);

// --- Notifications inbox (every authenticated user sees only their own rows) ---
router.get( '/notifications/inbox',         notif.inbox);
router.post('/notifications/:id/read',      notif.markRead);
router.post('/notifications/read-all',      notif.markAllRead);

// --- Debug / admin: manually fire one escalation-engine tick (cro_admin only) ---
router.post('/debug/escalation-tick', requireAny('cro_admin'), async (req, res) => {
    try {
        const stats = await require('../services/escalationCron').tick({ verbose: true });
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
