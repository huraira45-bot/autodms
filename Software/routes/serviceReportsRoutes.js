const express = require('express');
const router = express.Router();
const c = require('../controllers/serviceReportsController');
const { requireAccess, requireAnyAccess } = require('../middleware/permissions');
const dmsJobCards = require('../controllers/dmsJobCardReportController');
const performance = require('../controllers/workshopPerformanceController');

router.get('/dms-job-cards', requireAnyAccess('report:job_card_register', 'workshop_jobs:view'), dmsJobCards.report);

router.get('/job-card-register',     requireAccess('report:job_card_register'),     c.jobCardRegister);
router.get('/advisor-performance',   requireAccess('report:advisor_performance'),   c.advisorPerformance);
router.get('/revenue-summary',       requireAccess('report:revenue_summary'),       c.revenueSummary);
router.get('/insurance-claims',      requireAccess('report:insurance_claims'),      c.insuranceClaims);
router.get('/mechanic-productivity', requireAccess('report:mechanic_productivity'), performance.technicians);
router.get('/technician-performance', requireAccess('report:mechanic_productivity'), performance.technicians);
router.get('/department-performance', requireAccess('report:workshop_department_performance'), performance.departments);
router.get('/performance-options', requireAnyAccess('report:mechanic_productivity','report:workshop_department_performance'), performance.options);
router.get('/tax-invoice-tracker',   requireAccess('report:tax_invoice_tracker'),   c.taxInvoiceTracker);
router.get('/lapsed-customers',      requireAccess('report:lapsed_customers'),      c.lapsedCustomers);
router.get('/tax-invoice-tracker/:jobCardId/lines', requireAccess('report:tax_invoice_tracker'), c.taxInvoiceLines);
router.patch('/tax-invoice-tracker/:jobCardId', requireAccess('report:tax_invoice_tracker'), c.saveTaxInvoice);

module.exports = router;
