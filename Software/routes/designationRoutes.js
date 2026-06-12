const express = require('express');
const router = express.Router();
const designationController = require('../controllers/designationController');

router.get('/', designationController.getDesignations);
router.post('/', designationController.createDesignation);

module.exports = router;
