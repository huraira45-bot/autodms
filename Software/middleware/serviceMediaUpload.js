/**
 * Service tablet media upload — walk-around videos and photos taken at
 * vehicle reception (service tablet app, plan 2026-09-14).
 *
 * Files land under Software/uploads/service-media/. Diagnostics uploads go to
 * a separate _diagnostics/ folder and are deleted as soon as they have been
 * measured.
 *
 * Videos are large — roughly 100 MB a minute at 1080p — so the cap is far
 * above the 10 MB used for sales documents. The server has run out of disk
 * before, so nothing uploaded as a diagnostic is ever kept.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'service-media');
const DIAG_DIR   = path.join(UPLOAD_DIR, '_diagnostics');
for (const dir of [UPLOAD_DIR, DIAG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MAX_BYTES = 200 * 1024 * 1024;   // 200 MB

// Android camera apps record MP4 or 3GPP; some devices produce WEBM or
// QuickTime. Photos are allowed for the later intake screens.
const ALLOWED = /^(video\/(mp4|3gpp|3gpp2|webm|quicktime|x-matroska)|image\/(jpeg|png|webp))$/;

const fileFilter = (req, file, cb) => {
    if (!ALLOWED.test(file.mimetype || '')) {
        return cb(new Error(
            `File type ${file.mimetype || 'unknown'} is not allowed. Record an MP4, 3GP or WEBM video, or a JPG/PNG photo.`));
    }
    cb(null, true);
};

const storageIn = (dir) => multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
        const safe = (file.originalname || 'media').replace(/[^\w.\-]/g, '_');
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
    },
});

exports.uploadServiceMedia = multer({ storage: storageIn(UPLOAD_DIR), fileFilter, limits: { fileSize: MAX_BYTES } });
exports.uploadDiagnostic   = multer({ storage: storageIn(DIAG_DIR),   fileFilter, limits: { fileSize: MAX_BYTES } });

/**
 * Wraps a multer middleware so a rejected upload comes back as JSON the
 * tablet can show, rather than Express's default HTML error page.
 */
exports.withUploadErrors = (mw) => (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
        error: tooBig ? `File is larger than ${MAX_BYTES / 1048576} MB.` : err.message,
    });
});

exports.UPLOAD_DIR = UPLOAD_DIR;
exports.MAX_BYTES  = MAX_BYTES;
