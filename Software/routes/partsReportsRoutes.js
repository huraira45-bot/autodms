const express = require('express');
const router = express.Router();
const c = require('../controllers/partsReportsController');
const { requireAccess } = require('../middleware/permissions');

router.get('/stock-movement',    requireAccess('report:stock_movement'),       c.stockMovement);
router.get('/reorder-alert',     requireAccess('report:reorder_alert'),        c.reorderAlert);
router.get('/sales-register',    requireAccess('report:parts_sales_register'), c.partsSalesRegister);
router.get('/purchase-summary',  requireAccess('report:purchase_summary'),     c.purchaseSummary);

module.exports = router;
