const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

router.get(  '/',              requireAnyAccess('hr_settings:view', 'hr_employees:view'), departmentController.getDepartments);
router.post( '/',              requirePerm('hr_settings', 'insert'),   departmentController.createDepartment);
router.patch('/:id/manager',   requirePerm('hr_settings', 'edit'),     departmentController.setDepartmentManager);

module.exports = router;
