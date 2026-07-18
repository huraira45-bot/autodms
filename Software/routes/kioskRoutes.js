// Public kiosk routes — mounted BEFORE authMiddleware in server.js so a
// lobby TV can display them without a login. Read-only endpoints only.
const express = require('express');
const router  = express.Router();
const c       = require('../controllers/kioskController');

router.get('/jobs-live', c.getLiveJobs);

module.exports = router;
