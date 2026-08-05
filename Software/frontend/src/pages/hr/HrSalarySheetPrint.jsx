import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt   = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Legacy sheet shows whole rupees, no paisa (owner-supplied reference PDF,
// 2026-08-05) — separate formatter so the other print variants are untouched.
const money = (n) => Math.round(Number(n) || 0).toLocaleString('en-PK');
// Day-count columns (Days, Leave, Absent, Work Days) show a decimal only
// when the value actually has one (26, 24.5, 21.5 — never "26.0").
const days  = (n) => { const v = Number(n) || 0; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
const monthLabel = (m) => new Date(m + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

// ?type=eobi-bank → EOBI employees paid via bank
// ?type=eobi-cash → EOBI employees paid via cash
// ?type=noneobi   → non-EOBI employees (always cash)
// ?type=eobi      → all EOBI (bank + cash)
// missing         → single combined sheet, department-wise, everyone
//                    together, laid out exactly like the legacy Changan
//                    payroll sheet (owner-supplied reference PDF, owner ask
//                    2026-08-05) — no EOBI/Non-EOBI distinction anywhere.
// No EOBI / Non-EOBI labels appear on the printed sheet (owner ask 2026-07-29).
export default function HrSalarySheetPrint() {
    const { monthId } = useParams();
    const [qs] = useSearchParams();
    const type = qs.get('type');
    const [sheet, setSheet] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/hr/salary-sheet/${monthId}`)
            .then(r => { setSheet(r.data); setTimeout(() => window.print(), 500); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [monthId]);

    // Filter rows by the requested payroll category, then group by department.
    // Owner ask 2026-07-29: don't render EOBI / Non-EOBI labels on the sheet.
    const grouped = useMemo(() => {
        if (!sheet) return [];
        const rows = sheet.rows.filter(r => {
            const eobi = !!r.Employee.HasEOBI;
            const bank = !!r.IsPaidByBank;
            switch (type) {
                case 'eobi-bank': return eobi && bank;
                case 'eobi-cash': return eobi && !bank;
                case 'noneobi':   return !eobi;
                case 'eobi':      return eobi;
                default:          return true;
            }
        });
        const groups = [];
        const idx = new Map();
        rows.forEach(r => {
            const name = r.DepartmentName || 'Unassigned';
            if (!idx.has(name)) { idx.set(name, groups.length); groups.push({ name, rows: [] }); }
            groups[idx.get(name)].rows.push(r);
        });
        return groups.map(g => ({ ...g, subtotal: g.rows.reduce((s, r) => s + r.Calc.net, 0) }));
    }, [sheet, type]);

    if (err)    return <div style={{ padding: 40, color: '#b91c1c' }}>Cannot print: {err}</div>;
    if (!sheet) return <div style={{ padding: 40 }}>Loading…</div>;

    if (!type) return <CombinedLegacySheet sheet={sheet} monthId={monthId} grouped={grouped} />;

    const empCount = grouped.reduce((s, g) => s + g.rows.length, 0);
    const totalNet = grouped.reduce((s, g) => s + g.subtotal, 0);

    return (
        <div className="sheet">
            <PrintBusinessHeader docTitle="Salary Sheet" docSubtitle={monthLabel(monthId)} showOnScreen/>

            <div className="meta">
                <span><b>Late Fine/min:</b> {fmt(sheet.effectiveLateRate)}</span>
                <span><b>Absent Fine/day:</b> {fmt(sheet.effectiveAbsentRate)}</span>
                <span><b>Departments:</b> {grouped.length}</span>
                <span><b>Employees:</b> {empCount}</span>
            </div>

            {grouped.map(g => (
                <section key={g.name} className="dept">
                    <div className="dept-head">
                        <span className="dept-name">{g.name}</span>
                        <span className="dept-count">{g.rows.length} employees</span>
                    </div>
                    <table className="sheet-tbl">
                        {/* Fixed % widths (sum to 100) so every column always fits one
                            A4-landscape page-width — without this, table-layout:auto
                            squeezes Employee/Designation down to nothing and wraps names
                            letter-by-letter (owner report 2026-08-04: "wied", "follow the
                            A4 rule"). */}
                        <colgroup>
                            {[4, 12, 10, 5.5, 5.5, 4.5, 5, 5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 6.5, 5, 10]
                                .map((w, ci) => <col key={ci} style={{ width: `${w}%` }} />)}
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Sr</th><th>Employee</th><th>Designation</th>
                                <th className="num">Basic</th>
                                <th className="num">Prorated</th>
                                <th className="num">Fuel</th>
                                <th className="num">Abs Fine</th>
                                <th className="num">Late Fine</th>
                                <th className="num">Adv</th>
                                <th className="num">Mess</th>
                                <th className="num">Fine</th>
                                <th className="num">EOBI</th>
                                <th className="num">Tax</th>
                                <th className="num">Hold</th>
                                <th className="num net">Net</th>
                                <th>Mode</th>
                                <th>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {g.rows.map((r, i) => (
                                <tr key={r.EmployeeID}>
                                    <td>{r.SrNo || i+1}</td>
                                    <td className="emp">{r.Name}</td>
                                    <td className="desig">{r.Designation || ''}</td>
                                    <td className="num">{fmt(r.Calc.basic)}</td>
                                    <td className="num">{fmt(r.Calc.prorated)}</td>
                                    <td className="num">{fmt(r.Calc.fuel)}</td>
                                    <td className="num">{fmt(r.Calc.absentFine)}</td>
                                    <td className="num">{fmt(r.Calc.lateFine)}</td>
                                    <td className="num">{fmt(r.Calc.advance)}</td>
                                    <td className="num">{fmt(r.Calc.messDeduction)}</td>
                                    <td className="num">{fmt(r.Calc.manualFine)}</td>
                                    <td className="num">{fmt(r.Calc.eobi)}</td>
                                    <td className="num">{fmt(r.Calc.tax)}</td>
                                    <td className="num">{fmt(r.Calc.hold)}</td>
                                    <td className="num net">{fmt(r.Calc.net)}</td>
                                    <td>{r.IsPaidByBank ? 'Bank' : 'Cash'}</td>
                                    <td className="remarks">{r.Entry?.Remarks || ''}</td>
                                </tr>
                            ))}
                            <tr className="subtot">
                                <td colSpan={14} className="right">Department Subtotal — {g.name}</td>
                                <td className="num net">{fmt(g.subtotal)}</td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            ))}

            {!grouped.length && (
                <div style={{ padding: 20, background: '#fef3c7', border: '1px solid #fcd34d' }}>
                    No employees in this payroll for {monthLabel(monthId)}.
                </div>
            )}

            <div className="grand">
                <span>GRAND TOTAL ({grouped.length} departments · {empCount} employees)</span>
                <span className="grand-amt">Rs. {fmt(totalNet)}</span>
            </div>

            <div className="sigs">
                <div className="sig"><div className="line"/><b>Prepared By</b></div>
                <div className="sig"><div className="line"/><b>Accounts Manager</b></div>
                <div className="sig"><div className="line"/><b>Approved By</b></div>
            </div>

            <style>{`
                @page { size: A4 landscape; margin: 8mm; }
                html, body { margin: 0; width: 100%; background: white !important; }
                /* Owner report 2026-08-04: printed sheet left a large blank
                   strip on the right instead of covering the page. @page
                   already reserves 8mm all round -- .sheet's own padding was
                   compounding on top of that AND it had no explicit width,
                   so it wasn't reliably filling the page's content box.
                   box-sizing:border-box + width:100% guarantees it always
                   does, regardless of its own padding. */
                .sheet { box-sizing: border-box; width: 100%; margin: 0 auto;
                         font-family: Arial, sans-serif; font-size: 10px; color: #000; padding: 2mm 3mm; }
                .meta { display: flex; gap: 20px; margin: 6px 0 12px; font-size: 10px; color: #333; }
                .dept { margin-bottom: 8px; page-break-inside: avoid; }
                .dept-head { background: #1f2937; color: #fff; padding: 4px 10px; display: flex; justify-content: space-between; align-items: center; }
                .dept-name { font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; }
                .dept-count { font-size: 10px; opacity: 0.85; }
                .sheet-tbl { width: 100%; table-layout: fixed; border-collapse: collapse; }
                .sheet-tbl th, .sheet-tbl td { padding: 3px 5px; border: 1px solid #94a3b8; font-size: 9px;
                                                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .sheet-tbl th { background: #e5e7eb; text-align: left; }
                .sheet-tbl th.net { background: #fef3c7; }
                .sheet-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
                .sheet-tbl .net { background: #fffbeb; font-weight: 700; }
                .sheet-tbl .emp { font-weight: 600; }
                .sheet-tbl .desig { color: #444; }
                .sheet-tbl .remarks { color: #444; font-style: italic; }
                .sheet-tbl tr.subtot td { background: #f8fafc; font-weight: 700; }
                .sheet-tbl tr.subtot td.right { text-align: right; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.3px; }
                .grand { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: #111827; color: #fff; margin-top: 8px; }
                .grand-amt { font-weight: 700; font-size: 14px; }
                .sigs { display: flex; gap: 40px; margin-top: 30px; padding: 0 20px; page-break-inside: avoid; }
                .sig { flex: 1; text-align: center; font-size: 10px; }
                .sig .line { border-bottom: 1px solid #000; padding-top: 30px; margin-bottom: 4px; }
                @media screen { .sheet { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; max-width: 297mm; } }
            `}</style>
        </div>
    );
}

// ============================================================================
// CombinedLegacySheet — recreates the legacy Changan payroll sheet layout
// exactly (owner-supplied reference PDF, owner ask 2026-08-05): SR/NAME/
// DESIGNATION/A-C CODE/BASIC/DAYS/TOTAL SALARY/FUEL/ABSENT/ABSENT FINE/
// LATE MIN/LATE FINE/LEAVE/ADV/WORK DAYS/MESS DEDUCT/FINE/EOBI/HOLD/NET
// PAY/HOLD+NET+ADV/ADJ/REMARKS, department blocks + department totals +
// one grand total row, 5 signature blocks. No new backend fields needed —
// everything comes from the existing salary-sheet response (Calc/
// Attendance/Entry/AccountCode already carry all of it).
// ============================================================================
function legacyRow(r, i) {
    const c = r.Calc;
    const att = r.Attendance || {};
    const leave = Number(att.LeaveDays) || 0;
    const absent = Number(att.Absents) || 0;
    // "Work Days" is a reference figure only (this sheet's own "Days" column
    // — the actual paid-days input — can be set independently, e.g. a
    // company-wide partial-period run). effectiveWorkingDays already
    // resolves per-employee override -> month setting, matching the
    // legacy sheet's fixed per-month standard (26 in the reference PDF).
    const stdWorkDays = c.effectiveWorkingDays != null ? c.effectiveWorkingDays : (c.monthWorkingDays || 0);
    const workDays = Math.max(0, stdWorkDays - leave - absent);
    return {
        key: r.EmployeeID,
        sr: r.SrNo || i + 1,
        name: r.Name,
        designation: r.Designation || '',
        acCode: r.AccountCode || '',
        basic: c.basic,
        paidDays: c.paidDays,
        totalSalary: c.prorated,
        fuel: c.fuel,
        absent,
        absentFine: c.absentFine,
        lateMin: Number(att.LateMinutes) || 0,
        lateFine: c.lateFine,
        leave,
        adv: c.advance,
        workDays,
        messDeduct: c.messDeduction,
        fine: c.manualFine,
        eobi: c.eobi,
        hold: c.hold,
        netPay: c.net,
        holdNetAdv: +(c.hold + c.net + c.advance).toFixed(2),
        adj: 0,
        remarks: r.Entry?.Remarks || '',
    };
}

const LEGACY_SUM_FIELDS = ['basic', 'totalSalary', 'fuel', 'absent', 'absentFine', 'lateMin', 'lateFine',
    'leave', 'adv', 'workDays', 'messDeduct', 'fine', 'eobi', 'hold', 'netPay', 'holdNetAdv', 'adj'];

function sumLegacyRows(rows) {
    const t = {};
    for (const f of LEGACY_SUM_FIELDS) t[f] = 0;
    for (const r of rows) for (const f of LEGACY_SUM_FIELDS) t[f] += Number(r[f]) || 0;
    return t;
}

// Owner report 2026-08-06: numeric values (esp. department/grand totals
// like "3,743,723") were getting truncated with "..." or overlapping
// adjacent columns. Widths below are sized for the largest realistic
// formatted value per column at the print font-size (see .ltbl CSS) on
// A3 landscape — money columns get enough room for 7-digit totals with
// thousands separators; Name/Designation/Remarks can wrap onto a second
// line instead of needing guaranteed single-line width, so they gave up
// some of their share to the numeric columns. Sums to exactly 100.
const LEGACY_COL_WIDTHS = [2, 8, 7, 3.5, 6, 2.2, 6, 4, 2.5, 4.3, 3, 4.3, 2.5, 4, 3, 4, 4, 4, 4, 5, 5.5, 3, 8.2];

function CombinedLegacySheet({ sheet, monthId, grouped }) {
    const deptRows = useMemo(() => grouped.map(g => ({
        name: g.name,
        rows: g.rows.map((r, i) => legacyRow(r, i)),
    })), [grouped]);
    const grand = useMemo(() => sumLegacyRows(deptRows.flatMap(g => g.rows)), [deptRows]);
    const empCount = deptRows.reduce((s, g) => s + g.rows.length, 0);

    return (
        <div className="lsheet">
            <PrintBusinessHeader docTitle="Salary Sheet" docSubtitle={`FMO ${monthLabel(monthId).toUpperCase()}`} showOnScreen/>

            {deptRows.map(g => {
                const t = sumLegacyRows(g.rows);
                return (
                    <section key={g.name} className="ldept">
                        <div className="ldept-head">{g.name.toUpperCase()} DEPARTMENT</div>
                        <table className="ltbl">
                            <colgroup>
                                {LEGACY_COL_WIDTHS.map((w, ci) => <col key={ci} style={{ width: `${w}%` }} />)}
                            </colgroup>
                            <thead>
                                {/* Repeats with the rest of thead on every printed page this
                                    department's table spans, so a continuation page still shows
                                    which department the rows belong to (owner ask 2026-08-07). */}
                                <tr>
                                    <th colSpan={LEGACY_COL_WIDTHS.length} className="dept-repeat-head">{g.name.toUpperCase()} DEPARTMENT</th>
                                </tr>
                                <tr>
                                    <th>SR<br/>NO</th><th>NAME</th><th>DESIGNATION</th><th>A/C<br/>CODE</th>
                                    <th className="num">BASIC<br/>SALARY</th>
                                    <th className="num">DAYS</th>
                                    <th className="num">TOTAL<br/>SALARY</th>
                                    <th className="num">FUEL<br/>ALLOW</th>
                                    <th className="num">ABSENT</th>
                                    <th className="num">ABSENT<br/>FINE</th>
                                    <th className="num">LATE<br/>MIN</th>
                                    <th className="num">LATE<br/>FINE</th>
                                    <th className="num">LEAVE</th>
                                    <th className="num">ADV</th>
                                    <th className="num">WORK<br/>DAYS</th>
                                    <th className="num">MESS<br/>DEDUCT</th>
                                    <th className="num">FINE</th>
                                    <th className="num">EOBI</th>
                                    <th className="num">HOLD</th>
                                    <th className="num net">NET<br/>PAY</th>
                                    <th className="num">HOLD+NET<br/>+ADV</th>
                                    <th className="num">ADJ</th>
                                    <th>REMARKS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {g.rows.map(r => (
                                    <tr key={r.key}>
                                        <td>{r.sr}</td>
                                        <td className="emp">{r.name}</td>
                                        <td className="desig">{r.designation}</td>
                                        <td>{r.acCode}</td>
                                        <td className="num">{money(r.basic)}</td>
                                        <td className="num">{days(r.paidDays)}</td>
                                        <td className="num">{money(r.totalSalary)}</td>
                                        <td className="num">{r.fuel ? money(r.fuel) : '-'}</td>
                                        <td className="num">{days(r.absent)}</td>
                                        <td className="num neg">{r.absentFine ? money(r.absentFine) : '0'}</td>
                                        <td className="num">{days(r.lateMin)}</td>
                                        <td className="num neg">{r.lateFine ? money(r.lateFine) : '0'}</td>
                                        <td className="num">{days(r.leave)}</td>
                                        <td className="num">{r.adv ? money(r.adv) : '0'}</td>
                                        <td className="num">{days(r.workDays)}</td>
                                        <td className="num">{r.messDeduct ? money(r.messDeduct) : '-'}</td>
                                        <td className="num">{r.fine ? money(r.fine) : '0'}</td>
                                        <td className="num">{r.eobi ? money(r.eobi) : '-'}</td>
                                        <td className="num">{r.hold ? money(r.hold) : '0'}</td>
                                        <td className="num net">{money(r.netPay)}</td>
                                        <td className="num">{money(r.holdNetAdv)}</td>
                                        <td className="num">{money(r.adj)}</td>
                                        <td className="remarks">{r.remarks}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {/* Department total lives in a real tfoot now, displayed as an
                                ordinary row-group (see .ltbl tfoot below) so it flows once,
                                strictly after every employee row in this department, instead
                                of repeating as a floating footer on each printed page. */}
                            <tfoot>
                                <tr className="subtot">
                                    <td colSpan={4}>{g.name.toUpperCase()} DEPARTMENT TOTAL</td>
                                    <td className="num">{money(t.basic)}</td>
                                    <td></td>
                                    <td className="num">{money(t.totalSalary)}</td>
                                    <td className="num">{money(t.fuel)}</td>
                                    <td className="num">{days(t.absent)}</td>
                                    <td className="num">{money(t.absentFine)}</td>
                                    <td className="num">{days(t.lateMin)}</td>
                                    <td className="num">{money(t.lateFine)}</td>
                                    <td className="num">{days(t.leave)}</td>
                                    <td className="num">{money(t.adv)}</td>
                                    <td className="num">{days(t.workDays)}</td>
                                    <td className="num">{money(t.messDeduct)}</td>
                                    <td className="num">{money(t.fine)}</td>
                                    <td className="num">{money(t.eobi)}</td>
                                    <td className="num">{money(t.hold)}</td>
                                    <td className="num net">{money(t.netPay)}</td>
                                    <td className="num">{money(t.holdNetAdv)}</td>
                                    <td className="num">{money(t.adj)}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </section>
                );
            })}

            {!deptRows.length && (
                <div style={{ padding: 20, background: '#fef3c7', border: '1px solid #fcd34d' }}>
                    No employees in this payroll for {monthLabel(monthId)}.
                </div>
            )}

            <table className="ltbl grand-tbl">
                <colgroup>
                    {LEGACY_COL_WIDTHS.map((w, ci) => <col key={ci} style={{ width: `${w}%` }} />)}
                </colgroup>
                <tbody>
                    <tr className="grandrow">
                        <td colSpan={4}>GRAND TOTALS</td>
                        <td className="num">{money(grand.basic)}</td>
                        <td></td>
                        <td className="num">{money(grand.totalSalary)}</td>
                        <td className="num">{money(grand.fuel)}</td>
                        <td className="num">{days(grand.absent)}</td>
                        <td className="num">{money(grand.absentFine)}</td>
                        <td className="num">{days(grand.lateMin)}</td>
                        <td className="num">{money(grand.lateFine)}</td>
                        <td className="num">{days(grand.leave)}</td>
                        <td className="num">{money(grand.adv)}</td>
                        <td className="num">{days(grand.workDays)}</td>
                        <td className="num">{money(grand.messDeduct)}</td>
                        <td className="num">{money(grand.fine)}</td>
                        <td className="num">{money(grand.eobi)}</td>
                        <td className="num">{money(grand.hold)}</td>
                        <td className="num net">{money(grand.netPay)}</td>
                        <td className="num">{money(grand.holdNetAdv)}</td>
                        <td className="num">{money(grand.adj)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <div className="lnetpay">
                <span>NET PAYABLE:</span>
                <span className="lnetpay-amt">{money(grand.netPay)}</span>
            </div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
                {deptRows.length} department{deptRows.length === 1 ? '' : 's'} · {empCount} employees
            </div>

            <div className="lsigs">
                <div className="lsig"><div className="lline"/><b>Prepared By</b></div>
                <div className="lsig"><div className="lline"/><b>Checked By (Accounts)</b></div>
                <div className="lsig"><div className="lline"/><b>Verified By (Audit)</b></div>
                <div className="lsig"><div className="lline"/><b>HR Signature</b></div>
                <div className="lsig"><div className="lline"/><b>CEO</b></div>
            </div>

            <style>{`
                /* Owner ask 2026-08-06: numeric values were getting compressed,
                   ellipsis-truncated, or overlapping adjacent columns. A3
                   landscape gives ~44% more usable width than A4 landscape at
                   the same margins, and every numeric cell below is explicit
                   about never truncating/wrapping -- ellipsis and
                   overflow:hidden are banned from .num entirely; only the
                   free-text cells (Name/Designation/Remarks) are allowed to
                   wrap onto a second line. Scoped to this component's own
                   .lsheet/.ltbl classes only -- the normal on-screen Salary
                   Sheet and the other (EOBI Bank/Cash, Non-EOBI) print
                   variants are untouched. */
                /* Owner report 2026-08-07: employees near the bottom of a page were
                   being hidden/clipped instead of continuing onto the next page.
                   Cause: .ldept (the department wrapper) had break-inside:avoid on
                   a block that can run far taller than a single page -- when a
                   block that large can't fit either on the remainder of the
                   current page OR on a fresh page, "avoid" forces the browser into
                   an all-or-nothing break that ends up clipping/hiding content
                   instead of flowing it normally. Departments must be allowed to
                   split across pages; only individual rows (and the two total
                   rows) stay intact as a unit. */
                @page { size: A3 landscape; margin: 10mm 8mm 14mm; }
                html, body { margin: 0; width: 100%; background: white !important; }
                .lsheet { box-sizing: border-box; width: 100%; margin: 0 auto;
                          font-family: Arial, sans-serif; font-size: 8.5px; color: #000; padding: 2mm 3mm; }
                .ldept { margin-bottom: 6px; }
                .ldept-head { background: #e5e7eb; padding: 3px 8px; font-weight: 700; font-size: 9.5px;
                              letter-spacing: 0.3px; border: 1px solid #94a3b8; border-bottom: none; }
                .ltbl { width: 100%; min-width: 380mm; table-layout: fixed; border-collapse: collapse; }
                /* Header repeats on every printed page a table spans, including the
                   department-name row -- so a department that continues onto a new
                   page still shows which department the rows belong to. */
                .ltbl thead { display: table-header-group; }
                .ltbl .dept-repeat-head { background: #1f2937; color: #fff; text-align: left;
                                           font-size: 9.5px; letter-spacing: 0.4px; padding: 3px 6px; }
                /* table-row-group (not table-footer-group): the department total must
                   flow once, right after that department's own rows -- never repeat
                   as a floating footer on every page, and never appear before all
                   employee rows have rendered. */
                .ltbl tfoot { display: table-row-group; }
                .ltbl tbody { break-inside: auto; page-break-inside: auto; }
                .ltbl th, .ltbl td { padding: 2px 4px; border: 1px solid #94a3b8; font-size: 8px; line-height: 1.2; }
                .ltbl th { background: #f1f3f5; text-align: left; font-weight: 700; white-space: normal; }
                .ltbl th.net { background: #fde68a; }
                /* Free-text columns: allowed to wrap, never truncated either. */
                .ltbl td.emp, .ltbl td.desig, .ltbl td.remarks { white-space: normal; overflow-wrap: break-word; word-break: break-word; }
                .ltbl .emp { font-weight: 600; }
                .ltbl .desig { color: #333; }
                .ltbl .remarks { color: #444; font-style: italic; }
                /* Numeric columns: the whole point of this fix -- always
                   complete, always inside their own cell, never wrapped,
                   never ellipsis-truncated, never clipped. */
                .ltbl .num, .ltbl th.num {
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                }
                .ltbl .neg { color: #b91c1c; }
                .ltbl .net { background: #fffbeb; font-weight: 700; }
                .ltbl tr { break-inside: avoid; page-break-inside: avoid; }
                .ltbl tr.subtot td { background: #f1f3f5; font-weight: 700; white-space: nowrap; }
                .ltbl tr.subtot td.num { overflow: visible; text-overflow: clip; }
                .ltbl tr.grandrow { break-inside: avoid; page-break-inside: avoid; }
                .ltbl tr.grandrow td { background: #111827; color: #fff; font-weight: 700; font-size: 9.5px; padding: 4px 6px;
                                        white-space: nowrap; overflow: visible; text-overflow: clip; }
                .grand-tbl { margin-top: 4px; }
                .lnetpay { display: flex; gap: 10px; align-items: baseline; justify-content: flex-end;
                           margin-top: 10px; padding-right: 8px; font-weight: 700; font-size: 12px; white-space: nowrap; }
                .lnetpay-amt { font-size: 15px; white-space: nowrap; }
                .lsigs { display: flex; gap: 20px; margin-top: 34px; padding: 0 10px; break-inside: avoid; page-break-inside: avoid; }
                .lsig { flex: 1; text-align: center; font-size: 9px; }
                .lline { border-bottom: 1px solid #000; padding-top: 26px; margin-bottom: 4px; }
                @media screen { .lsheet { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; max-width: 420mm; } }
            `}</style>
        </div>
    );
}
