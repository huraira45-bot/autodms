const express = require('express');
const router = express.Router();
const c = require('../controllers/systemAccountsController');
const { requirePerm, requireAnyPerm } = require('../middleware/permissions');

// Read access: needed by both the accounting setup screen AND by voucher-entry
// forms (CPV/CRV/BPV/BRV pre-fill cash / bank accounts). Without finance_vouchers
// view here, non-admin voucher users get a silent 403, row 0 stays empty, and
// the voucher posts with no cash account attached.
router.get('/',                          requireAnyPerm(['accounting_setup', 'finance_vouchers'], 'view'), c.getRoles);
router.get('/:roleKey/posting-count',    requirePerm('accounting_setup', 'view'),  c.getPostingCount);
router.get('/:roleKey/audit',            requirePerm('accounting_setup', 'view'),  c.getAudit);
router.put('/:roleKey',                  requirePerm('accounting_setup', 'edit'),  c.setRole);

module.exports = router;
