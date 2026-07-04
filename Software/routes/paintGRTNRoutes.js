/**
 * Paint GRTN — routes (Phase 2). Mounted at /api/paint/grtn.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/paintGRTNController');
const { requirePerm } = require('../middleware/permissions');

router.get(   '/',                    requirePerm('paint_lab_grtn', 'view'),   c.list);
router.get(   '/sources',             requirePerm('paint_lab_grtn', 'view'),   c.sourcesForSupplier);
router.get(   '/sources/:sourceGrnId/lines', requirePerm('paint_lab_grtn','view'), c.returnableLines);
router.get(   '/:id',                 requirePerm('paint_lab_grtn', 'view'),   c.get);
router.get(   '/:id/print-data',      requirePerm('paint_lab_grtn', 'view'),   c.printData);

router.post(  '/',                    requirePerm('paint_lab_grtn', 'insert'), c.create);
router.put(   '/:id',                 requirePerm('paint_lab_grtn', 'edit'),   c.update);
router.delete('/:id',                 requirePerm('paint_lab_grtn', 'delete'), c.remove);

router.post(  '/:id/finalize',        requirePerm('paint_lab_grtn', 'edit'),   c.finalize);
router.post(  '/:id/unfinalize',      requirePerm('admin_unfinalize','view'),  c.unfinalize);

module.exports = router;
