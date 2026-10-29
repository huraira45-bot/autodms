const express = require('express');
const router = express.Router();
const masterAging = require('../controllers/masterIncentiveAgingController');
const c = require('../controllers/salesReportsController');
const { requireAnyAccess } = require('../middleware/permissions');
const { report: customerBalances } = require('../controllers/customerVehicleBalanceController');
const bookingPayments = require('../controllers/bookingPaymentReportController');
const vehicleStock = require('../controllers/vehicleInventoryReportController');
const deliveredInvoices = require('../controllers/deliveredMasterInvoiceReportController');
const accountBookings = require('../controllers/accountBookingReportController');

router.get('/account-bookings', requireAnyAccess('sales_reports', 'report:booking_register'), accountBookings.report);

router.get('/delivered-master-invoices', requireAnyAccess('sales_reports', 'report:master_invoice_aging'), deliveredInvoices.report);

router.get('/vehicle-inventory-options', requireAnyAccess('sales_reports','report:vehicle_inventory'), vehicleStock.options);
router.get('/vehicle-inventory-by-variant', requireAnyAccess('sales_reports','report:vehicle_inventory'), vehicleStock.summary);
router.get('/vehicle-inventory-ledger', requireAnyAccess('sales_reports','report:vehicle_inventory'), vehicleStock.ledger);

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
router.get('/master-incentive-options', requireAnyAccess('sales_reports', 'report:incentive_receivable_aging'), masterAging.options);
router.get('/master-incentive-aging', requireAnyAccess('sales_reports', 'report:incentive_receivable_aging'), masterAging.report);
router.get('/booking-account-reconciliation', requireAnyAccess('sales_reports', 'report:booking_account_reconciliation'), c.bookingAccountReconciliation);

module.exports = router;
