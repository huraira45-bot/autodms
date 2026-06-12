const {
    thresholdHours,
    evaluateComplaint,
    resolveRecipients,
    newRecipientsAtLevel,
    MAX_LEVEL,
} = require('../services/escalationEngine');

// Mirrors the seeded rows from migration 015 / dms_CRO_EscalationRules.
const RULES = [
    { Level: 1, Severity: null,       HoursElapsed: 72,  IsActive: 1 },
    { Level: 2, Severity: null,       HoursElapsed: 96,  IsActive: 1 },
    { Level: 1, Severity: 'Critical', HoursElapsed: 36,  IsActive: 1 },
    { Level: 2, Severity: 'Critical', HoursElapsed: 48,  IsActive: 1 },
    { Level: 1, Severity: 'Low',      HoursElapsed: 144, IsActive: 1 },
    { Level: 2, Severity: 'Low',      HoursElapsed: 192, IsActive: 1 },
];

const NOW = new Date('2026-05-15T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000);

describe('thresholdHours', () => {
    test('uses severity-specific row when present', () => {
        expect(thresholdHours(RULES, 1, 'Critical')).toBe(36);
        expect(thresholdHours(RULES, 2, 'Critical')).toBe(48);
        expect(thresholdHours(RULES, 1, 'Low')).toBe(144);
    });
    test('falls back to NULL-severity default when no override exists', () => {
        expect(thresholdHours(RULES, 1, 'Normal')).toBe(72);
        expect(thresholdHours(RULES, 1, 'High')).toBe(72);
        expect(thresholdHours(RULES, 2, 'High')).toBe(96);
    });
    test('returns null when no rule matches', () => {
        expect(thresholdHours(RULES, 99, 'Normal')).toBeNull();
        expect(thresholdHours([], 1, 'Normal')).toBeNull();
    });
    test('inactive rules are ignored', () => {
        const partial = [{ Level: 1, Severity: null, HoursElapsed: 72, IsActive: 0 }];
        expect(thresholdHours(partial, 1, 'Normal')).toBeNull();
    });
});

describe('evaluateComplaint', () => {
    test('Normal complaint open 24h — not yet', () => {
        const c = { Status: 'Assigned', Severity: 'Normal', CurrentEscalationLevel: 0, OpenedAt: hoursAgo(24) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(false);
        expect(r.reason).toMatch(/not-yet/);
    });
    test('Normal at 72h — escalates to L1', () => {
        const c = { Status: 'Assigned', Severity: 'Normal', CurrentEscalationLevel: 0, OpenedAt: hoursAgo(72.1) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(true);
        expect(r.toLevel).toBe(1);
        expect(r.reasonHours).toBe(72);
    });
    test('Critical at 36h — escalates to L1', () => {
        const c = { Status: 'Assigned', Severity: 'Critical', CurrentEscalationLevel: 0, OpenedAt: hoursAgo(36.5) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(true);
        expect(r.toLevel).toBe(1);
    });
    test('Critical at 36h, already at L1 — escalates to L2 if 48h elapsed', () => {
        const c = { Status: 'Assigned', Severity: 'Critical', CurrentEscalationLevel: 1, OpenedAt: hoursAgo(50) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(true);
        expect(r.toLevel).toBe(2);
    });
    test('Low complaint at 100h — not yet (Low L1 = 144h)', () => {
        const c = { Status: 'Assigned', Severity: 'Low', CurrentEscalationLevel: 0, OpenedAt: hoursAgo(100) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(false);
    });
    test('Already at max (L2) — does not escalate', () => {
        const c = { Status: 'Assigned', Severity: 'Critical', CurrentEscalationLevel: MAX_LEVEL, OpenedAt: hoursAgo(500) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(false);
        expect(r.reason).toMatch(/at-max/);
    });
    test('PendingCROVerify — paused, no escalation', () => {
        const c = { Status: 'PendingCROVerify', Severity: 'Critical', CurrentEscalationLevel: 0, OpenedAt: hoursAgo(500) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(false);
        expect(r.reason).toMatch(/paused/);
    });
    test('Closed — paused', () => {
        const c = { Status: 'Closed', Severity: 'Critical', CurrentEscalationLevel: 1, OpenedAt: hoursAgo(500) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(false);
    });
    test('InProgress at L0 past 72h with Normal — escalates', () => {
        const c = { Status: 'InProgress', Severity: 'Normal', CurrentEscalationLevel: 0, OpenedAt: hoursAgo(80) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(true);
        expect(r.toLevel).toBe(1);
    });
    test('ReOpened with L2 already set (NotSatisfied path) — at max', () => {
        const c = { Status: 'Assigned', Severity: 'Normal', CurrentEscalationLevel: 2, OpenedAt: hoursAgo(300) };
        const r = evaluateComplaint(c, RULES, NOW);
        expect(r.escalate).toBe(false);
        expect(r.reason).toMatch(/at-max/);
    });
});

describe('resolveRecipients', () => {
    const ctx = {
        ServiceAdvisorID: 10,
        BUManagerEmployeeID: 20,
        CROManagerEmployeeID: 30,
        ExecutiveEmployeeID: 40,
    };
    test('L0 = SA + BU only', () => {
        expect(resolveRecipients(0, ctx).sort()).toEqual([10, 20]);
    });
    test('L1 adds CRO Manager', () => {
        expect(resolveRecipients(1, ctx).sort()).toEqual([10, 20, 30]);
    });
    test('L2 adds Executive', () => {
        expect(resolveRecipients(2, ctx).sort()).toEqual([10, 20, 30, 40]);
    });
    test('Null/missing recipients are filtered', () => {
        const partial = { ServiceAdvisorID: null, BUManagerEmployeeID: 20, CROManagerEmployeeID: null, ExecutiveEmployeeID: 40 };
        expect(resolveRecipients(2, partial).sort()).toEqual([20, 40]);
    });
    test('Same employee in two roles is deduped', () => {
        const overlap = { ServiceAdvisorID: 10, BUManagerEmployeeID: 10, CROManagerEmployeeID: 30, ExecutiveEmployeeID: 30 };
        expect(resolveRecipients(2, overlap).sort()).toEqual([10, 30]);
    });
});

describe('newRecipientsAtLevel', () => {
    const ctx = {
        ServiceAdvisorID: 10,
        BUManagerEmployeeID: 20,
        CROManagerEmployeeID: 30,
        ExecutiveEmployeeID: 40,
    };
    test('L1 newcomer = CRO Manager only', () => {
        expect(newRecipientsAtLevel(1, ctx)).toEqual([30]);
    });
    test('L2 newcomer = Executive only', () => {
        expect(newRecipientsAtLevel(2, ctx)).toEqual([40]);
    });
    test('newcomer of an already-present role returns empty', () => {
        const overlap = { ServiceAdvisorID: 10, BUManagerEmployeeID: 30, CROManagerEmployeeID: 30, ExecutiveEmployeeID: 40 };
        expect(newRecipientsAtLevel(1, overlap)).toEqual([]);
        expect(newRecipientsAtLevel(2, overlap)).toEqual([40]);
    });
});
