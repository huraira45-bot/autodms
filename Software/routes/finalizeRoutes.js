const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/finalizeController');
const { requireAccess, requireAnyAccess } = require('../middleware/permissions');

router.use(auth);

router.post('/:entity/:id',                          requireAccess('finalize'),         c.finalize);
router.get( '/:entity/:id/downstream-refs',          requireAnyAccess('finalize','am_approve','admin_unfinalize'), c.checkDownstreamRefs);
router.post('/:entity/:id/request-unfinalize',       requireAccess('finalize'),         c.requestUnfinalize);
router.get( '/requests',                             requireAnyAccess('finalize','am_approve','admin_unfinalize'), c.getRequests);
router.put( '/requests/:requestId/am-approve',       requireAccess('am_approve'),       c.amApprove);
router.put( '/requests/:requestId/reject',           requireAnyAccess('am_approve','admin_unfinalize'), c.reject);
router.put( '/requests/:requestId/admin-unfinalize', requireAccess('admin_unfinalize'), c.adminUnfinalize);

module.exports = router;
