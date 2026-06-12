const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');

// GET /api/employees - Fetch all active employees (Via View)
router.get('/', employeeController.getEmployees);

// POST /api/employees - Create a new employee (Via Stored Procedure)
router.post('/', employeeController.createEmployee);

// PATCH /api/employees/:id/technician - Toggle IsTechnician flag
router.patch('/:id/technician', employeeController.toggleTechnician);
router.patch('/:id/reports-to', employeeController.setReportsTo);
router.patch('/:id/active',     employeeController.setActive);

module.exports = router;
