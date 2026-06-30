const express = require('express');
const router = express.Router();
const grtnController = require('../controllers/grtnController');
const { requirePerm } = require('../middleware/permissions');

router.get( '/',               requirePerm('procurement_grtn', 'view'),   grtnController.getGRTNs);
router.get( '/:id/print-data', requirePerm('procurement_grtn', 'view'),   grtnController.getGRTNPrintData);
router.get( '/:id',            requirePerm('procurement_grtn', 'view'),   grtnController.getGRTNById);
router.post('/',               requirePerm('procurement_grtn', 'insert'), grtnController.saveGRTN);
router.put( '/:id',            requirePerm('procurement_grtn', 'edit'),   grtnController.updateGRTN);

module.exports = router;
