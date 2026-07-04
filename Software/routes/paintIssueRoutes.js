/**
 * Paint Issue — routes (Phase 3). Mounted at /api/paint/issue.
 * There's no finalize/unfinalize endpoint here — those are triggered
 * indirectly by the linked Job Card's finalize/unfinalize workflow.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/paintIssueController');
const { requirePerm } = require('../middleware/permissions');

router.get(   '/eligible-jobs',   requirePerm('paint_lab_issue', 'view'),   c.eligibleJobs);
router.get(   '/',                requirePerm('paint_lab_issue', 'view'),   c.list);
router.get(   '/:id',             requirePerm('paint_lab_issue', 'view'),   c.get);
router.get(   '/:id/print-data',  requirePerm('paint_lab_issue', 'view'),   c.printData);

router.post(  '/',                requirePerm('paint_lab_issue', 'insert'), c.create);
router.put(   '/:id',             requirePerm('paint_lab_issue', 'edit'),   c.update);
router.delete('/:id',             requirePerm('paint_lab_issue', 'delete'), c.remove);

module.exports = router;
