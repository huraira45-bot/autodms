/**
 * CRO complaint attachments controller — WhatsApp screenshots + photos + docs.
 *
 * Source contract: .claude/planning/cro-module-design.md §11.
 *
 * Upload pipeline: multer (see middleware/croUpload.js) writes the file to
 * uploads/cro/complaint-{id}/{timestamp}-{name}, then this controller records
 * the metadata in dms_CRO_Attachments and writes a WhatsAppProof action.
 */
const path = require('path');
const fs = require('fs');
const { sql, getPool } = require('../config/db');

// POST /api/cro/complaints/:id/attachments
exports.upload = async (req, res) => {
    try {
        const complaintId = parseInt(req.params.id);
        if (!req.file) return res.status(400).json({ error: 'No file received.' });

        const attachmentType = (req.body.AttachmentType || 'WhatsAppScreenshot');
        const description = req.body.Description || null;

        // Path stored relative to uploads/cro/ root
        const relPath = path.join(`complaint-${complaintId}`, req.file.filename).replace(/\\/g, '/');

        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            // Verify complaint exists
            const exists = await new sql.Request(transaction).input('id', sql.Int, complaintId)
                .query(`SELECT ComplaintID FROM dms_CRO_Complaints WHERE ComplaintID=@id`);
            if (!exists.recordset.length) {
                await transaction.rollback();
                fs.unlink(req.file.path, () => {}); // best-effort delete
                return res.status(404).json({ error: 'Complaint not found' });
            }

            const ins = await new sql.Request(transaction)
                .input('cid',    sql.Int,           complaintId)
                .input('type',   sql.NVarChar(30),  attachmentType)
                .input('path',   sql.NVarChar(500), relPath)
                .input('orig',   sql.NVarChar(300), req.file.originalname || null)
                .input('mime',   sql.NVarChar(100), req.file.mimetype || null)
                .input('size',   sql.Int,           req.file.size || null)
                // UploadedByEmployeeID FK to gen_EmployeeInfo — must be employeeId, not userId.
                .input('uby',    sql.Int,           req.user?.employeeId || null)
                .input('ubyN',   sql.NVarChar(100), req.user?.userName || null)
                .input('desc',   sql.NVarChar(500), description)
                .query(`INSERT INTO dms_CRO_Attachments
                            (ComplaintID, AttachmentType, FilePath, OriginalFileName, MimeType, SizeBytes,
                             UploadedByEmployeeID, UploadedByName, Description)
                        OUTPUT INSERTED.AttachmentID
                        VALUES (@cid, @type, @path, @orig, @mime, @size, @uby, @ubyN, @desc)`);
            const attachmentId = ins.recordset[0].AttachmentID;

            // Audit row — WhatsAppProof action preserves the trail even if file is later deleted
            if (attachmentType === 'WhatsAppScreenshot') {
                await new sql.Request(transaction)
                    .input('cid',   sql.Int,           complaintId)
                    .input('type',  sql.NVarChar(30),  'WhatsAppProof')
                    // PerformedByEmployeeID FK to gen_EmployeeInfo — must be employeeId.
                    .input('emp',   sql.Int,           req.user?.employeeId || null)
                    .input('empN',  sql.NVarChar(100), req.user?.userName || null)
                    .input('notes', sql.NVarChar(sql.MAX), `Uploaded: ${req.file.originalname || relPath}`)
                    .query(`INSERT INTO dms_CRO_ComplaintActions
                                (ComplaintID, ActionType, PerformedByEmployeeID, PerformedByName, Notes)
                            VALUES (@cid, @type, @emp, @empN, @notes)`);
            }

            await transaction.commit();
            res.status(201).json({
                message: 'Attachment uploaded',
                AttachmentID: attachmentId,
                FilePath: relPath,
                SizeBytes: req.file.size
            });
        } catch (err) {
            await transaction.rollback();
            fs.unlink(req.file.path, () => {});
            throw err;
        }
    } catch (err) {
        console.error('CRO attachment upload:', err);
        res.status(400).json({ error: err.message });
    }
};

// GET /api/cro/complaints/:id/attachments/:attId/download
exports.download = async (req, res) => {
    try {
        const attachmentId = parseInt(req.params.attId);
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, attachmentId)
            .query(`SELECT FilePath, OriginalFileName, MimeType, DeletedAt
                    FROM dms_CRO_Attachments WHERE AttachmentID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Attachment not found' });
        if (r.recordset[0].DeletedAt) return res.status(410).json({ error: 'Attachment deleted' });

        const full = path.join(__dirname, '..', 'uploads', 'cro', r.recordset[0].FilePath);
        if (!fs.existsSync(full)) return res.status(404).json({ error: 'File missing on disk' });

        res.setHeader('Content-Type', r.recordset[0].MimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition',
            `inline; filename="${r.recordset[0].OriginalFileName || 'attachment'}"`);
        fs.createReadStream(full).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/cro/complaints/:id/attachments/:attId — soft delete (file moved to _deleted)
exports.softDelete = async (req, res) => {
    try {
        const attachmentId = parseInt(req.params.attId);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, attachmentId)
            .query(`SELECT FilePath, DeletedAt FROM dms_CRO_Attachments WHERE AttachmentID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Attachment not found' });
        if (r.recordset[0].DeletedAt) return res.status(409).json({ error: 'Already deleted' });

        const src = path.join(__dirname, '..', 'uploads', 'cro', r.recordset[0].FilePath);
        const dstDir = path.join(__dirname, '..', 'uploads', 'cro', '_deleted');
        fs.mkdirSync(dstDir, { recursive: true });
        const dst = path.join(dstDir, `${Date.now()}-${path.basename(src)}`);

        await pool.request()
            .input('id', sql.Int, attachmentId)
            // DeletedByEmployeeID FK to gen_EmployeeInfo — must be employeeId.
            .input('uby', sql.Int, req.user?.employeeId || null)
            .query(`UPDATE dms_CRO_Attachments
                    SET DeletedAt=GETDATE(), DeletedByEmployeeID=@uby
                    WHERE AttachmentID=@id`);

        if (fs.existsSync(src)) fs.renameSync(src, dst);
        res.json({ message: 'Attachment soft-deleted.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
