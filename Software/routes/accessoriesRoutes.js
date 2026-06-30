const express = require('express');
const router = express.Router();
const c = require('../controllers/accessoriesController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Master (accessory catalog) — workshop_accessories module
router.get(   '/master',         requireAnyAccess('workshop_accessories:view', 'workshop_jobs:view'), c.getMaster);
router.get(   '/master/all',     requirePerm('workshop_accessories', 'view'),   c.getAllMaster);
router.post(  '/master',         requirePerm('workshop_accessories', 'insert'), c.saveMaster);
router.put(   '/master/:id',     requirePerm('workshop_accessories', 'edit'),   c.saveMaster);
router.delete('/master/:id',     requirePerm('workshop_accessories', 'delete'), c.deleteMaster);

// Job-card lines — assigning accessories to a JC is a workshop_jobs edit
router.get( '/job-card/:jobCardId',   requirePerm('workshop_jobs', 'view'), c.getForJobCard);
router.post('/job-card/:jobCardId',   requirePerm('workshop_jobs', 'edit'), c.saveForJobCard);

module.exports = router;
