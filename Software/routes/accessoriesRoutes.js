const express = require('express');
const router = express.Router();
const c = require('../controllers/accessoriesController');

router.get('/master', c.getMaster);
router.get('/master/all', c.getAllMaster);
router.post('/master', c.saveMaster);
router.put('/master/:id', c.saveMaster);
router.delete('/master/:id', c.deleteMaster);
router.get('/job-card/:jobCardId', c.getForJobCard);
router.post('/job-card/:jobCardId', c.saveForJobCard);

module.exports = router;
