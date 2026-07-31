const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Read is widely used (workshop assigns labour to technicians, sales picks executives, etc.)
router.get(  '/',                  requireAnyAccess(
                                      'hr_employees:view', 'workshop_jobs:view',
                                      'workshop_controller', 'sales_executive',
                                      'sales_agm', 'sales_gm', 'sales_hierarchy',
                                    ), employeeController.getEmployees);

router.post( '/',                  requirePerm('hr_employees', 'insert'), employeeController.createEmployee);
router.put(  '/:id',               requirePerm('hr_employees', 'edit'),   employeeController.updateEmployee);
router.patch('/:id/technician',    requirePerm('hr_employees', 'edit'),   employeeController.toggleTechnician);
router.patch('/:id/reports-to',    requirePerm('hr_employees', 'edit'),   employeeController.setReportsTo);
router.patch('/:id/active',        requirePerm('hr_employees', 'edit'),   employeeController.setActive);
router.patch('/:id/salary-settings', requirePerm('hr_employees', 'edit'), employeeController.setSalarySettings);
router.patch('/:id/payroll-inclusion', requirePerm('hr_employees', 'edit'), employeeController.setPayrollInclusion);

module.exports = router;
