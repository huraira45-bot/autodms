const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// GET is also needed by CPV/BPV/JV voucher entry (department tagging for
// reporting — owner ask 2026-08-01), not just the HR module.
router.get(  '/',              requireAnyAccess('hr_settings:view', 'hr_employees:view', 'finance_vouchers:view'), departmentController.getDepartments);
router.post( '/',              requirePerm('hr_settings', 'insert'),   departmentController.createDepartment);
router.patch('/:id/manager',   requirePerm('hr_settings', 'edit'),     departmentController.setDepartmentManager);

module.exports = router;
