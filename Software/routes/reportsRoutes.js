const express = require('express');
const router = express.Router();
const reports = require('../controllers/reportsController');
const finalize = require('../controllers/finalizeController');
const buPnL = require('../controllers/buPnLReportController');
const ssPnL = require('../controllers/storeSalePnLReportController');
const { requireAccess, requireAnyAccess } = require('../middleware/permissions');

// Each report is its own permission key (report:<slug>). See config/permissions.js.

router.get('/trial-balance',          requireAccess('report:trial_balance'),         reports.getTrialBalance);
router.get('/trial-balance-extract',  requireAccess('report:trial_balance_extract'), reports.getTrialBalanceExtract);
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
                                          'report:party_open_invoices',
                                          'report:store_sale_receivables',
                                      ), reports.searchParties);
router.get('/daily-cash-book',        requireAccess('report:daily_cash_book'),       reports.getDailyCashBook);
router.get('/tax-summary',            requireAccess('report:tax_summary'),           reports.getTaxSummary);
router.get('/pnl',                    requireAccess('report:pnl'),                   reports.getPnL);
router.get('/pnl-department',         requireAccess('report:pnl_department'),        reports.getPnLByDepartment);
router.get('/financial-ratios',       requireAccess('report:financial_ratios'),      reports.getFinancialRatios);
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
router.get('/party-open-invoices',    requireAccess('report:party_open_invoices'),    reports.getPartyOpenInvoices);
router.get('/store-sale-receivables', requireAccess('report:store_sale_receivables'), reports.getStoreSaleReceivables);
// Same report/working as above, minus whichever parties are hidden via the settings form below.
router.get('/store-sale-receivables-custom',                requireAccess('report:store_sale_receivables_custom'), reports.getStoreSaleReceivablesCustom);
router.get('/store-sale-receivables-custom/hidden-parties',  requireAccess('report:store_sale_receivables_custom'), reports.getSSReceivablesHiddenParties);
router.put('/store-sale-receivables-custom/hidden-parties',  requireAccess('report:store_sale_receivables_custom'), reports.putSSReceivablesHiddenParties);
router.get('/revenue-split',          requireAccess('report:revenue_split'),          reports.getRevenueSplit);
router.get('/cash-credit-expense',    requireAccess('report:cash_credit_expense'),    reports.getCashCreditExpense);
router.get('/bu-pnl',                 requireAccess('report:bu_pnl'),                 buPnL.getBuPnL);
router.get('/store-sale-pnl',         requireAccess('report:store_sale_pnl'),         ssPnL.getStoreSalePnL);
// Unfinalize activity log — anyone in the workflow (AM or Admin) can view it,
// even if they don't have the general finance-reports permission.
router.get('/unfinalize-log',         requireAnyAccess('am_approve', 'admin_unfinalize', 'report:unfinalize_log'),
                                      finalize.getUnfinalizeLog);

module.exports = router;
