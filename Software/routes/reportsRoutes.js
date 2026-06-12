const express = require('express');
const router = express.Router();
const reports = require('../controllers/reportsController');

// Auth is applied globally at /api in server.js. Module check is per-route.
const requireReports = (req, res, next) => {
    if (!req.user?.modules?.includes('reports')) {
        return res.status(403).json({ error: 'Access denied: reports module required.' });
    }
    next();
};

// Inventory on-hand is also useful to operational staff (parts manager, store
// keeper) who don't have the finance "reports" module. Allow either.
const requireReportsOrInventory = (req, res, next) => {
    const mods = req.user?.modules || [];
    if (mods.includes('reports') || mods.includes('parts_spare') || mods.includes('inventory_settings')) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied.' });
};

router.get('/trial-balance',          requireReports, reports.getTrialBalance);
router.get('/gl-detail',              requireReports, reports.getGLDetail);
router.get('/customer-statement',     requireReports, reports.getCustomerStatement);
router.get('/supplier-statement',     requireReports, reports.getSupplierStatement);
router.get('/parties',                requireReports, reports.searchParties);
router.get('/daily-cash-book',        requireReports, reports.getDailyCashBook);
router.get('/tax-summary',            requireReports, reports.getTaxSummary);
router.get('/pnl',                    requireReports, reports.getPnL);
router.get('/balance-sheet',          requireReports, reports.getBalanceSheet);
router.get('/day-book',               requireReports, reports.getDayBook);
router.get('/receivables-aging',      requireReports, reports.getReceivablesAging);
router.get('/payables-aging',         requireReports, reports.getPayablesAging);
router.get('/tax-rate-history',       requireReports, reports.getTaxRateHistory);
router.get('/pos-pending',            requireReports, reports.getPOSPending);
router.get('/cheques-on-hand',        requireReports, reports.getChequesOnHand);
router.get('/bank-balances',          requireReports, reports.getBankBalances);
router.get('/discount-given',         requireReports, reports.getDiscountGiven);
router.get('/sales-register',         requireReports, reports.getSalesRegister);
router.get('/insurance-aging',        requireReports, reports.getInsuranceAging);
router.get('/gross-margin',           requireReports, reports.getGrossMargin);
router.get('/inventory-valuation',    requireReportsOrInventory, reports.getInventoryValuation);
router.get('/gencust-reconciliation', requireReports, reports.getGenCustReconciliation);
router.get('/voucher-audit',          requireReports, reports.getVoucherAudit);
router.get('/system-account-audit',   requireReports, reports.getSystemAccountAudit);

module.exports = router;
