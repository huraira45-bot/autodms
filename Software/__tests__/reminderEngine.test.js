const { computeNextReminder, LADDER, DEFAULT_KM_DAY, KM_DAY_CAP } = require('../services/croReminderService');

// JCs in our DB use OrderTypeId: 4=PDI, 2=FFS, 3=SFS, 1=General
const PDI = 4, FFS = 2, SFS = 3;

describe('computeNextReminder', () => {
    test('PDI → schedules FFS at min(1500km/rate, 90d)', () => {
        const jc = { OrderTypeId: PDI, KiloMeter: 0, FinalizedAt: '2026-01-01' };
        const r = computeNextReminder(jc, 30);
        expect(r.ReminderType).toBe('FFS');
        // 1500km @ 30km/d = 50 days; 3 months = ~90 days → km wins
        const due = new Date(r.DueDate);
        expect(due.getTime()).toBeLessThan(new Date('2026-04-02').getTime());
    });
    test('Low-mileage driver: time threshold fires before km', () => {
        const jc = { OrderTypeId: PDI, KiloMeter: 100, FinalizedAt: '2026-01-01' };
        const r = computeNextReminder(jc, 5); // 1500km @ 5km/d = 300 days; 3 months = 90 days
        const due = new Date(r.DueDate);
        // time wins → April 1 2026
        expect(due.getMonth()).toBe(3); // April
    });
    test('FFS → schedules SFS, target km 5000', () => {
        const jc = { OrderTypeId: FFS, KiloMeter: 2000, FinalizedAt: '2026-01-01' };
        const r = computeNextReminder(jc, 30);
        expect(r.ReminderType).toBe('SFS');
        expect(r.DueMileage).toBe(7000); // 2000 + 5000
    });
    test('Unknown order type returns null', () => {
        const jc = { OrderTypeId: 99, KiloMeter: 0, FinalizedAt: '2026-01-01' };
        expect(computeNextReminder(jc, 30)).toBeNull();
    });
    test('Missing FinalizedAt and JobCardDate returns null', () => {
        const jc = { OrderTypeId: PDI, KiloMeter: 0 };
        expect(computeNextReminder(jc, 30)).toBeNull();
    });
    test('SFS → REGULAR with 6-month time threshold', () => {
        const jc = { OrderTypeId: SFS, KiloMeter: 10000, FinalizedAt: '2026-01-01' };
        const r = computeNextReminder(jc, 30);
        expect(r.ReminderType).toBe('REGULAR');
        const dueByTime = new Date(r.DueByTimeDate);
        expect(dueByTime.getMonth()).toBe(6); // July (Jan + 6m)
    });
    test('DueDate is the earlier of km vs time', () => {
        const jc = { OrderTypeId: PDI, KiloMeter: 0, FinalizedAt: '2026-01-01' };
        const r = computeNextReminder(jc, 30);
        const kmDate = new Date(r.DueByKmDate).getTime();
        const tmDate = new Date(r.DueByTimeDate).getTime();
        expect(new Date(r.DueDate).getTime()).toBe(Math.min(kmDate, tmDate));
    });
});

describe('LADDER constants', () => {
    test('cap and default rates exposed', () => {
        expect(DEFAULT_KM_DAY).toBe(30);
        expect(KM_DAY_CAP).toBe(200);
    });
});
