/**
 * CRO Escalation Cron — runs every 15 minutes.
 *
 * For each open complaint, decides if it needs auto-escalation per the rules
 * in dms_CRO_EscalationRules, and if so:
 *   1. Inserts an 'Escalated' action row (unique on ComplaintID + Level via existing index)
 *   2. Bumps CurrentEscalationLevel + LastEscalationAt on the complaint
 *   3. Inserts dms_CRO_Notifications rows for the *new* recipients at this level
 *
 * Pure decision logic lives in services/escalationEngine.js (Jest-tested).
 * Notification fan-out for email is stubbed for now (Phase 4 — Twilio/email plug).
 *
 * Safe to call tick() directly from a smoke test by passing forceNow.
 */

const cron = require('node-cron');
const { sql, getPool } = require('../config/db');
const {
    evaluateComplaint,
    newRecipientsAtLevel,
} = require('./escalationEngine');
const { emitNotifications } = require('./croNotificationService');

const CRON_EXPRESSION = '*/15 * * * *'; // every 15 minutes

let scheduled = null;
let running = false; // re-entrancy guard

/**
 * Load all active escalation rules once per tick.
 */
async function loadRules(pool) {
    const r = await pool.request().query(`
        SELECT RuleID, AppliesToDepartmentID, Severity, Level, HoursElapsed, IsActive
        FROM dms_CRO_EscalationRules
        WHERE IsActive = 1
    `);
    return r.recordset;
}

/**
 * Find candidate complaints: open (not Closed/PendingCROVerify), not at max level.
 * Joins to pull recipient resolution context (Service Advisor, BU Manager, CRO Manager, Executive).
 */
async function loadCandidates(pool) {
    const r = await pool.request().query(`
        SELECT
            c.ComplaintID, c.Status, c.Severity, c.CurrentEscalationLevel,
            c.OpenedAt, c.LastEscalationAt,
            c.JobCardID, c.ComplaintNo,
            j.ServiceAdvisorID,
            jt.ManagerEmployeeID                     AS BUManagerEmployeeID,
            cro_dept.ManagerEmployeeID               AS CROManagerEmployeeID,
            exec_role.EmployeeID                     AS ExecutiveEmployeeID
        FROM dms_CRO_Complaints c
        LEFT JOIN Addata_JobCardInfo j  ON c.JobCardID = j.JobCardId
        LEFT JOIN gen_JobCardType    jt ON j.JobTypeId    = jt.JobCardTypeId
        LEFT JOIN gen_DepartmentInfo cro_dept ON cro_dept.DepartmentName LIKE '%Customer Relations%' OR cro_dept.DepartmentName LIKE '%CRO%'
        LEFT JOIN dms_CRO_SystemRoles exec_role ON exec_role.RoleKey = 'EXECUTIVE'
        WHERE c.Status NOT IN ('Closed', 'PendingCROVerify')
          AND c.CurrentEscalationLevel < 2
    `);
    return r.recordset;
}

/**
 * Apply one escalation atomically.
 * Returns { applied: bool, reason }.
 */
