/**
 * Auto-create a CRD follow-up row after a Job Card finalizes.
 *
 * Best-effort: failure here MUST NOT roll back the finalize. Errors are logged
 * but swallowed — the GL post is the source of truth, the CRD row is just a
 * customer-touchpoint reminder.
 *
 * Idempotent: a UNIQUE index on JobCardID prevents duplicates on re-finalize.
 */
const { sql, getPool } = require('../config/db');

// Owner ask 2026-07-04 (revised): due date = JC.FinalizedAt + 2 days.
// Example given: JC closed 7/1 → follow-up due 7/3. Combined with the
// 3-day overdue grace (see crdController.OVERDUE_GRACE_DAYS), that gives
// a 5-day window before the row flags red — enough time for the customer
// to actually drive the vehicle before CRD calls to check on issues.
const DEFAULT_FOLLOWUP_DAYS = 2;

async function createFollowUpForJobCard(jobCardId, userInfo) {
    try {
        const pool = await getPool();

        // Snapshot customer info from the JC + linked tables.
        const r = await pool.request()
            .input('id', sql.Int, jobCardId)
            .query(`
                SELECT j.JobCardId, j.JobCardNo, j.EndUserID, j.PartyID, j.VehicleRegNo,
                       -- CRD calls the actual vehicle owner (end-user from workshop customer master).
                       -- Credit party is just the billing entity (often a company) — wrong person to call.
                       COALESCE(ac.endUserName, p.PartyName, 'Walk-in') AS CustomerName,
                       COALESCE(ac.PhoneNo, p.PhoneOne) AS PhoneOne,
                       j.FinalizedAt
                FROM Addata_JobCardInfo j
                LEFT JOIN gen_PartiesInfo p ON j.PartyID = p.PartyID
                LEFT JOIN addata_CustomerInfo ac ON j.EndUserID = ac.ProfileID
                WHERE j.JobCardId = @id
            `);
        if (!r.recordset.length) return null;
        const jc = r.recordset[0];

        // Anchor DueDate on JC.FinalizedAt (not "now") so backfills, retries
        // and cron re-runs always yield the same "finalize + N days" date.
        const finalizedAt = jc.FinalizedAt ? new Date(jc.FinalizedAt) : new Date();
        const dueDate     = new Date(finalizedAt.getTime() + DEFAULT_FOLLOWUP_DAYS * 24 * 60 * 60 * 1000);

        const result = await pool.request()
            .input('jcId',          sql.Int,           jc.JobCardId)
            .input('partyId',       sql.Int,           jc.PartyID || null)
            .input('profileId',     sql.Int,           jc.EndUserID || null)
            .input('custName',      sql.NVarChar(200), jc.CustomerName || 'Walk-in')
            .input('phone',         sql.NVarChar(50),  jc.PhoneOne || null)
            .input('vehReg',        sql.NVarChar(50),  jc.VehicleRegNo || null)
            .input('dueDate',       sql.Date,          dueDate)
            .input('createdBy',     sql.Int,           userInfo?.userId || null)
            .input('createdByName', sql.NVarChar(100), userInfo?.userName || 'system')
            .query(`
                IF NOT EXISTS (SELECT 1 FROM dms_CRDFollowUps WHERE JobCardID = @jcId)
                BEGIN
                    INSERT INTO dms_CRDFollowUps
                        (JobCardID, PartyID, CustomerProfileID, CustomerName, PhoneOne, VehicleRegNo,
                         DueDate, Status, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.FollowUpID
                    VALUES (@jcId, @partyId, @profileId, @custName, @phone, @vehReg,
                            @dueDate, 'Pending', @createdBy, @createdByName);
                END
            `);
        return result.recordset[0]?.FollowUpID || null;
    } catch (err) {
        console.error(`[CRD] follow-up auto-create failed for JC ${jobCardId}:`, err.message);
        return null;
    }
}

module.exports = { createFollowUpForJobCard };
