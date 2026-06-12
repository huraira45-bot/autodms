const express = require('express');
const router = express.Router();
const grnController = require('../controllers/grnController');

router.get('/', grnController.getGRNs);
router.post('/', grnController.uploadMiddleware, grnController.saveGRN);

module.exports = router;
