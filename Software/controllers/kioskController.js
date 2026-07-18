// Public kiosk endpoints — served WITHOUT auth so a lobby TV can hit them
// on a dedicated browser without a login. Read-only, minimal PII.
const { sql, getPool } = require('../config/db');

// GET /api/kiosk/jobs-live
// Every DRAFT (not finalized) JC opened TODAY, excluding warranty (WR) and
// B&P (both codes) since owner ask 2026-07-18. Returns the fields a customer
// sitting in the lounge needs to spot their vehicle + know where it is:
//   plate, first-name only, current WorkshopStatus, advisor, receipt time.
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
                   END AS CustomerFirstName
            FROM   Addata_JobCardInfo j
            LEFT   JOIN gen_JobCardType   t ON t.JobCardTypeId = j.JobTypeId
            LEFT   JOIN addata_CustomerInfo c ON c.ProfileID    = j.EndUserID
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
