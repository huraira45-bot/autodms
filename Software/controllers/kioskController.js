// Public kiosk endpoints — served WITHOUT auth so a lobby TV can hit them
// on a dedicated browser without a login. Read-only, minimal PII.
const { sql, getPool } = require('../config/db');

// GET /api/kiosk/jobs-live
// Every DRAFT (not finalized) JC opened TODAY, excluding warranty (WR),
// B&P and CT types. Returns the fields a customer sitting in the lounge
// needs to spot their vehicle + know where it is: plate, first-name only,
// current WorkshopStatus, advisor, receipt time — and, from labour lines,
// completion progress + the bay/technician currently working on it
// (owner ask 2026-07-18 v2).
exports.getLiveJobs = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT j.JobCardId,
                   j.JobCardNo,
                   j.VehicleRegNo,
                   j.ReceiptDate,
                   j.PromisedDate,
                   -- Owner report 2026-07-20 (v3): ReceiptDate is unreliable
                   -- (frontend TZ double-shift stored it 10h off wall-clock).
                   -- EntryUserDateTime is set server-side via GETDATE() at
                   -- JC insert, so it always matches the server clock. Fall
                   -- back to ReceiptDate for legacy rows where EntryUserDate
                   -- Time might be NULL.
                   FORMAT(ISNULL(j.EntryUserDateTime, j.ReceiptDate), 'hh:mm tt') AS ReceiptTimeText,
                   DATEDIFF(MINUTE, ISNULL(j.EntryUserDateTime, j.ReceiptDate), GETDATE()) AS MinutesOnFloor,
                   ISNULL(j.WorkshopStatus, 'Waiting For Service') AS WorkshopStatus,
                   j.ServiceAdvisor,
                   t.CardCode AS JobTypeCode,
                   t.Title    AS JobTypeName,
                   -- Full customer name — owner ask 2026-07-20. Column
                   -- alias kept as `CustomerFirstName` so the frontend
                   -- render doesn't need to change.
                   c.endUserName AS CustomerFirstName,
                   -- Labour progress + active bay/tech aggregate.
                   ISNULL(lb.LabourTotal, 0)      AS LabourTotal,
                   ISNULL(lb.LabourDone,  0)      AS LabourDone,
                   lb.ActiveBay,
                   lb.ActiveTechnician
            FROM   Addata_JobCardInfo j
            LEFT   JOIN gen_JobCardType   t ON t.JobCardTypeId = j.JobTypeId
            LEFT   JOIN addata_CustomerInfo c ON c.ProfileID    = j.EndUserID
            LEFT   JOIN (
                SELECT JobCardId,
                       COUNT(*) AS LabourTotal,
                       SUM(CASE WHEN JobEndTime IS NOT NULL THEN 1 ELSE 0 END) AS LabourDone,
                       -- "Active" line = started but not finished. MAX picks a
                       -- deterministic single winner when more than one line
                       -- is open at once (rare — usually one tech, one bay).
                       MAX(CASE WHEN JobStartTime IS NOT NULL AND JobEndTime IS NULL
                                THEN BayNo END) AS ActiveBay,
                       MAX(CASE WHEN JobStartTime IS NOT NULL AND JobEndTime IS NULL
                                THEN PerformedByName END) AS ActiveTechnician
                FROM   Addata_JobCardInfoDetail
                GROUP  BY JobCardId
            ) lb ON lb.JobCardId = j.JobCardId
            WHERE  ISNULL(j.IsFinalized, 0) = 0
              AND  CAST(j.JobCardDate AS DATE) = CAST(GETDATE() AS DATE)
              AND  ISNULL(t.CardCode, '') NOT IN ('WR', 'B&P', 'CT')
              AND  ISNULL(j.WorkshopStatus, 'Waiting For Service') <> 'Delivered'
            ORDER  BY j.JobCardId DESC
        `);
        // Include the server's current wall clock so the header clock can
        // sync to server-time (the display TV's OS TZ might be wrong).
        const nowRes = await pool.request().query(`
            SELECT FORMAT(GETDATE(), 'yyyy-MM-dd') AS ServerDate,
                   FORMAT(GETDATE(), 'HH:mm:ss')   AS ServerTime24,
                   DATENAME(WEEKDAY, GETDATE())    AS ServerWeekday,
                   FORMAT(GETDATE(), 'd MMMM yyyy') AS ServerDateText`);
        res.set('Cache-Control', 'no-store');
        res.json({
            jobs: r.recordset,
            server: nowRes.recordset[0],
        });
    } catch (err) {
        console.error('kiosk/jobs-live error:', err);
        res.status(500).json({ error: err.message });
    }
};
