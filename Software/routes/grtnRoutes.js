const express = require('express');
const router = express.Router();
const grtnController = require('../controllers/grtnController');

router.get('/', grtnController.getGRTNs);
router.post('/', grtnController.saveGRTN);

module.exports = router;
