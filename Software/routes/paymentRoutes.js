const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');
const { requireAccess } = require('../middleware/permissions');

// Payments is a workflow-style module; single 'access' grant covers all routes.
router.use(requireAccess('payments'));

router.get( '/outstanding/:direction/:partyId', c.getOutstanding);
router.get( '/jobcard-balance/:jobCardId',      c.getJobCardBalance);
router.get( '/storesale-balance/:saleId',       c.getStoreSaleBalance);
router.get( '/recent',                          c.getRecentForParty);
router.post('/receive',                         c.receivePayment);
router.post('/make',                            c.makePayment);

module.exports = router;
