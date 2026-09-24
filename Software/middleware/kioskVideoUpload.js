/**
 * Lobby job-board video upload (owner ask 2026-09-23).
 *
 * Files land in Software/uploads/kiosk-videos/, which sits inside the public
 * /uploads mount on purpose: the lobby TV runs without a login, so it has to
 * be able to fetch them anonymously — the same way it already reads the job
 * data. Nothing private is ever put here.
 *
 * The cap is deliberately tighter than the service tablet's 200 MB. These are
 * promotional clips that sit on the disk forever, not walk-around videos that
 * age out, and this server has run out of disk before.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'kiosk-videos');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 120 * 1024 * 1024;   // 120 MB — a few minutes at 1080p

// MP4 plays on every browser worth putting in a lobby; WEBM and OGG are
// accepted because some editors export them by default.
const ALLOWED = /^video\/(mp4|webm|ogg|quicktime)$/;

const fileFilter = (req, file, cb) => {
    if (!ALLOWED.test(file.mimetype || '')) {
        return cb(new Error(
            `${file.mimetype || 'That file'} will not play on a TV browser. Upload an MP4 (or WEBM/OGG).`));
    }
    cb(null, true);
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        // Keep something recognisable in the name, but never trust it: the
        // stored name is what the public URL exposes.
        const ext = (path.extname(file.originalname || '') || '.mp4').toLowerCase().slice(0, 10);
        const stem = path.basename(file.originalname || 'video', path.extname(file.originalname || ''))
            .replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'video';
        cb(null, `${Date.now()}-${stem}${ext}`);
    },
});

module.exports = {
    UPLOAD_DIR,
    MAX_BYTES,
    single: multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES, files: 1 } }).single('video'),
};
