const express = require('express');
const router = express.Router();
const fa = require('../controllers/fixedAssetController');
const { requirePerm } = require('../middleware/permissions');

router.get(  '/candidates',      requirePerm('finance_fixed_assets', 'view'),   fa.listCandidates);
router.get(  '/runs/preview',    requirePerm('finance_fixed_assets', 'view'),   fa.previewRun);
router.get(  '/runs',            requirePerm('finance_fixed_assets', 'view'),   fa.listRuns);
router.post( '/runs',            requirePerm('finance_fixed_assets', 'insert'), fa.createRun);
router.post( '/runs/:id/cancel', requirePerm('finance_fixed_assets', 'edit'),   fa.cancelRun);
router.get(  '/',                requirePerm('finance_fixed_assets', 'view'),   fa.listAssets);
router.post( '/',                requirePerm('finance_fixed_assets', 'insert'), fa.createAsset);
router.patch('/:id',             requirePerm('finance_fixed_assets', 'edit'),   fa.updateAsset);

module.exports = router;
