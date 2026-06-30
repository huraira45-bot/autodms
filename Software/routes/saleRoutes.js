const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { requirePerm } = require('../middleware/permissions');

router.get( '/',               requirePerm('sales_store', 'view'),   saleController.getSales);
router.get( '/:id/print-data', requirePerm('sales_store', 'view'),   saleController.getStoreSalePrintData);
router.get( '/:id',            requirePerm('sales_store', 'view'),   saleController.getStoreSaleById);
router.post('/',               requirePerm('sales_store', 'insert'), saleController.saveStoreSale);
router.put( '/:id',            requirePerm('sales_store', 'edit'),   saleController.updateStoreSale);

module.exports = router;
