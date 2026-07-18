const express = require('express');
const router  = express.Router();
const c       = require('../controllers/charityController');
const { requireAccess } = require('../middleware/permissions');

// Both endpoints gated on the new workflow permission `charity_view`.
const canView = requireAccess('charity_view');

router.get('/entries', canView, c.listEntries);
router.get('/summary', canView, c.summary);

module.exports = router;
