/**
 * CRO Inquiries (cro-module-design.md §16).
 *
 * Walk-in / phone / online inquiries — questions, parts price-checks, accessory
 * curiosity, service-bay availability questions. Captured BEFORE a JC or a
 * complaint exists. Convertable to either later.
 *
 * Routing: category → department defaults (assumed):
 *   ServiceQuery     → After Sale
 *   PartsPriceCheck  → Parts
 *   AccessoryQuery   → Accessories
 *   ProductInfo      → Sales
 *   Complaint        → CRO (convert to complaint immediately)
 *   Other            → CRO triage
 */
const { sql, getPool } = require('../config/db');
const { createComplaint } = require('../services/croComplaintService');

const VALID_CATEGORIES = new Set([
    'ServiceQuery', 'PartsPriceCheck', 'AccessoryQuery',
    'ProductInfo', 'Complaint', 'Other',
]);
const VALID_SOURCES = new Set(['Phone', 'WalkIn', 'Online', 'WhatsApp', 'Email']);
const VALID_STATUSES = new Set(['Open', 'InProgress', 'Resolved', 'Closed', 'Converted']);

// Lightweight category → department mapping. Falls back to NULL when no match.
async function routeForCategory(pool, category) {
    const map = {
        ServiceQuery:    ['%After Sale%', '%Service%'],
        PartsPriceCheck: ['%Parts%'],
        AccessoryQuery:  ['%Accessor%', '%Parts%'],
        ProductInfo:     ['%Sales%'],
        Complaint:       ['%Customer Relations%', '%CRO%'],
        Other:           ['%Customer Relations%'],
    };
    const patterns = map[category] || ['%'];
    for (const p of patterns) {
        const r = await pool.request().input('p', sql.NVarChar(100), p)
            .query(`SELECT TOP 1 DepartmentID, ManagerEmployeeID FROM gen_DepartmentInfo WHERE DepartmentName LIKE @p`);
        if (r.recordset.length) return { AssignedDepartmentID: r.recordset[0].DepartmentID, AssignedEmployeeID: r.recordset[0].ManagerEmployeeID };
    }
    return { AssignedDepartmentID: null, AssignedEmployeeID: null };
}

