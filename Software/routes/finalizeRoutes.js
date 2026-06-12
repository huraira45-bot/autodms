const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/finalizeController');

router.use(auth);

router.post('/:entity/:id',                       c.finalize);
router.get('/:entity/:id/downstream-refs',        c.checkDownstreamRefs);
router.post('/:entity/:id/request-unfinalize',    c.requestUnfinalize);
router.get('/requests',                           c.getRequests);
router.put('/requests/:requestId/am-approve',     c.amApprove);
router.put('/requests/:requestId/reject',         c.reject);
router.put('/requests/:requestId/admin-unfinalize', c.adminUnfinalize);

module.exports = router;
