const express = require('express');
const router = express.Router();
const c = require('../controllers/systemAccountsController');
const { requirePerm } = require('../middleware/permissions');

router.get('/',                          requirePerm('accounting_setup', 'view'),  c.getRoles);
router.get('/:roleKey/posting-count',    requirePerm('accounting_setup', 'view'),  c.getPostingCount);
router.get('/:roleKey/audit',            requirePerm('accounting_setup', 'view'),  c.getAudit);
router.put('/:roleKey',                  requirePerm('accounting_setup', 'edit'),  c.setRole);

module.exports = router;
