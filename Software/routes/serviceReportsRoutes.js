const express = require('express');
const router = express.Router();
const c = require('../controllers/serviceReportsController');
const { requireAccess } = require('../middleware/permissions');

router.get('/job-card-register',     requireAccess('report:job_card_register'),     c.jobCardRegister);
router.get('/revenue-summary',       requireAccess('report:revenue_summary'),       c.revenueSummary);
router.get('/insurance-claims',      requireAccess('report:insurance_claims'),      c.insuranceClaims);
router.get('/mechanic-productivity', requireAccess('report:mechanic_productivity'), c.mechanicProductivity);

module.exports = router;
