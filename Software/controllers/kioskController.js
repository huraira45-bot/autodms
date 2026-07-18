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
                   ISNULL(j.WorkshopStatus, 'Waiting For Service') AS WorkshopStatus,
                   j.ServiceAdvisor,
                   t.CardCode AS JobTypeCode,
                   t.Title    AS JobTypeName,
                   -- First name only for public display.
                   CASE
                       WHEN CHARINDEX(' ', ISNULL(c.endUserName,'')) > 0
                            THEN LEFT(c.endUserName, CHARINDEX(' ', c.endUserName) - 1)
                       ELSE c.endUserName
                   END AS CustomerFirstName,
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
        res.set('Cache-Control', 'no-store');
        res.json(r.recordset);
    } catch (err) {
        console.error('kiosk/jobs-live error:', err);
        res.status(500).json({ error: err.message });
    }
};
