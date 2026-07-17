const express = require('express');
const router = express.Router();
const c = require('../controllers/partsReportsController');
const { requireAccess } = require('../middleware/permissions');

router.get('/stock-movement',    requireAccess('report:stock_movement'),       c.stockMovement);
router.get('/reorder-alert',     requireAccess('report:reorder_alert'),        c.reorderAlert);
router.get('/sales-register',    requireAccess('report:parts_sales_register'), c.partsSalesRegister);
router.get('/purchase-summary',  requireAccess('report:purchase_summary'),     c.purchaseSummary);
router.get('/issued-to-jc',      requireAccess('report:parts_issued_to_jc'),   c.partsIssuedToJc);
router.get('/item-search',       requireAccess('report:item_ledger'),          c.itemSearch);
router.get('/item-ledger',       requireAccess('report:item_ledger'),          c.itemLedger);

module.exports = router;
