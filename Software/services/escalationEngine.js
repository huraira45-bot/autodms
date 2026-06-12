/**
 * CRO Escalation Engine — pure logic, no DB.
 *
 * Source contract: .claude/planning/cro-module-design.md §9.
 *
 * Chain (cumulative):
 *   L0 = Service Advisor + Business-Unit Manager   (set when complaint opens)
 *   L1 = + CRO Manager                              (fires after threshold)
 *   L2 = + Executive (GM/MD)                        (max — fires after threshold)
 *
 * Severity multiplier on thresholds:
 *   Critical → 0.5x   (Normal 72/96 → Critical 36/48)
 *   High     → 1.0x
 *   Normal   → 1.0x
 *   Low      → 2.0x   (Normal 72/96 → Low 144/192)
 *
 * Rules read from dms_CRO_EscalationRules at startup or per-tick.
 * Statuses that PAUSE the escalation timer:
 *   - 'Closed'             — final state
 *   - 'PendingCROVerify'   — resolution submitted, CRO is verifying; no escalation while waiting
 */

const MAX_LEVEL = 2;
const PAUSED_STATUSES = new Set(['Closed', 'PendingCROVerify']);

/**
 * Look up the threshold (hours) for the given level + severity from the rules array.
 * Rules row shape: { Level, Severity (nullable=default), HoursElapsed, IsActive }.
 * A severity-specific rule wins over a NULL-severity (default) rule.
 * Returns null if no matching rule.
 */
function thresholdHours(rules, level, severity) {
    if (!Array.isArray(rules)) return null;
    const active = rules.filter(r => r.IsActive !== false && r.IsActive !== 0 && r.Level === level);
    const sevMatch = active.find(r => r.Severity === severity);
    if (sevMatch) return sevMatch.HoursElapsed;
    const defaultRule = active.find(r => r.Severity === null || r.Severity === undefined);
    return defaultRule ? defaultRule.HoursElapsed : null;
}

/**
 * Decide whether a complaint should be auto-escalated and to which level.
 * Inputs:
 *   complaint: {
 *     ComplaintID, Status, Severity, CurrentEscalationLevel,
 *     OpenedAt: Date|string, LastEscalationAt: Date|string|null
 *   }
 *   rules: array from dms_CRO_EscalationRules
 *   now: Date (for testability)
 * Returns: { escalate: bool, fromLevel, toLevel, reasonHours }  OR  { escalate: false, reason }.
 */
function evaluateComplaint(complaint, rules, now = new Date()) {
    if (!complaint) return { escalate: false, reason: 'no-complaint' };
    if (PAUSED_STATUSES.has(complaint.Status)) {
        return { escalate: false, reason: `paused (${complaint.Status})` };
    }
    const cur = complaint.CurrentEscalationLevel ?? 0;
    if (cur >= MAX_LEVEL) {
        return { escalate: false, reason: `at-max (L${cur})` };
    }

    const target = cur + 1;
    const hours = thresholdHours(rules, target, complaint.Severity);
    if (hours == null) {
        return { escalate: false, reason: `no-rule (L${target}, ${complaint.Severity})` };
    }

    // Anchor: OpenedAt for L1, LastEscalationAt for L2 (cumulative from previous escalation).
    // Per design: thresholds are "since OpenedAt" (cumulative), not "since last escalation".
    // E.g. Critical L1 fires at 36h after open; L2 fires at 48h after open (not 48h after L1).
    const opened = new Date(complaint.OpenedAt);
    const elapsedHours = (now.getTime() - opened.getTime()) / 3_600_000;
    if (elapsedHours < hours) {
        return { escalate: false, reason: `not-yet (${elapsedHours.toFixed(1)}h < ${hours}h)` };
    }
    return {
        escalate: true,
        fromLevel: cur,
        toLevel: target,
        reasonHours: hours,
        elapsedHours,
    };
}

/**
 * Resolve the cumulative recipient list for a complaint at a given escalation level.
 *
 * Returns an array of EmployeeID values. Caller is responsible for de-duping if needed.
 * `null`/undefined values are filtered out (e.g. unassigned SystemRoles).
 *
 * Resolved keys per design §9:
 *   level 0+: [ServiceAdvisorID, BUManagerEmployeeID]
 *   level 1+: + CROManagerEmployeeID
 *   level 2+: + ExecutiveEmployeeID
 */
function resolveRecipients(level, ctx) {
    const list = [];
    if (ctx.ServiceAdvisorID) list.push(ctx.ServiceAdvisorID);
    if (ctx.BUManagerEmployeeID) list.push(ctx.BUManagerEmployeeID);
    if (level >= 1 && ctx.CROManagerEmployeeID) list.push(ctx.CROManagerEmployeeID);
    if (level >= 2 && ctx.ExecutiveEmployeeID) list.push(ctx.ExecutiveEmployeeID);
    // dedupe (someone may hold two roles in this dealership)
    return [...new Set(list)];
}

/**
 * Subset of recipients that are NEW at this level vs. the previous level.
 * Used so we don't re-spam previously-notified people on every escalation.
 */
function newRecipientsAtLevel(toLevel, ctx) {
    const here  = new Set(resolveRecipients(toLevel,     ctx));
    const before = new Set(resolveRecipients(toLevel - 1, ctx));
    return [...here].filter(id => !before.has(id));
}

module.exports = {
    MAX_LEVEL,
    PAUSED_STATUSES,
    thresholdHours,
    evaluateComplaint,
    resolveRecipients,
    newRecipientsAtLevel,
};
