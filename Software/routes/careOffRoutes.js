const express = require('express');
const router = express.Router();
const cc = require('../controllers/careOffController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

router.get(   '/',         requireAnyAccess('workshop_careoff:view', 'workshop_jobs:view'), cc.getCareOffs);
router.get(   '/active',   requireAnyAccess('workshop_careoff:view', 'workshop_jobs:view'), cc.getActiveCareOffs);
router.get(   '/audit',    requirePerm('workshop_careoff', 'view'),     cc.getAuditLog);
router.post(  '/',         requirePerm('workshop_careoff', 'insert'),   cc.saveCareOff);
router.put(   '/:id',      requirePerm('workshop_careoff', 'edit'),     cc.saveCareOff);
router.delete('/:id',      requirePerm('workshop_careoff', 'delete'),   cc.deleteCareOff);

module.exports = router;
