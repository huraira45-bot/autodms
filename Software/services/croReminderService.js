/**
 * CRO Service Reminders (cro-module-design.md §14).
 *
 * Generates upcoming-service reminders per chassis based on the customer's
 * service history. Triggers map to OrderType progression:
 *   PDI → FFS  : 1500 km OR 90 days
 *   FFS → SFS  : 5000 km OR 180 days
 *   SFS → Reg  : every 5000 km OR 180 days (semi-annual)
 *
 * km/day rule (decision #7):
 *   - If chassis has ≥3 finalized JCs → personal km/day from history
 *   - Otherwise → 30 km/day flat assumption
 *   - Cap at 200 km/day to keep outliers from over-reminding
 *
 * DueDate = MIN(due_by_km, due_by_time) — whichever fires sooner wins.
 *
 * This service computes the *next* reminder for any given JC and upserts a row
 * in dms_CRO_ServiceReminders. The cron tick at 09:00 then flips rows whose
 * DueDate <= today from Scheduled → Sent and emits notifications.
 */
const { sql, getPool } = require('../config/db');

const DEFAULT_KM_DAY = 30;
const KM_DAY_CAP     = 200;

// Mapping OrderType numeric IDs (from gen_OrderType seed):
//   1=General, 2=FFS, 3=SFS, 4=PDI, 5=Insurance, 6=Other
const ORDER = { PDI: 4, FFS: 2, SFS: 3, GENERAL: 1 };

const LADDER = {
    // After this order type, next reminder is for the next step
    [ORDER.PDI]:     { nextType: 'FFS',     targetKm: 1500, targetMonths: 3 },
    [ORDER.FFS]:     { nextType: 'SFS',     targetKm: 5000, targetMonths: 6 },
    [ORDER.SFS]:     { nextType: 'REGULAR', targetKm: 5000, targetMonths: 6 },
    [ORDER.GENERAL]: { nextType: 'REGULAR', targetKm: 5000, targetMonths: 6 },
};

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + Math.round(days));
    return d;
}
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

/**
 * Compute personal km/day from a chassis's JC history. Returns DEFAULT_KM_DAY when fewer than 3 JCs.
 */
async function computeKmPerDay(pool, chasisNo) {
    if (!chasisNo) return DEFAULT_KM_DAY;
    const r = await pool.request().input('cn', sql.NVarChar(50), chasisNo).query(`
        SELECT MIN(KiloMeter)        AS minKm,
               MAX(KiloMeter)        AS maxKm,
               MIN(JobCardDate)      AS minDate,
               MAX(JobCardDate)      AS maxDate,
               COUNT(*)              AS n
        FROM Addata_JobCardInfo
        WHERE ChasisNo=@cn AND IsFinalized=1 AND KiloMeter > 0 AND JobCardDate IS NOT NULL
    `);
    const row = r.recordset[0];
    if (!row || row.n < 3 || !row.minDate || !row.maxDate) return DEFAULT_KM_DAY;
    const days = Math.max(1, (new Date(row.maxDate) - new Date(row.minDate)) / 86_400_000);
    const km   = Math.max(0, (row.maxKm || 0) - (row.minKm || 0));
    if (days < 30 || km <= 0) return DEFAULT_KM_DAY;
    const kmPerDay = km / days;
    return Math.min(kmPerDay, KM_DAY_CAP);
}

/**
 * Compute the next reminder for a JC. Pure once you've passed in the JC row
 * + the personal km/day rate.
 */
function computeNextReminder(jc, kmPerDay) {
    const rule = LADDER[jc.OrderTypeId];
    if (!rule) return null; // unknown order type — no reminder

    const anchor = jc.FinalizedAt || jc.JobCardDate;
    if (!anchor) return null;
    const anchorDate = new Date(anchor);

    const dueByTime = addMonths(anchorDate, rule.targetMonths);
    const daysForKm = rule.targetKm / Math.max(kmPerDay, 1);
    const dueByKm   = addDays(anchorDate, daysForKm);

    const dueDate = dueByKm < dueByTime ? dueByKm : dueByTime;

    return {
        ReminderType: rule.nextType,
        DueDate:      dueDate,
        DueByKmDate:  dueByKm,
        DueByTimeDate: dueByTime,
        DueMileage:   (jc.KiloMeter || 0) + rule.targetKm,
    };
}

