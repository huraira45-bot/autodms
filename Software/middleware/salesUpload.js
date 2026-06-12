/**
 * Sales document upload — multer storage for proof-of-payment, PBO, CNIC, etc.
 * Files land under Software/uploads/sales/.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'sales');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/[^\w.\-]/g, '_');
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
    },
});

// Limit to common image formats + PDFs (proof-of-payment is usually a scan/photo)
const fileFilter = (req, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(file.mimetype);
    if (!ok) return cb(new Error(`File type ${file.mimetype} not allowed. Use JPG/PNG/WEBP/PDF.`));
    cb(null, true);
};

exports.uploadSalesDoc = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB
});

exports.UPLOAD_DIR = UPLOAD_DIR;
