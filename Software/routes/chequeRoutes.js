const express = require('express');
const router = express.Router();
const c = require('../controllers/chequeController');
const { requireAccess } = require('../middleware/permissions');

router.use(requireAccess('finance_cheques'));

router.get( '/',            c.listCheques);
router.post('/:id/clear',   c.clearCheque);
router.post('/:id/bounce',  c.bounceCheque);
router.post('/:id/revert',  c.revertCheque);

module.exports = router;