/**
 * Upsert a Scheduled reminder for the given JC. Idempotent on (ChasisNo + ReminderType + JobCardID).
 * Called from the JC-finalize post-commit hook.
 */
async function generateForJobCard(jobCardId) {
    try {
        const pool = await getPool();
        const r = await pool.request().input('j', sql.Int, jobCardId).query(`
            SELECT JobCardId, JobCardNo, JobCardDate, FinalizedAt, ChasisNo, VehicleRegNo,
                   EndUserID, KiloMeter, OrderTypeId
            FROM Addata_JobCardInfo
            WHERE JobCardId=@j
        `);
        const jc = r.recordset[0];
        if (!jc) return { skipped: 'jc-not-found' };
        if (!jc.ChasisNo) return { skipped: 'no-chassis' };

        const kmPerDay = await computeKmPerDay(pool, jc.ChasisNo);
        const next = computeNextReminder(jc, kmPerDay);
        if (!next) return { skipped: 'no-rule', orderType: jc.OrderTypeId };

        // Idempotency: only one outstanding reminder per (chassis, JC, type)
        const dup = await pool.request()
            .input('cn', sql.NVarChar(50), jc.ChasisNo)
            .input('rt', sql.NVarChar(20), next.ReminderType)
            .input('j',  sql.Int, jobCardId)
            .query(`SELECT TOP 1 ReminderID FROM dms_CRO_ServiceReminders
                    WHERE ChasisNo=@cn AND ReminderType=@rt AND JobCardID=@j`);
        if (dup.recordset.length) return { skipped: 'dup', ReminderID: dup.recordset[0].ReminderID };

        const ins = await pool.request()
            .input('prof', sql.Int, jc.EndUserID || 0)
            .input('j',    sql.Int, jobCardId)
            .input('cn',   sql.NVarChar(50), jc.ChasisNo)
            .input('reg',  sql.NVarChar(50), jc.VehicleRegNo || null)
            .input('rt',   sql.NVarChar(20), next.ReminderType)
            .input('dd',   sql.Date, isoDate(next.DueDate))
            .input('dm',   sql.Int,  next.DueMileage || null)
            .input('dk',   sql.Date, isoDate(next.DueByKmDate))
            .input('dt',   sql.Date, isoDate(next.DueByTimeDate))
            .query(`INSERT INTO dms_CRO_ServiceReminders
                        (CustomerProfileID, JobCardID, ChasisNo, VehicleRegNo,
                         ReminderType, DueDate, DueMileage, DueByKmDate, DueByTimeDate,
                         Status, CreatedAt)
                    OUTPUT INSERTED.ReminderID
                    VALUES (@prof, @j, @cn, @reg, @rt, @dd, @dm, @dk, @dt, 'Scheduled', GETDATE())`);

        return { ReminderID: ins.recordset[0].ReminderID, ReminderType: next.ReminderType, DueDate: isoDate(next.DueDate), kmPerDay };
    } catch (err) {
        console.error('[Reminder] generateForJobCard JC', jobCardId, err.message);
        return { error: err.message };
    }
}

/**
 * Daily cron tick (09:00). For each row where DueDate <= today AND Status='Scheduled',
 * mark as Sent. Returns counters.
 */
async function dailyTick({ forceNow = null, verbose = false } = {}) {
    const pool = await getPool();
    const r = await pool.request().query(`
        UPDATE dms_CRO_ServiceReminders
        SET Status='Sent', SentAt=GETDATE()
        OUTPUT INSERTED.ReminderID, INSERTED.ReminderType, INSERTED.ChasisNo, INSERTED.DueDate
        WHERE Status='Scheduled' AND DueDate <= CAST(GETDATE() AS DATE)
    `);
    const sent = r.recordset.length;
    if (verbose) console.log(`[reminderCron] tick: marked ${sent} Sent`);
    return { sent, items: r.recordset };
}

module.exports = {
    generateForJobCard,
    computeKmPerDay,
    computeNextReminder,
    dailyTick,
    LADDER,
    DEFAULT_KM_DAY,
    KM_DAY_CAP,
};
