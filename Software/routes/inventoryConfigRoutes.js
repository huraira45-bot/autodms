const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryConfigController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Categories / brands / uoms / warehouses are reference data used by many
// inventory forms. GETs are broadly allowed; writes require inventory_settings.
const READ_ROLES = [
    'inventory_settings:view', 'parts_spare:view',
    'procurement_grn:view', 'procurement_grtn:view',
    'sales_store:view',     'sales_ssr:view',
    'workshop_parts_issue:view',
];

router.get(   '/categories',     requireAnyAccess(...READ_ROLES),               ctrl.getCategories);
router.post(  '/categories',     requirePerm('inventory_settings', 'insert'),  ctrl.createCategory);
router.delete('/categories/:id', requirePerm('inventory_settings', 'delete'),  ctrl.deleteCategory);

router.get(   '/brands',         requireAnyAccess(...READ_ROLES),               ctrl.getBrands);
router.post(  '/brands',         requirePerm('inventory_settings', 'insert'),  ctrl.createBrand);
router.delete('/brands/:id',     requirePerm('inventory_settings', 'delete'),  ctrl.deleteBrand);

router.get(   '/uoms',           requireAnyAccess(...READ_ROLES),               ctrl.getUOMs);
router.post(  '/uoms',           requirePerm('inventory_settings', 'insert'),  ctrl.createUOM);
router.delete('/uoms/:id',       requirePerm('inventory_settings', 'delete'),  ctrl.deleteUOM);

router.get(   '/warehouses',     requireAnyAccess(...READ_ROLES),               ctrl.getWarehouses);
router.post(  '/warehouses',     requirePerm('inventory_settings', 'insert'),  ctrl.createWarehouse);
router.delete('/warehouses/:id', requirePerm('inventory_settings', 'delete'),  ctrl.deleteWarehouse);

module.exports = router;
