/**
 * Salary calculator — port of the Changan Salary Management System's
 * calculateNet function (server/index.js line 98). Kept as a pure
 * function so both the salary posting service and any read-side report
 * can reuse it.
 *
 * Net = max(0,
 *          (basicSalary × paidDays / monthDays)   -- prorated base
 *        + fuelAllowance                          -- fixed if HasFuelAllowance
 *        + adjustment                             -- per-month manual
 *        - absentFine (attendance.absents × settings.absentFinePerDay)
 *        - lateFine   (attendance.lateMinutes × effective late rate)
 *        - advance
 *        - messDeduction (messAmount × entry.messDays)
 *        - manualFine
 *        - eobi
 *        - hold
 *        - tax (entry.Tax — per-month manual, credited to dept Tax Payable at accrual)
 *       )
 *
 * "Effective" late rate resolution (first non-null wins):
 *   1. entry.LateFineRate (per-employee-per-month override)
 *   2. employee.CustomLateFineAmount (per-employee override, if HasCustomLateFine)
 *   3. monthlySetting.LateFinePerMinute (per-month snapshot)
 *   4. global.LateFinePerMinute
 *
 * "Effective" working-days resolution (owner ask 2026-08-01 — per-employee
 * override reinstated on top of the 2026-07-29 month-level default; first
 * non-null/non-zero wins):
 *   1. attendance.WorkingDays (per-employee-per-month override, set on the
 *      Attendance page)
 *   2. monthlySetting.WorkingDays (same for every employee that month)
 *   3. calendar days in the month
 */

function daysInMonth(monthId) {
    // monthId = "YYYY-MM" -> number of days
    if (!monthId || monthId.length !== 7) return 30;
    const [y, m] = monthId.split('-').map(Number);
    return new Date(y, m, 0).getDate();
}

function r2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * @param {object} args
 * @param {object} args.employee   — row from gen_EmployeeInfo
 * @param {object} args.attendance — row from hr_AttendanceRecords or null
 * @param {object} args.entry      — row from hr_SalaryEntries or null
 * @param {object} args.global     — { LateFinePerMinute, AbsentFinePerDay }
 * @param {object} [args.monthly]  — per-month snapshot override
 * @param {string} args.monthId    — "YYYY-MM"
 * @returns detailed breakdown + Net
 */
function computeNetPay({ employee, attendance, entry, global, monthly, monthId }) {
    const emp  = employee || {};
    const att  = attendance || { Absents: 0, LateMinutes: 0, LeaveDays: 0, WorkingDays: 0 };
    const ent  = entry || {};
    const g    = global || { LateFinePerMinute: 0, AbsentFinePerDay: 0 };
    const m    = monthly || null;

    const monthDays  = daysInMonth(monthId);
    const basic      = Number(emp.BasicSalary) || 0;

    // Working days: per-employee override (attendance.WorkingDays) beats the
    // month-level default (monthly.WorkingDays), which beats calendar days.
    // Pro-ration: paidDays = workingDays − Absents (unless entry has an
    // explicit PaidDays override).
    const empWorkingDays = Number.isFinite(Number(att.WorkingDays)) && Number(att.WorkingDays) > 0
        ? Number(att.WorkingDays) : null;
    const monthWorkingDays = m && Number.isFinite(Number(m.WorkingDays)) && Number(m.WorkingDays) > 0
        ? Number(m.WorkingDays) : null;
    const effectiveWorkingDays = empWorkingDays ?? monthWorkingDays;
    const baseDays = effectiveWorkingDays ?? monthDays;

    let paidDays;
    if (ent.PaidDays !== undefined && ent.PaidDays !== null && ent.PaidDays !== '') {
        paidDays = Number(ent.PaidDays);
    } else if (effectiveWorkingDays !== null) {
        paidDays = Math.max(0, effectiveWorkingDays - Number(att.Absents || 0));
    } else {
        paidDays = monthDays;
    }
    const prorated = r2((basic / baseDays) * paidDays);

    const fuel      = emp.HasFuelAllowance ? Number(emp.FuelAllowance || 0) : 0;
    // Adjustment column removed 2026-07-29 per owner. Kept in DB with default 0 for
    // existing rows; no longer surfaced in UI or included in the calc.
    const adjustment = 0;

    const additions = r2(prorated + fuel + adjustment);

    // Effective late-fine rate
    const lateRate =
        (ent.LateFineRate !== null && ent.LateFineRate !== undefined && ent.LateFineRate !== '')
            ? Number(ent.LateFineRate)
        : (emp.HasCustomLateFine ? Number(emp.CustomLateFineAmount || 0)
        : (m ? Number(m.LateFinePerMinute) : Number(g.LateFinePerMinute || 0)));

    const absentRate = m ? Number(m.AbsentFinePerDay) : Number(g.AbsentFinePerDay || 0);

    const absentFine = r2(Number(att.Absents || 0) * absentRate);
    const lateFine   = r2(Number(att.LateMinutes || 0) * lateRate);
    const advance    = Number(ent.Advance || 0);
    // Mess rate for this month — MessAmountOverride lets the owner raise or
    // lower the daily rate for a single month without touching the
    // employee's standing default (gen_EmployeeInfo.MessAmount).
    const messRate =
        (ent.MessAmountOverride !== null && ent.MessAmountOverride !== undefined && ent.MessAmountOverride !== '')
            ? Number(ent.MessAmountOverride)
            : Number(emp.MessAmount || 0);
    const messDeduc  = emp.HasMess ? r2(messRate * Number(ent.MessDays || 0)) : 0;
    const manualFine = Number(ent.Fine || 0);
    const eobi       = emp.HasEOBI ? Number(emp.EOBI || 0) : 0;
    const hold       = Number(ent.Hold || 0);
    const tax        = Number(ent.Tax || 0);

    const deductions = r2(absentFine + lateFine + advance + messDeduc + manualFine + eobi + hold + tax);

    const net = Math.max(0, r2(additions - deductions));

    return {
        monthDays, paidDays, effectiveWorkingDays, empWorkingDays, monthWorkingDays,
        basic, prorated, fuel, adjustment,
        additions,
        lateRate, absentRate,
        absentFine, lateFine, advance, messRate, messDeduction: messDeduc, manualFine, eobi, hold, tax,
        deductions,
        net,
    };
}

module.exports = { computeNetPay, daysInMonth };
