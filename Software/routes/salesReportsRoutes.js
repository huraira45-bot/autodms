const express = require('express');
const router = express.Router();
const c = require('../controllers/salesReportsController');
const { requireAccess } = require('../middleware/permissions');

router.get('/booking-register',           requireAccess('report:booking_register'),           c.bookingRegister);
router.get('/vehicle-inventory',          requireAccess('report:vehicle_inventory'),          c.vehicleInventory);
router.get('/executive-performance',      requireAccess('report:executive_performance'),      c.executivePerformance);
router.get('/customer-advances-aging',    requireAccess('report:customer_advances_aging'),    c.customerAdvancesAging);
router.get('/booking-pipeline',           requireAccess('report:booking_pipeline'),           c.bookingPipeline);
router.get('/master-invoice-aging',       requireAccess('report:master_invoice_aging'),       c.masterInvoiceAging);
router.get('/incentive-receivable-aging', requireAccess('report:incentive_receivable_aging'), c.incentiveReceivableAging);

module.exports = router;
