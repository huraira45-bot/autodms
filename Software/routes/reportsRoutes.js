const express = require('express');
const router = express.Router();
const reports = require('../controllers/reportsController');
const { requireAccess, requireAnyAccess } = require('../middleware/permissions');

// Each report is its own permission key (report:<slug>). See config/permissions.js.

router.get('/trial-balance',          requireAccess('report:trial_balance'),         reports.getTrialBalance);
router.get('/gl-detail',              requireAccess('report:gl_detail'),             reports.getGLDetail);
router.get('/customer-statement',     requireAccess('report:customer_statement'),    reports.getCustomerStatement);
router.get('/supplier-statement',     requireAccess('report:supplier_statement'),    reports.getSupplierStatement);
// "/parties" is a pick-list used by several reports; allow if user has ANY report.
router.get('/parties',                requireAnyAccess(
                                          'report:customer_statement',
                                          'report:supplier_statement',
                                          'report:gl_detail',
                                          'report:receivables_aging',
                                          'report:payables_aging',
                                      ), reports.searchParties);
router.get('/daily-cash-book',        requireAccess('report:daily_cash_book'),       reports.getDailyCashBook);
router.get('/tax-summary',            requireAccess('report:tax_summary'),           reports.getTaxSummary);
router.get('/pnl',                    requireAccess('report:pnl'),                   reports.getPnL);
router.get('/balance-sheet',          requireAccess('report:balance_sheet'),         reports.getBalanceSheet);
router.get('/day-book',               requireAccess('report:day_book'),              reports.getDayBook);
router.get('/receivables-aging',      requireAccess('report:receivables_aging'),     reports.getReceivablesAging);
router.get('/payables-aging',         requireAccess('report:payables_aging'),        reports.getPayablesAging);
router.get('/tax-rate-history',       requireAccess('report:tax_rate_history'),      reports.getTaxRateHistory);
router.get('/pos-pending',            requireAccess('report:pos_pending'),           reports.getPOSPending);
router.get('/cheques-on-hand',        requireAccess('report:cheques_on_hand'),       reports.getChequesOnHand);
router.get('/bank-balances',          requireAccess('report:bank_balances'),         reports.getBankBalances);
router.get('/discount-given',         requireAccess('report:discount_given'),        reports.getDiscountGiven);
router.get('/sales-register',         requireAccess('report:sales_register'),        reports.getSalesRegister);
router.get('/insurance-aging',        requireAccess('report:insurance_aging'),       reports.getInsuranceAging);
router.get('/gross-margin',           requireAccess('report:gross_margin'),          reports.getGrossMargin);
// Inventory valuation: a financial report but operationally relevant to parts staff.
router.get('/inventory-valuation',    requireAnyAccess(
                                          'report:inventory_valuation',
                                          'parts_spare:view',
                                          'inventory_settings:view',
                                      ), reports.getInventoryValuation);
router.get('/gencust-reconciliation', requireAccess('report:gencust_reconciliation'), reports.getGenCustReconciliation);
router.get('/walkin-outstanding',     requireAccess('report:walkin_outstanding'),     reports.getWalkInOutstanding);
router.get('/voucher-audit',          requireAccess('report:voucher_audit'),          reports.getVoucherAudit);
router.get('/system-account-audit',   requireAccess('report:system_account_audit'),   reports.getSystemAccountAudit);

module.exports = router;
