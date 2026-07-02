/**
 * Business Profile logo upload — multer storage.
 * Files land under Software/uploads/business/. Only one logo per company,
 * but we keep the previous file on disk (audit) and just point LogoPath
 * at the newest one.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'business');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/[^\w.\-]/g, '_');
        cb(null, `${Date.now()}_${safe}`);
    },
});

const fileFilter = (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|svg\+xml)$/.test(file.mimetype);
    if (!ok) return cb(new Error(`Logo must be JPG, PNG, WEBP, or SVG. Got ${file.mimetype}.`));
    cb(null, true);
};

exports.uploadLogo = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB is plenty for a logo
});

exports.UPLOAD_DIR = UPLOAD_DIR;
