const express = require('express');
const router = express.Router();
const designationController = require('../controllers/designationController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

router.get(  '/',  requireAnyAccess('hr_settings:view', 'hr_employees:view'), designationController.getDesignations);
router.post( '/',  requirePerm('hr_settings', 'insert'),  designationController.createDesignation);

module.exports = router;
