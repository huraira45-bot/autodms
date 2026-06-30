const express = require('express');
const router = express.Router();
const c = require('../controllers/posSettlementController');
const { requireAccess } = require('../middleware/permissions');

// POS settlement is part of the payments workflow
router.use(requireAccess('payments'));

router.get( '/pending', c.getPending);
router.get( '/recent',  c.getRecent);
router.post('/',        c.postSettlement);

module.exports = router;
