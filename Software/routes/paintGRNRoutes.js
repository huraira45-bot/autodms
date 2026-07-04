/**
 * Paint GRN — routes (Phase 1).
 * Read broad, write narrow to `paint_lab_grn` sub-perms.
 * Unfinalize is admin-only (existing convention shared with GRN/GRTN).
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/paintGRNController');
const { requirePerm } = require('../middleware/permissions');

router.get(   '/',                requirePerm('paint_lab_grn', 'view'),   c.list);
router.get(   '/:id',             requirePerm('paint_lab_grn', 'view'),   c.get);
router.get(   '/:id/print-data',  requirePerm('paint_lab_grn', 'view'),   c.printData);

router.post(  '/',                requirePerm('paint_lab_grn', 'insert'), c.create);
router.put(   '/:id',             requirePerm('paint_lab_grn', 'edit'),   c.update);
router.delete('/:id',             requirePerm('paint_lab_grn', 'delete'), c.remove);

router.post(  '/:id/finalize',    requirePerm('paint_lab_grn', 'edit'),   c.finalize);
router.post(  '/:id/unfinalize',  requirePerm('admin_unfinalize','view'), c.unfinalize);

module.exports = router;
