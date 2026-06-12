const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');

router.get('/', departmentController.getDepartments);
router.post('/', departmentController.createDepartment);
router.patch('/:id/manager', departmentController.setDepartmentManager);

module.exports = router;
