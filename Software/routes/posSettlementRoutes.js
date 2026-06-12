const express = require('express');
const router = express.Router();
const c = require('../controllers/posSettlementController');

router.get('/pending', c.getPending);
router.get('/recent', c.getRecent);
router.post('/', c.postSettlement);

module.exports = router;
