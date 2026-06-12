const express = require('express');
const router = express.Router();
const cc = require('../controllers/careOffController');

router.get('/', cc.getCareOffs);
router.get('/active', cc.getActiveCareOffs);
router.get('/audit', cc.getAuditLog);
router.post('/', cc.saveCareOff);
router.put('/:id', cc.saveCareOff);
router.delete('/:id', cc.deleteCareOff);

module.exports = router;
