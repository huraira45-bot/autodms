const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { requirePerm, requireAnyAccess, requireAnyPerm } = require('../middleware/permissions');

// Item read is needed by GRN/GRTN/StoreSale/SSR/PartsIssue forms — broad allowance.
router.get( '/',     requireAnyAccess(
                       'parts_spare:view',
                       'procurement_grn:view', 'procurement_grtn:view',
                       'sales_store:view',     'sales_ssr:view',
                       'workshop_parts_issue:view', 'workshop_jobs:view',
                       'inventory_settings:view',
                     ), itemController.getItems);

// The same /api/items endpoint creates BOTH parts (ItemType='Part') and
// labour services (ItemType='Service'). Workshop managers who own the labour
// catalog have workshop_labour:insert but not parts_spare:insert, so a narrow
// parts_spare gate blocked B&P / GR managers from adding new job/service
// rows. Allow either permission.
router.post('/',     requireAnyPerm(['parts_spare', 'workshop_labour'], 'insert'), itemController.createItem);
router.put( '/:id',  requireAnyPerm(['parts_spare', 'workshop_labour'], 'edit'),   itemController.updateItem);

module.exports = router;
