/**
 * CRO in-app notifications — inbox endpoints.
 *
 * Backs the bell/dropdown in the UI. A user only sees notifications addressed
 * to *their* linked employee (req.user.employeeId). If the user has no
 * LinkedEmployeeID (e.g. legacy admin), the inbox returns empty — that's fine,
 * they get visibility via the CRO Workspace list directly.
 */
const { sql, getPool } = require('../config/db');

// GET /api/cro/notifications/inbox?onlyUnread=1&limit=20
exports.inbox = async (req, res) => {
    try {
        const empId = req.user?.employeeId;
        if (!empId) return res.json({ items: [], unreadCount: 0 });

        const onlyUnread = req.query.onlyUnread === '1' || req.query.onlyUnread === 'true';
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        const pool = await getPool();
        const r = pool.request().input('emp', sql.Int, empId).input('lim', sql.Int, limit);
        const where = onlyUnread ? 'AND ReadAt IS NULL' : '';

        const items = await r.query(`
            SELECT TOP (@lim)
                n.NotificationID, n.Subject, n.Body, n.LinkURL,
                n.SourceType, n.SourceID, n.SentAt, n.ReadAt,
                c.ComplaintNo, c.Severity, c.Status, c.CurrentEscalationLevel
            FROM dms_CRO_Notifications n
            LEFT JOIN dms_CRO_Complaints c ON n.SourceType IN ('ComplaintOpened','ComplaintEscalation','Complaint') AND n.SourceID = c.ComplaintID
            WHERE n.RecipientEmployeeID = @emp ${where}
            ORDER BY n.SentAt DESC
        `);

        const unreadCount = await pool.request()
            .input('emp', sql.Int, empId)
            .query(`SELECT COUNT(*) AS n FROM dms_CRO_Notifications WHERE RecipientEmployeeID=@emp AND ReadAt IS NULL`);

        res.json({
            items: items.recordset,
            unreadCount: unreadCount.recordset[0].n,
        });
    } catch (err) {
        console.error('CRO notifications inbox:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/notifications/:id/read — mark one as read
exports.markRead = async (req, res) => {
    try {
        const empId = req.user?.employeeId;
        if (!empId) return res.status(400).json({ error: 'User has no LinkedEmployeeID.' });
        const id = parseInt(req.params.id);

        const pool = await getPool();
        const r = await pool.request()
            .input('id',  sql.Int, id)
            .input('emp', sql.Int, empId)
            .query(`UPDATE dms_CRO_Notifications
                    SET ReadAt = GETDATE()
                    OUTPUT INSERTED.NotificationID
                    WHERE NotificationID=@id AND RecipientEmployeeID=@emp AND ReadAt IS NULL`);
        res.json({ updated: r.recordset.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/notifications/read-all — mark all current-user unread as read
exports.markAllRead = async (req, res) => {
    try {
        const empId = req.user?.employeeId;
        if (!empId) return res.status(400).json({ error: 'User has no LinkedEmployeeID.' });

        const pool = await getPool();
        const r = await pool.request()
            .input('emp', sql.Int, empId)
            .query(`UPDATE dms_CRO_Notifications
                    SET ReadAt = GETDATE()
                    WHERE RecipientEmployeeID=@emp AND ReadAt IS NULL`);
        res.json({ updated: r.rowsAffected?.[0] ?? 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
