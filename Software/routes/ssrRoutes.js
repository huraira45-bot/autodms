const express = require('express');
const router = express.Router();
const ssrController = require('../controllers/ssrController');
const { requirePerm } = require('../middleware/permissions');

router.get( '/',               requirePerm('sales_ssr', 'view'),   ssrController.getSSRs);
router.get( '/:id/print-data', requirePerm('sales_ssr', 'view'),   ssrController.getSSRPrintData);
router.get( '/:id',            requirePerm('sales_ssr', 'view'),   ssrController.getSSRById);
router.post('/',               requirePerm('sales_ssr', 'insert'), ssrController.saveSSR);
router.put( '/:id',            requirePerm('sales_ssr', 'edit'),   ssrController.updateSSR);

module.exports = router;
