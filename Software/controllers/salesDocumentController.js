/**
 * Sales Document upload — non-payment docs (PBO, CNIC, AuthorityLetter, Other).
 *
 * Source spec: .claude/planning/sales-module-design.md §17.
 *
 * ProofOfPayment is handled by the payment endpoint (multipart). This controller
 * handles the other doc types that attach to a booking but not a specific payment.
 *
 * Required-doc gates (used by allocation, gate-pass, etc.):
 *   - bookingHasDocOfType(bookingId, docType) → bool
 *   - missingRequiredDocs(bookingId, requiredTypes[]) → string[] of missing types
 */
const path = require('path');
const { sql, getPool } = require('../config/db');

const VALID_DOC_TYPES = new Set(['ProofOfPayment', 'PBO', 'CNIC', 'AuthorityLetter', 'Other']);

// GET /api/sales/bookings/:id/documents
exports.listForBooking = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id).query(`
            SELECT DocumentID, DocType, Description, FilePath, OriginalFileName, MimeType, SizeBytes,
                   LinkedPaymentID, UploadedAt, UploadedByName,
                   DeletedAt, DeletedByName, DeleteReason
            FROM dms_SalesDocuments
            WHERE BookingID = @id AND DeletedAt IS NULL
            ORDER BY UploadedAt DESC
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/bookings/:id/documents  (multipart) — field 'file' + DocType + Description
exports.upload = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const b = req.body || {};
        const docType = b.DocType;
        const description = (b.Description || '').trim();

        if (!VALID_DOC_TYPES.has(docType)) return res.status(400).json({ error: `DocType must be one of: ${[...VALID_DOC_TYPES].join(', ')}` });
        if (description.length < 5) return res.status(400).json({ error: 'Description is required (min 5 chars).' });
        if (!req.file) return res.status(400).json({ error: 'File is required (field name: "file").' });

        const pool = await getPool();
        const bkExists = await pool.request().input('id', sql.Int, bookingId)
            .query(`SELECT BookingID FROM dms_SalesBookings WHERE BookingID=@id`);
        if (!bkExists.recordset.length) return res.status(404).json({ error: 'Booking not found' });

        const relPath = `uploads/sales/${path.basename(req.file.path)}`;
        const r = await pool.request()
            .input('dt', sql.NVarChar(40), docType)
            .input('desc', sql.NVarChar(500), description)
            .input('fp', sql.NVarChar(500), relPath)
            .input('orig', sql.NVarChar(255), req.file.originalname)
            .input('mime', sql.NVarChar(100), req.file.mimetype)
            .input('sz', sql.BigInt, req.file.size)
            .input('bid', sql.Int, bookingId)
            .input('emp', sql.Int, req.user?.employeeId || null)
            .input('empN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_SalesDocuments
                        (DocType, Description, FilePath, OriginalFileName, MimeType, SizeBytes,
                         BookingID, UploadedByEmployeeID, UploadedByName)
                    OUTPUT INSERTED.DocumentID
                    VALUES (@dt, @desc, @fp, @orig, @mime, @sz, @bid, @emp, @empN)`);
        res.status(201).json({ message: 'Document uploaded', DocumentID: r.recordset[0].DocumentID, FilePath: relPath });
    } catch (err) {
        console.error('document upload:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/sales/bookings/:id/documents/:docId  — soft delete
exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.docId);
        const reason = req.body?.Reason?.trim() || null;
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('emp', sql.Int, req.user?.employeeId || null)
            .input('empN', sql.NVarChar(100), req.user?.userName || null)
            .input('r', sql.NVarChar(sql.MAX), reason)
            .query(`UPDATE dms_SalesDocuments
                    SET DeletedAt=GETDATE(), DeletedByEmployeeID=@emp, DeletedByName=@empN, DeleteReason=@r
                    OUTPUT INSERTED.DocumentID
                    WHERE DocumentID=@id AND DeletedAt IS NULL`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Document not found or already deleted' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// Internal: check if a booking has at least one document of the given type
exports.bookingHasDocOfType = async function (executor, bookingId, docType) {
    const r = await executor.request()
        .input('b', sql.Int, bookingId)
        .input('t', sql.NVarChar(40), docType)
        .query(`SELECT TOP 1 DocumentID FROM dms_SalesDocuments
                WHERE BookingID=@b AND DocType=@t AND DeletedAt IS NULL`);
    return r.recordset.length > 0;
};

// Internal: returns array of missing required doc types
exports.missingRequiredDocs = async function (executor, bookingId, requiredTypes) {
    const missing = [];
    for (const t of requiredTypes) {
        const has = await exports.bookingHasDocOfType(executor, bookingId, t);
        if (!has) missing.push(t);
    }
    return missing;
};
