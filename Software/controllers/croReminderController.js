/**
 * CRO Service Reminders — HTTP endpoints.
 *   list / get  : view the upcoming-service queue
 *   acknowledge : CRO officer logged a contact / booking
 *   markBooked  : link to the new JC the customer booked in for
 *   cancel      : suppress this reminder (customer opted out / vehicle disposed)
 *   tick        : debug — fire the daily cron on demand (cro_admin)
 */
const { sql, getPool } = require('../config/db');

// GET /api/cro/reminders?status=&type=&search=&dueBy=YYYY-MM-DD
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.status) { r.input('s', sql.NVarChar(20), req.query.status); conds.push('rem.Status=@s'); }
        if (req.query.type)   { r.input('t', sql.NVarChar(20), req.query.type);   conds.push('rem.ReminderType=@t'); }
        if (req.query.dueBy)  { r.input('d', sql.Date, new Date(req.query.dueBy)); conds.push('rem.DueDate <= @d'); }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(rem.ChasisNo LIKE @q OR rem.VehicleRegNo LIKE @q OR j.JobCardNo LIKE @q OR ac.endUserName LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT rem.ReminderID, rem.ReminderType, rem.Status, rem.DueDate, rem.DueMileage,
                   rem.DueByKmDate, rem.DueByTimeDate, rem.SentAt, rem.AcknowledgedAt, rem.BookedJobCardID,
                   rem.ChasisNo, rem.VehicleRegNo, rem.CustomerProfileID,
                   rem.JobCardID AS SourceJCID, j.JobCardNo AS SourceJCNo,
                   ac.endUserName AS CustomerName, ac.PhoneNo AS CustomerPhone
            FROM dms_CRO_ServiceReminders rem
            LEFT JOIN Addata_JobCardInfo j ON rem.JobCardID = j.JobCardId
            LEFT JOIN addata_CustomerInfo ac ON rem.CustomerProfileID = ac.ProfileID
            ${where}
            ORDER BY
                CASE rem.Status WHEN 'Sent' THEN 0 WHEN 'Scheduled' THEN 1 WHEN 'Acknowledged' THEN 2 ELSE 3 END,
                rem.DueDate
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/reminders/:id/acknowledge { Notes? }
exports.acknowledge = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, id)
            .query(`UPDATE dms_CRO_ServiceReminders
                    SET Status='Acknowledged', AcknowledgedAt=GETDATE()
                    OUTPUT INSERTED.ReminderID
                    WHERE ReminderID=@id AND Status IN ('Sent','Scheduled')`);
        if (!r.recordset.length) return res.status(409).json({ error: 'Reminder not in a state that can be acknowledged.' });
        res.json({ message: 'Acknowledged' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/reminders/:id/mark-booked { BookedJobCardID }
exports.markBooked = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const jcId = parseInt(req.body?.BookedJobCardID);
        if (!jcId) return res.status(400).json({ error: 'BookedJobCardID is required.' });
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('jc', sql.Int, jcId)
            .query(`UPDATE dms_CRO_ServiceReminders
                    SET Status='Booked', BookedJobCardID=@jc, AcknowledgedAt=COALESCE(AcknowledgedAt, GETDATE())
                    OUTPUT INSERTED.ReminderID
                    WHERE ReminderID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Reminder not found.' });
        res.json({ message: 'Marked booked' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/reminders/:id/cancel
exports.cancel = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        await pool.request().input('id', sql.Int, id)
            .query(`UPDATE dms_CRO_ServiceReminders SET Status='Cancelled' WHERE ReminderID=@id AND Status NOT IN ('Booked','Cancelled')`);
        res.json({ message: 'Cancelled' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/reminders/debug/tick — fire daily cron on demand (cro_admin only)
exports.debugTick = async (req, res) => {
    try {
        const out = await require('../services/reminderCron').tick({ verbose: true });
        res.json(out);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/reminders/regenerate — back-fill reminders for all finalized JCs without one
exports.regenerate = async (req, res) => {
    try {
        const pool = await getPool();
        // Find finalized JCs with a chassis that have no reminder yet (per JC)
        const r = await pool.request().query(`
            SELECT TOP 500 j.JobCardId
            FROM Addata_JobCardInfo j
            LEFT JOIN dms_CRO_ServiceReminders rem ON rem.JobCardID = j.JobCardId
            WHERE j.IsFinalized = 1 AND j.ChasisNo IS NOT NULL AND rem.ReminderID IS NULL
        `);
        const { generateForJobCard } = require('../services/croReminderService');
        const created = [];
        for (const row of r.recordset) {
            const out = await generateForJobCard(row.JobCardId);
            if (out.ReminderID) created.push(out.ReminderID);
        }
        res.json({ evaluated: r.recordset.length, created: created.length });
    } catch (err) {
        console.error('Reminder regenerate:', err);
        res.status(500).json({ error: err.message });
    }
};
