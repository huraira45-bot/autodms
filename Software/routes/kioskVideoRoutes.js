/**
 * Managing the videos the lobby job board plays (owner ask 2026-09-23).
 *
 * Mounted behind authMiddleware. What the TV itself reads is the anonymous
 * /api/kiosk/playlist in kioskRoutes — the lobby screen has no login.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/kioskVideoController');
const upload = require('../middleware/kioskVideoUpload');
const { requireAccess } = require('../middleware/permissions');

// The permission is checked BEFORE multer, so an unauthorised upload is
// refused before a single byte of a 120 MB file reaches the disk.
const withUploadErrors = (mw) => (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
        error: tooBig
            ? `That video is larger than ${Math.round(upload.MAX_BYTES / 1024 / 1024)} MB. Shorten it or export it smaller.`
            : err.message,
    });
});

router.get(   '/',         requireAccess('workshop_kiosk_videos:view'),   c.list);
router.post(  '/',         requireAccess('workshop_kiosk_videos:insert'),
                           withUploadErrors(upload.single),               c.upload);
router.put(   '/order',    requireAccess('workshop_kiosk_videos:edit'),   c.reorder);
router.put(   '/settings', requireAccess('workshop_kiosk_videos:edit'),   c.saveSettings);
router.patch( '/:id',      requireAccess('workshop_kiosk_videos:edit'),   c.update);
router.delete('/:id',      requireAccess('workshop_kiosk_videos:delete'), c.remove);

module.exports = router;
