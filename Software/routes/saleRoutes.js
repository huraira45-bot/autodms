const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { requirePerm, requireAccess } = require('../middleware/permissions');

router.get( '/',               requirePerm('sales_store', 'view'),   saleController.getSales);
router.get( '/:id/print-data', requirePerm('sales_store', 'view'),   saleController.getStoreSalePrintData);
router.get( '/:id',            requirePerm('sales_store', 'view'),   saleController.getStoreSaleById);
router.post('/',               requirePerm('sales_store', 'insert'), saleController.saveStoreSale);
router.put( '/:id',            requirePerm('sales_store', 'edit'),   saleController.updateStoreSale);

// Admin-only: drop the auto-finalize lock so the sale can be edited.
// Reverses the SS voucher (and any auto-settle CRV), flips IsFinalized=0.
router.post('/:id/unfinalize',  requireAccess('admin_unfinalize'),    saleController.unfinalizeStoreSale);

module.exports = router;