// GET /api/cro/inquiries?status=&category=&search=
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status)   { r.input('s', sql.NVarChar(20), req.query.status); conds.push('i.Status=@s'); }
        if (req.query.category) { r.input('c', sql.NVarChar(30), req.query.category); conds.push('i.Category=@c'); }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(i.Subject LIKE @q OR i.ContactName LIKE @q OR i.ContactPhone LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT i.InquiryID, i.Category, i.Source, i.Subject, i.Body,
                   i.ContactName, i.ContactPhone, i.ContactEmail,
                   i.CustomerProfileID, i.AssignedDepartmentID, d.DepartmentName,
                   i.AssignedEmployeeID, e.EmployeeName AS AssignedEmployeeName,
                   i.Status, i.LinkedJobCardID, j.JobCardNo AS LinkedJobCardNo,
                   i.LinkedComplaintID, c.ComplaintNo AS LinkedComplaintNo,
                   i.OpenedAt, i.ClosedAt, i.CreatedByName,
                   DATEDIFF(HOUR, i.OpenedAt, GETDATE()) AS AgeHours
            FROM dms_CRO_Inquiries i
            LEFT JOIN gen_DepartmentInfo d ON i.AssignedDepartmentID = d.DepartmentID
            LEFT JOIN gen_EmployeeInfo   e ON i.AssignedEmployeeID = e.EmployeeID
            LEFT JOIN Addata_JobCardInfo j ON i.LinkedJobCardID = j.JobCardId
            LEFT JOIN dms_CRO_Complaints c ON i.LinkedComplaintID = c.ComplaintID
            ${where}
            ORDER BY
                CASE i.Status WHEN 'Open' THEN 0 WHEN 'InProgress' THEN 1 ELSE 2 END,
                i.OpenedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/inquiries { Category, Source, Subject, Body, ContactName, ContactPhone, ContactEmail?, CustomerProfileID? }
exports.create = async (req, res) => {
    try {
        const b = req.body || {};
        const errors = [];
        if (!VALID_CATEGORIES.has(b.Category)) errors.push(`Category must be one of ${[...VALID_CATEGORIES].join(', ')}`);
        if (!VALID_SOURCES.has(b.Source))      errors.push(`Source must be one of ${[...VALID_SOURCES].join(', ')}`);
        if (!b.Subject?.trim())                errors.push('Subject is required.');
        if (!b.ContactName?.trim())            errors.push('ContactName is required.');
        if (!b.ContactPhone?.trim())           errors.push('ContactPhone is required.');
        if (errors.length) return res.status(400).json({ error: errors.join(' ') });

        const pool = await getPool();
        const routing = await routeForCategory(pool, b.Category);

        const r = await pool.request()
            .input('cat', sql.NVarChar(30),  b.Category)
            .input('src', sql.NVarChar(30),  b.Source)
            .input('sub', sql.NVarChar(500), b.Subject.trim())
            .input('bod', sql.NVarChar(sql.MAX), b.Body || null)
            .input('cn',  sql.NVarChar(200), b.ContactName.trim())
            .input('cp',  sql.NVarChar(50),  b.ContactPhone.trim())
            .input('ce',  sql.NVarChar(200), b.ContactEmail || null)
            .input('prof', sql.Int,          b.CustomerProfileID || null)
            .input('dpt', sql.Int,           routing.AssignedDepartmentID)
            .input('emp', sql.Int,           routing.AssignedEmployeeID)
            .input('cby', sql.Int,           req.user?.userId || null)
            .input('cbyN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_CRO_Inquiries
                        (Category, Source, Subject, Body, ContactName, ContactPhone, ContactEmail,
                         CustomerProfileID, AssignedDepartmentID, AssignedEmployeeID,
                         Status, OpenedAt, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.InquiryID
                    VALUES (@cat, @src, @sub, @bod, @cn, @cp, @ce, @prof, @dpt, @emp,
                            'Open', GETDATE(), @cby, @cbyN)`);
        res.status(201).json({ message: 'Inquiry created', InquiryID: r.recordset[0].InquiryID, AssignedDepartmentID: routing.AssignedDepartmentID });
    } catch (err) {
        console.error('Inquiry create:', err);
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/cro/inquiries/:id { Status?, AssignedEmployeeID?, AssignedDepartmentID?, Body? }
exports.update = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        if (b.Status && !VALID_STATUSES.has(b.Status)) return res.status(400).json({ error: 'Invalid Status' });

        const pool = await getPool();
        const r = pool.request().input('id', sql.Int, id);
        const sets = [];
        if (b.Status !== undefined)               { r.input('s', sql.NVarChar(20), b.Status); sets.push('Status=@s');
            if (b.Status === 'Closed' || b.Status === 'Resolved') sets.push('ClosedAt = COALESCE(ClosedAt, GETDATE())');
        }
        if (b.AssignedEmployeeID !== undefined)   { r.input('emp', sql.Int, b.AssignedEmployeeID || null); sets.push('AssignedEmployeeID=@emp'); }
        if (b.AssignedDepartmentID !== undefined) { r.input('dpt', sql.Int, b.AssignedDepartmentID || null); sets.push('AssignedDepartmentID=@dpt'); }
        if (b.Body !== undefined)                 { r.input('bod', sql.NVarChar(sql.MAX), b.Body || null); sets.push('Body=@bod'); }
        if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

        await r.query(`UPDATE dms_CRO_Inquiries SET ${sets.join(', ')} WHERE InquiryID=@id`);
        res.json({ message: 'Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/inquiries/:id/convert-to-complaint { JobCardID, ComplaintType, Severity }
exports.convertToComplaint = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const pool = await getPool();
        const inqRow = await pool.request().input('id', sql.Int, id)
            .query(`SELECT * FROM dms_CRO_Inquiries WHERE InquiryID=@id`);
        if (!inqRow.recordset.length) return res.status(404).json({ error: 'Inquiry not found' });
        const inq = inqRow.recordset[0];
        if (inq.LinkedComplaintID) return res.status(409).json({ error: `Already converted (complaint #${inq.LinkedComplaintID}).` });

        const out = await createComplaint({
            JobCardID: b.JobCardID ? parseInt(b.JobCardID) : null,
            ComplaintType: b.ComplaintType,
            Source: inq.Source === 'Phone' ? 'Phone' : inq.Source === 'WalkIn' ? 'WalkIn' : inq.Source === 'WhatsApp' ? 'WhatsApp' : 'Inquiry',
            Subject: inq.Subject,
            Description: inq.Body,
            ContactName: inq.ContactName,
            ContactPhone: inq.ContactPhone,
            Severity: b.Severity || 'Normal',
        }, req.user);

        await pool.request()
            .input('id',  sql.Int, id)
            .input('cid', sql.Int, out.ComplaintID)
            .query(`UPDATE dms_CRO_Inquiries
                    SET LinkedComplaintID=@cid, Status='Converted', ClosedAt=GETDATE()
                    WHERE InquiryID=@id`);
        res.json({ message: 'Converted to complaint', ComplaintID: out.ComplaintID, ComplaintNo: out.ComplaintNo });
    } catch (err) {
        if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
        console.error('Inquiry convert:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/inquiries/:id/link-jobcard { JobCardID }
exports.linkJobCard = async (req, res) => {
    try {
        const id  = parseInt(req.params.id);
        const jc  = parseInt(req.body?.JobCardID);
        if (!jc) return res.status(400).json({ error: 'JobCardID is required' });
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id).input('jc', sql.Int, jc)
            .query(`UPDATE dms_CRO_Inquiries SET LinkedJobCardID=@jc, Status='Converted', ClosedAt=COALESCE(ClosedAt, GETDATE())
                    OUTPUT INSERTED.InquiryID WHERE InquiryID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Inquiry not found' });
        res.json({ message: 'Linked' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// DELETE /api/cro/inquiries/:id
exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_CRO_Inquiries OUTPUT DELETED.InquiryID WHERE InquiryID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