async function applyEscalation(pool, complaint, decision) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Insert Escalated action — relies on UQ_CRO_Actions_Complaint_Level idempotency to swallow dupes.
        try {
            await new sql.Request(tx)
                .input('cid', sql.Int, complaint.ComplaintID)
                .input('notes', sql.NVarChar(sql.MAX),
                    `AUTO: ${decision.elapsedHours.toFixed(1)}h elapsed ≥ ${decision.reasonHours}h threshold (severity=${complaint.Severity || 'Normal'}).`)
                .input('lvlBefore', sql.TinyInt, decision.fromLevel)
                .input('lvlAfter',  sql.TinyInt, decision.toLevel)
                .query(`
                    INSERT INTO dms_CRO_ComplaintActions
                        (ComplaintID, ActionType, PerformedByEmployeeID, PerformedByName,
                         PerformedAt, Notes, EscalationLevelBefore, EscalationLevelAfter)
                    VALUES (@cid, 'Escalated', NULL, 'SYSTEM',
                            GETDATE(), @notes, @lvlBefore, @lvlAfter)
                `);
        } catch (insertErr) {
            // Unique-constraint violation = already escalated to this level by another path; treat as no-op.
            if (insertErr.number === 2627 || insertErr.number === 2601 || /unique/i.test(insertErr.message || '')) {
                await tx.rollback();
                return { applied: false, reason: 'already-at-level' };
            }
            throw insertErr;
        }

        // Bump complaint level + timestamp
        await new sql.Request(tx)
            .input('cid', sql.Int, complaint.ComplaintID)
            .input('lvl', sql.TinyInt, decision.toLevel)
            .query(`
                UPDATE dms_CRO_Complaints
                SET CurrentEscalationLevel=@lvl, LastEscalationAt=GETDATE(),
                    UpdatedAt=GETDATE()
                WHERE ComplaintID=@cid
            `);

        // Fan out notifications to the NEW recipients only (cumulative chain — previous ones already notified at lower levels)
        const newcomers = newRecipientsAtLevel(decision.toLevel, complaint);
        await emitNotifications(tx, complaint, newcomers, {
            subject: `Complaint ${complaint.ComplaintNo} escalated to L${decision.toLevel}`,
            body:    `Auto-escalated by system. Severity: ${complaint.Severity || 'Normal'}. Open since ${new Date(complaint.OpenedAt).toISOString()}. Please review and act.`,
            sourceType: 'ComplaintEscalation',
        });

        await tx.commit();
        return { applied: true, newcomerCount: newcomers.length };
    } catch (err) {
        try { await tx.rollback(); } catch {}
        throw err;
    }
}

/**
 * One tick of the engine. Exported so the smoke test can call it directly.
 * `forceNow` lets tests inject a clock to verify thresholds without time-travel.
 */
async function tick({ forceNow = null, verbose = false } = {}) {
    if (running) {
        if (verbose) console.log('[escalationCron] previous tick still running, skipping');
        return { skipped: true };
    }
    running = true;
    const stats = { evaluated: 0, escalated: 0, skipped: 0, errors: 0 };
    try {
        const pool = await getPool();
        // Pull SQL Server's clock and use it as 'now' so it matches the same TZ-interpretation
        // the mssql driver applies when reading OpenedAt back. JS Date.now() vs SQL GETDATE()
        // disagree by the local-timezone offset (Asia/Karachi is +5h) and shift thresholds.
        const nowRow = await pool.request().query('SELECT GETDATE() AS Now');
        const now = forceNow || nowRow.recordset[0].Now;
        const [rules, candidates] = await Promise.all([loadRules(pool), loadCandidates(pool)]);
        for (const c of candidates) {
            stats.evaluated++;
            const decision = evaluateComplaint(c, rules, now);
            if (verbose) {
                console.log(`[escalationCron] CMP=${c.ComplaintNo} L${c.CurrentEscalationLevel} sev=${c.Severity} -> ${decision.escalate ? `ESCALATE L${decision.toLevel}` : `hold (${decision.reason})`}`);
            }
            if (!decision.escalate) { stats.skipped++; continue; }
            try {
                const result = await applyEscalation(pool, c, decision);
                if (result.applied) {
                    stats.escalated++;
                    if (verbose) console.log(`[escalationCron] CMP=${c.ComplaintNo} -> L${decision.toLevel} (notified ${result.newcomerCount} new)`);
                } else {
                    stats.skipped++;
                }
            } catch (err) {
                stats.errors++;
                console.error(`[escalationCron] failed CMP=${c.ComplaintNo}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[escalationCron] tick failed:', err);
        stats.errors++;
    } finally {
        running = false;
    }
    return stats;
}

function start({ verbose = false } = {}) {
    if (scheduled) return scheduled;
    scheduled = cron.schedule(CRON_EXPRESSION, () => {
        tick({ verbose }).catch(err => console.error('[escalationCron] unhandled tick error:', err));
    });
    console.log(`[escalationCron] scheduled (${CRON_EXPRESSION})`);
    return scheduled;
}

function stop() {
    if (scheduled) {
        scheduled.stop();
        scheduled = null;
    }
}

module.exports = { start, stop, tick, CRON_EXPRESSION };
