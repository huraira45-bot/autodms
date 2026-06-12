const express = require('express');
const router = express.Router();
const partyController = require('../controllers/partyController');

router.get('/',                  partyController.getParties);
router.post('/',                 partyController.createParty);
router.get('/groups',            partyController.getPartyGroups);
router.get('/control-account',   partyController.previewControlAccount);
router.get('/:id',               partyController.getParty);
router.put('/:id',               partyController.updateParty);

module.exports = router;
