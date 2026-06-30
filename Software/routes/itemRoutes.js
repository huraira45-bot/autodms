const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Item read is needed by GRN/GRTN/StoreSale/SSR/PartsIssue forms — broad allowance.
router.get( '/',     requireAnyAccess(
                       'parts_spare:view',
                       'procurement_grn:view', 'procurement_grtn:view',
                       'sales_store:view',     'sales_ssr:view',
                       'workshop_parts_issue:view', 'workshop_jobs:view',
                       'inventory_settings:view',
                     ), itemController.getItems);

router.post('/',     requirePerm('parts_spare', 'insert'), itemController.createItem);
router.put( '/:id',  requirePerm('parts_spare', 'edit'),   itemController.updateItem);

module.exports = router;
