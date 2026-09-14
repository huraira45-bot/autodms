const express = require('express');
const router = express.Router();
const c = require('../controllers/serviceIntakeController');
const { requireAccess } = require('../middleware/permissions');
const { uploadDiagnostic, withUploadErrors } = require('../middleware/serviceMediaUpload');

// Service tablet app. The public reachability check (/ping) is registered in
// server.js ahead of the auth middleware; everything here needs a signed-in
// user holding workshop_tablet.
//
// The permission check runs BEFORE multer, so an unauthorised request is
// refused before a single byte of video is written to disk.
router.post('/diagnostics/upload',
    requireAccess('workshop_tablet'),
    withUploadErrors(uploadDiagnostic.single('video')),
    c.diagnosticsUpload);

module.exports = router;
