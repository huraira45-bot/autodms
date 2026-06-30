const express = require('express');
const router = express.Router();
const grnController = require('../controllers/grnController');
const { requirePerm } = require('../middleware/permissions');

router.get( '/',                requirePerm('procurement_grn', 'view'),   grnController.getGRNs);
router.get( '/:id/print-data',  requirePerm('procurement_grn', 'view'),   grnController.getGRNPrintData);
router.get( '/:id',             requirePerm('procurement_grn', 'view'),   grnController.getGRNById);
router.post('/',                requirePerm('procurement_grn', 'insert'), grnController.uploadMiddleware, grnController.saveGRN);
router.put( '/:id',             requirePerm('procurement_grn', 'edit'),   grnController.uploadMiddleware, grnController.updateGRN);

module.exports = router;
