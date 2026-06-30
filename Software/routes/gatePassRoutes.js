const express = require('express');
const router = express.Router();
const c = require('../controllers/gatePassController');
const auth = require('../middleware/auth');
const { requirePerm } = require('../middleware/permissions');

router.use(auth);

router.get( '/check',       requirePerm('workshop_gatepass', 'view'),   c.check);
router.get( '/',            requirePerm('workshop_gatepass', 'view'),   c.list);
router.get( '/:id',         requirePerm('workshop_gatepass', 'view'),   c.getOne);
router.post('/issue',       requirePerm('workshop_gatepass', 'insert'), c.issue);
router.post('/:id/revoke',  requirePerm('workshop_gatepass', 'delete'), c.revoke);

module.exports = router;
