const express = require('express');
const router = express.Router();
const ssrController = require('../controllers/ssrController');

router.get('/', ssrController.getSSRs);
router.post('/', ssrController.saveSSR);

module.exports = router;
