const express = require('express');
const router = express.Router();
const c = require('../controllers/systemAccountsController');

router.get('/', c.getRoles);
router.get('/:roleKey/posting-count', c.getPostingCount);
router.get('/:roleKey/audit', c.getAudit);
router.put('/:roleKey', c.setRole);

module.exports = router;
