const router = require('express').Router();
const c = require('../controllers/bayScreenController');
const { requireBayDevice } = require('../services/bayDevices');

// Bay screens (plan 2026-09-14, Phase 3). Mounted in server.js BEFORE the
// main auth middleware: a bay screen holds a device token, not a user login,
// and requireBayDevice accepts nothing else. The main middleware in turn
// refuses device tokens, so neither can stand in for the other.
router.use(requireBayDevice);

router.get( '/jobs',                   c.getBayJobs);
router.post('/lines/:detailId/start',  c.startLine);
router.post('/lines/:detailId/finish', c.finishLine);
router.post('/lines/:detailId/undo',   c.undoLine);

module.exports = router;
