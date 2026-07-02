const express = require('express');
const router = express.Router();
const c = require('../controllers/businessProfileController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');
const { uploadLogo } = require('../middleware/businessProfileUpload');

// GET is broadly readable — every printed doc (Sales Tax Invoice, GRN,
// Work Order, etc.) will eventually read this at render time, so any user
// with a permission that lets them see printed docs should be able to
// hydrate the header. Keep the check permissive.
router.get( '/',       requireAnyAccess('settings_business_profile:view',
                                        'finance_vouchers:view',
                                        'sales_store:view',
                                        'sales_ssr:view',
                                        'procurement_grn:view',
                                        'workshop_jobs:view'),
                       c.get);

router.put( '/',              requirePerm('settings_business_profile', 'edit'), c.update);
router.post('/logo',          requirePerm('settings_business_profile', 'edit'),
                              uploadLogo.single('logo'), c.uploadLogo);
router.delete('/logo',        requirePerm('settings_business_profile', 'edit'), c.deleteLogo);

module.exports = router;
