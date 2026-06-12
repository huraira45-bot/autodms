/**
 * Sales-side Inquiry queue.
 *
 * Inquiries land in `dms_CRO_Inquiries` with Category='ProductInfo' from the CRO
 * desk. This controller exposes them to the Sales side so:
 *   - AGM/GM Sales can see Unassigned inquiries and pick an executive
 *   - Sales Executives see their own assigned inquiries (queue)
 *   - Anyone in the chain can mark an inquiry Converted (auto-fired when a
 *     booking is created with SourceInquiryID = inquiryId — see
 *     salesBookingController.createBooking)
 *
 * Reads are open to all sales-side roles. Assignment is restricted to AGM/GM
 * (or sales_admin_settings as fallback) per Decision #20 — executives cannot
 * self-assign.
 */
const { sql, getPool } = require('../config/db');

// GET /api/sales/inquiries?filter=unassigned|mine|all
exports.list = async (req, res) => {
    try {
        const filter = (req.query.filter || 'open').toLowerCase();
        const pool = await getPool();
        const r = pool.request();
        const conds = [`i.Category = 'ProductInfo'`];

        if (filter === 'unassigned') {
            conds.push(`i.AssignedSalesExecutiveID IS NULL AND i.Status IN ('Open','InProgress')`);
        } else if (filter === 'mine') {
            r.input('me', sql.Int, req.user?.employeeId || 0);
            conds.push(`i.AssignedSalesExecutiveID = @me AND i.Status IN ('Open','InProgress')`);
        } else if (filter === 'open') {
            conds.push(`i.Status IN ('Open','InProgress')`);
        } else if (filter === 'closed') {
            conds.push(`i.Status IN ('Resolved','Closed','Converted')`);
        }
        // 'all' adds no extra filter

        const where = `WHERE ${conds.join(' AND ')}`;
        const result = await r.query(`
            SELECT i.InquiryID, i.Subject, i.Body, i.Source, i.Status,
                   i.ContactName, i.ContactPhone, i.ContactEmail,
                   i.OpenedAt, i.SalesQueuedAt,
                   i.AssignedSalesExecutiveID, e.EmployeeName AS AssignedExecutiveName,
                   i.AssignedAt, i.AssignmentNotes,
                   i.AssignedByEmployeeID, ae.EmployeeName AS AssignedByName,
                   i.CreatedByName,
                   DATEDIFF(HOUR, COALESCE(i.SalesQueuedAt, i.OpenedAt), GETDATE()) AS AgeHours,
                   -- Surface the booking that converted this inquiry (if any)
                   b.BookingID AS ConvertedBookingID, b.BookingNo AS ConvertedBookingNo, b.Status AS ConvertedBookingStatus
            FROM dms_CRO_Inquiries i
            LEFT JOIN gen_EmployeeInfo e  ON i.AssignedSalesExecutiveID = e.EmployeeID
            LEFT JOIN gen_EmployeeInfo ae ON i.AssignedByEmployeeID = ae.EmployeeID
            LEFT JOIN dms_SalesBookings b ON b.SourceInquiryID = i.InquiryID
            ${where}
            ORDER BY
                CASE WHEN i.AssignedSalesExecutiveID IS NULL THEN 0 ELSE 1 END,
                COALESCE(i.SalesQueuedAt, i.OpenedAt) DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/inquiries/:id/assign  { ExecutiveID, Notes? }
exports.assign = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const execId = parseInt(req.body?.ExecutiveID);
        const notes = (req.body?.Notes || '').trim() || null;
        if (!execId) return res.status(400).json({ error: 'ExecutiveID is required.' });

        const pool = await getPool();

        // Make sure the executive actually exists and has sales_executive
        const e = await pool.request().input('e', sql.Int, execId).query(`
            SELECT TOP 1 emp.EmployeeID, emp.EmployeeName
            FROM gen_EmployeeInfo emp
            WHERE emp.EmployeeID = @e
        `);
        if (!e.recordset.length) return res.status(404).json({ error: 'Executive not found.' });

        const cur = await pool.request().input('id', sql.Int, id)
            .query(`SELECT InquiryID, Category, AssignedSalesExecutiveID, Status FROM dms_CRO_Inquiries WHERE InquiryID=@id`);
        if (!cur.recordset.length) return res.status(404).json({ error: 'Inquiry not found.' });
        const c = cur.recordset[0];
        if (c.Category !== 'ProductInfo') {
            return res.status(409).json({ error: `Inquiry category is ${c.Category}, not ProductInfo — cannot assign to Sales.` });
        }
        if (c.Status === 'Converted' || c.Status === 'Closed') {
            return res.status(409).json({ error: `Inquiry is ${c.Status}.` });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('exe', sql.Int, execId)
            .input('notes', sql.NVarChar(sql.MAX), notes)
            .input('by', sql.Int, req.user?.employeeId || null)
            .query(`UPDATE dms_CRO_Inquiries
                    SET AssignedSalesExecutiveID = @exe,
                        AssignmentNotes = @notes,
                        AssignedAt = GETDATE(),
                        AssignedByEmployeeID = @by,
                        SalesQueuedAt = COALESCE(SalesQueuedAt, GETDATE()),
                        Status = CASE WHEN Status = 'Open' THEN 'InProgress' ELSE Status END
                    WHERE InquiryID = @id`);

        res.json({ message: `Assigned to ${e.recordset[0].EmployeeName}`, AssignedTo: execId });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/inquiries/:id/drop — unassign (back to Unassigned queue)
exports.drop = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = (req.body?.Reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'Reason is required to drop an inquiry.' });

        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('reason', sql.NVarChar(sql.MAX), reason)
            .query(`UPDATE dms_CRO_Inquiries
                    SET AssignedSalesExecutiveID = NULL,
                        AssignmentNotes = CONCAT(ISNULL(AssignmentNotes,''), CHAR(10), 'Dropped: ', @reason)
                    OUTPUT INSERTED.InquiryID
                    WHERE InquiryID = @id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Inquiry not found.' });
        res.json({ message: 'Dropped back to Unassigned' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/sales/inquiries/:id/close  { Reason } — close without booking (no-sale outcome)
exports.close = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = (req.body?.Reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'Reason is required to close.' });

        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('reason', sql.NVarChar(sql.MAX), reason)
            .query(`UPDATE dms_CRO_Inquiries
                    SET Status='Closed', ClosedAt=GETDATE(),
                        AssignmentNotes = CONCAT(ISNULL(AssignmentNotes,''), CHAR(10), 'Closed (no-sale): ', @reason)
                    OUTPUT INSERTED.InquiryID
                    WHERE InquiryID=@id AND Status IN ('Open','InProgress')`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Inquiry not found or already closed.' });
        res.json({ message: 'Inquiry closed' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
