// Public kiosk routes — mounted BEFORE authMiddleware in server.js so a
// lobby TV can display them without a login. Read-only endpoints only.
const express = require('express');
const router  = express.Router();
const c       = require('../controllers/kioskController');

router.get('/jobs-live', c.getLiveJobs);
// What the lobby TV plays between refreshes of the board, in order
// (owner ask 2026-09-23). Public for the same reason as the board.
router.get('/playlist', require('../controllers/kioskVideoController').getPlaylist);

module.exports = router;
