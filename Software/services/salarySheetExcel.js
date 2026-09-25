/**
 * The salary sheet as an Excel workbook.
 *
 * Owner ask 2026-09-25. The printed sheet is fixed on the page; HR wanted the
 * same thing in Excel so they can sort it, filter it and add their own working
 * columns without re-keying a hundred employees.
 *
 * It reproduces the legacy Changan payroll layout the print already uses —
 * department blocks, a total per department, one grand total — with the same
 * columns in the same order, so the two can be read side by side.
 *
 * Figures are written as NUMBERS, not text. That is the whole point of Excel
 * over a PDF: the totals have to add up when somebody selects a column.
 *
 * The row mapping mirrors legacyRow() in frontend/src/pages/hr/
 * HrSalarySheetPrint.jsx. If a column changes there, change it here too — the
 * two are deliberately identical so the Excel and the print never disagree.
 */
const XLSX = require('xlsx');

const HEADERS = [
    'SR NO', 'NAME', 'DESIGNATION', 'A/C CODE',
    'BASIC SALARY', 'DAYS', 'TOTAL SALARY', 'FUEL ALLOW',
    'ABSENT', 'ABSENT FINE', 'LATE MIN', 'LATE FINE', 'LEAVE', 'ADV',
    'WORK DAYS', 'MESS DEDUCT', 'FINE', 'EOBI', 'TAX', 'HOLD',
    'NET PAY', 'HOLD+NET+ADV', 'ADJ', 'REMARKS',
];

// Columns that are added up on the department and grand-total rows, by their
// position in HEADERS. Text columns and the "DAYS" input are left blank on a
// total row, exactly as the printed sheet leaves them.
const SUM_COLS = [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? +n.toFixed(2) : 0; };

/** One employee, in the legacy sheet's column order. Mirrors legacyRow(). */
function rowFor(r, indexInSheet) {
    const c = r.Calc || {};
    const att = r.Attendance || {};
    const leave = num(att.LeaveDays);
    const absent = num(att.Absents);
    // "Work days" is a reference figure: the month's standard working days
    // less leave and absence. The DAYS column beside it is the paid-days
    // input, which can be set independently for a partial-period run.
    const stdWorkDays = c.effectiveWorkingDays != null ? c.effectiveWorkingDays : (c.monthWorkingDays || 0);
    const workDays = Math.max(0, num(stdWorkDays) - leave - absent);
    return [
        r.SrNo || indexInSheet + 1,
        r.Name || '',
        r.Designation || '',
        r.AccountCode || '',
        num(c.basic), num(c.paidDays), num(c.prorated), num(c.fuel),
        absent, num(c.absentFine), num(att.LateMinutes), num(c.lateFine), leave, num(c.advance),
        workDays, num(c.messDeduction), num(c.manualFine), num(c.eobi), num(c.tax), num(c.hold),
        num(c.net), num(num(c.hold) + num(c.net) + num(c.advance)), 0,
        r.Entry?.Remarks || '',
    ];
}

const totalRow = (label, rows) => {
    const out = new Array(HEADERS.length).fill('');
    out[0] = label;
    for (const i of SUM_COLS) out[i] = +rows.reduce((s, r) => s + (Number(r[i]) || 0), 0).toFixed(2);
    return out;
};

const monthLabel = (monthId) => {
    const [y, m] = String(monthId || '').split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return Number.isFinite(d.getTime())
        ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : String(monthId || '');
};

/**
 * @param {object} sheet  what buildSheet() returns
 * @param {string} businessName  for the title row
 * @returns {Buffer} an .xlsx file
 */
function buildSalarySheetWorkbook(sheet, businessName = 'Changan Multan Motors') {
    const aoa = [];
    aoa.push([businessName]);
    aoa.push([`Salary Sheet — ${monthLabel(sheet.monthId)}`]);
    aoa.push([]);

    // Departments in the order the sheet already returns them (the query
    // orders by department then Sr No), with unassigned employees last.
    const groups = new Map();
    (sheet.rows || []).forEach((r, i) => {
        const name = r.DepartmentName || 'UNASSIGNED';
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(rowFor(r, i));
    });

    const everyRow = [];
    for (const [name, rows] of groups) {
        aoa.push([`${String(name).toUpperCase()} DEPARTMENT`]);
        aoa.push(HEADERS);
        rows.forEach(r => { aoa.push(r); everyRow.push(r); });
        aoa.push(totalRow(`${String(name).toUpperCase()} DEPARTMENT TOTAL`, rows));
        aoa.push([]);
    }

    if (everyRow.length) aoa.push(totalRow('GRAND TOTAL', everyRow));
    else aoa.push([`No employees in this payroll for ${monthLabel(sheet.monthId)}.`]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Enough width to read names and account titles without dragging columns.
    ws['!cols'] = [
        { wch: 7 }, { wch: 32 }, { wch: 24 }, { wch: 12 },
        { wch: 13 }, { wch: 7 }, { wch: 13 }, { wch: 11 },
        { wch: 8 }, { wch: 12 }, { wch: 9 }, { wch: 11 }, { wch: 8 }, { wch: 11 },
        { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 13 }, { wch: 14 }, { wch: 9 }, { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Sheet');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildSalarySheetWorkbook, HEADERS, rowFor };
