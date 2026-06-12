const express = require('express');
const router = express.Router();
const c = require('../controllers/taxRatesController');

router.get('/', c.getCurrent);
router.get('/:taxType/history', c.getHistory);
router.post('/:taxType', c.changeRate);

module.exports = router;
