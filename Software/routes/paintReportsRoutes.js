/**
 * Paint Lab — reports + dashboard routes (Phase 4).
 * Mounted at /api/paint/reports; dashboard mounted at /api/paint/dashboard.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/paintReportsController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Reports — anyone with paint_lab_reports:view OR paint_lab_dashboard:view.
router.get('/reports/stock-balance',              requirePerm('paint_lab_reports', 'view'), c.stockBalance);
router.get('/reports/stock-ledger',               requirePerm('paint_lab_reports', 'view'), c.stockLedger);
router.get('/reports/purchase',                   requirePerm('paint_lab_reports', 'view'), c.purchase);
router.get('/reports/grtn',                       requirePerm('paint_lab_reports', 'view'), c.grtn);
router.get('/reports/issue-to-jc',                requirePerm('paint_lab_reports', 'view'), c.issueToJC);
router.get('/reports/consumption-by-jc',          requirePerm('paint_lab_reports', 'view'), c.consumptionByJC);
router.get('/reports/consumption-by-business',    requirePerm('paint_lab_reports', 'view'), c.consumptionByBusinessType);
router.get('/reports/low-stock',                  requirePerm('paint_lab_reports', 'view'), c.lowStock);

// Dashboard — separate perm so a manager can see it without full report grants.
router.get('/dashboard',
    requireAnyAccess('paint_lab_dashboard:view', 'paint_lab_reports:view'),
    c.dashboard);

module.exports = router;
