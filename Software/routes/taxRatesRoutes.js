const express = require('express');
const router = express.Router();
const c = require('../controllers/taxRatesController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Tax rates are read by job-cards (PST/GST display), sales/store forms,
// and procurement forms; written from inventory_settings.
router.get( '/',                  requireAnyAccess(
                                      'inventory_settings:view',
                                      'sales_store:view', 'sales_ssr:view',
                                      'procurement_grn:view', 'procurement_grtn:view',
                                      'workshop_jobs:view',
                                  ), c.getCurrent);
router.get( '/:taxType/history',  requirePerm('inventory_settings', 'view'),  c.getHistory);
router.post('/:taxType',          requirePerm('inventory_settings', 'edit'),  c.changeRate);

module.exports = router;
