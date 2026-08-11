const express = require('express');
const router = express.Router();
const c = require('../controllers/serviceReportsController');
const { requireAccess } = require('../middleware/permissions');

router.get('/job-card-register',     requireAccess('report:job_card_register'),     c.jobCardRegister);
router.get('/advisor-performance',   requireAccess('report:advisor_performance'),   c.advisorPerformance);
router.get('/revenue-summary',       requireAccess('report:revenue_summary'),       c.revenueSummary);
router.get('/insurance-claims',      requireAccess('report:insurance_claims'),      c.insuranceClaims);
router.get('/mechanic-productivity', requireAccess('report:mechanic_productivity'), c.mechanicProductivity);
router.get('/tax-invoice-tracker',   requireAccess('report:tax_invoice_tracker'),   c.taxInvoiceTracker);
router.get('/lapsed-customers',      requireAccess('report:lapsed_customers'),      c.lapsedCustomers);
router.get('/tax-invoice-tracker/:jobCardId/lines', requireAccess('report:tax_invoice_tracker'), c.taxInvoiceLines);
router.patch('/tax-invoice-tracker/:jobCardId', requireAccess('report:tax_invoice_tracker'), c.saveTaxInvoice);

module.exports = router;
