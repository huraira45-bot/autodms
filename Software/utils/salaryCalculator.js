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
 *       )
 *
 * "Effective" late rate resolution (first non-null wins):
 *   1. entry.LateFineRate (per-employee-per-month override)
 *   2. employee.CustomLateFineAmount (per-employee override, if HasCustomLateFine)
 *   3. monthlySetting.LateFinePerMinute (per-month snapshot)
 *   4. global.LateFinePerMinute
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

    const monthDays = daysInMonth(monthId);
    const basic     = Number(emp.BasicSalary) || 0;
    const paidDays  = (ent.PaidDays !== undefined && ent.PaidDays !== null && ent.PaidDays !== '')
        ? Number(ent.PaidDays)
        : monthDays;
    const prorated  = r2((basic / monthDays) * paidDays);

    const fuel      = emp.HasFuelAllowance ? Number(emp.FuelAllowance || 0) : 0;
    const adjustment = Number(ent.Adjustment || 0);

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
    const messDeduc  = emp.HasMess ? r2(Number(emp.MessAmount || 0) * Number(ent.MessDays || 0)) : 0;
    const manualFine = Number(ent.Fine || 0);
    const eobi       = emp.HasEOBI ? Number(emp.EOBI || 0) : 0;
    const hold       = Number(ent.Hold || 0);

    const deductions = r2(absentFine + lateFine + advance + messDeduc + manualFine + eobi + hold);

    const net = Math.max(0, r2(additions - deductions));

    return {
        monthDays, paidDays,
        basic, prorated, fuel, adjustment,
        additions,
        lateRate, absentRate,
        absentFine, lateFine, advance, messDeduction: messDeduc, manualFine, eobi, hold,
        deductions,
        net,
    };
}

module.exports = { computeNetPay, daysInMonth };
