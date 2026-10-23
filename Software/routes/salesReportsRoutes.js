const express = require('express');
const router = express.Router();
const c = require('../controllers/salesReportsController');
const { requireAnyAccess } = require('../middleware/permissions');
const { report: customerBalances } = require('../controllers/customerVehicleBalanceController');
const bookingPayments = require('../controllers/bookingPaymentReportController');

router.get('/booking-payments/options', requireAnyAccess('sales_reports', 'report:booking_register'), bookingPayments.options);
router.get('/booking-payments', requireAnyAccess('sales_reports', 'report:booking_register'), bookingPayments.report);

router.get('/booking-register',           requireAnyAccess('sales_reports', 'report:booking_register'),           c.bookingRegister);
router.get('/cancelled-booking-register', requireAnyAccess('sales_reports', 'report:booking_register'), c.cancelledBookingRegister);
router.get('/customer-balances', requireAnyAccess('report:booking_register', 'sales_reports'), customerBalances);
router.get('/vehicle-inventory',          requireAnyAccess('sales_reports', 'report:vehicle_inventory'),          c.vehicleInventory);
router.get('/executive-performance',      requireAnyAccess('sales_reports', 'report:executive_performance'),      c.executivePerformance);
router.get('/customer-advances-aging',    requireAnyAccess('sales_reports', 'report:customer_advances_aging'),    c.customerAdvancesAging);
router.get('/booking-pipeline',           requireAnyAccess('sales_reports', 'report:booking_pipeline'),           c.bookingPipeline);
router.get('/master-invoice-aging',       requireAnyAccess('sales_reports', 'report:master_invoice_aging'),       c.masterInvoiceAging);
router.get('/incentive-receivable-aging', requireAnyAccess('sales_reports', 'report:incentive_receivable_aging'), c.incentiveReceivableAging);
router.get('/booking-account-reconciliation', requireAnyAccess('sales_reports', 'report:booking_account_reconciliation'), c.bookingAccountReconciliation);

module.exports = router;
