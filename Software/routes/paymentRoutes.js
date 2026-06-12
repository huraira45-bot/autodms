const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');

router.get('/outstanding/:direction/:partyId', c.getOutstanding);
router.get('/jobcard-balance/:jobCardId', c.getJobCardBalance);
router.get('/recent', c.getRecentForParty);
router.post('/receive', c.receivePayment);
router.post('/make', c.makePayment);

module.exports = router;
