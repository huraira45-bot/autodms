/**
 * Multer middleware for CRO file uploads.
 *
 * - Path: Software/uploads/cro/complaint-{id}/{timestamp}-{sanitized-name}
 * - Limits: 5MB per file (workshop phones produce ~1–2MB typical)
 * - Types: images only by default (WhatsApp screenshots); 'cro_doc' use accepts PDF.
 *
 * Source contract: .claude/planning/cro-module-design.md §11.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'cro');

const sanitize = (name) =>
    String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);

const complaintDirOf = (req) => {
    const id = parseInt(req.params.id);
    if (!id || Number.isNaN(id)) throw new Error('complaintDirOf: invalid complaint id in route');
    const dir = path.join(UPLOADS_ROOT, `complaint-${id}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const imageStorage = multer.diskStorage({
    destination: (req, _file, cb) => {
        try { cb(null, complaintDirOf(req)); }
        catch (e) { cb(e); }
    },
    filename: (_req, file, cb) => {
        const ts = Date.now();
        cb(null, `${ts}-${sanitize(file.originalname || 'upload')}`);
    },
});

const imageFilter = (_req, file, cb) => {
    const ok = /^image\/(jpe?g|png|webp)$/.test(file.mimetype || '');
    if (!ok) return cb(new Error('Only JPEG / PNG / WebP image files are allowed.'));
    cb(null, true);
};

const uploadComplaintImage = multer({
    storage: imageStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 },     // 5 MB
});

module.exports = {
    uploadComplaintImage,
    UPLOADS_ROOT,
    complaintDirOf,
};
