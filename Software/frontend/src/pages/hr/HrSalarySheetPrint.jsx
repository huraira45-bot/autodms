import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (m) => new Date(m + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

export default function HrSalarySheetPrint() {
    const { monthId } = useParams();
    const [sheet, setSheet] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/hr/salary-sheet/${monthId}`)
            .then(r => { setSheet(r.data); setTimeout(() => window.print(), 500); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [monthId]);

    // Two payroll categories (EOBI / Non-EOBI), each grouped by department.
    const categories = useMemo(() => {
        if (!sheet) return [];
        const cats = [
            { key: 'eobi',    label: 'EOBI Payroll',      match: r => r.Employee.HasEOBI },
            { key: 'noneobi', label: 'Non-EOBI Payroll',  match: r => !r.Employee.HasEOBI },
        ];
        return cats.map(cat => {
            const rows = sheet.rows.filter(cat.match);
            const groups = [];
            const idx = new Map();
            rows.forEach(r => {
                const name = r.DepartmentName || 'Unassigned';
                if (!idx.has(name)) { idx.set(name, groups.length); groups.push({ name, rows: [] }); }
                groups[idx.get(name)].rows.push(r);
            });
            return {
                ...cat,
                rows,
                groups: groups.map(g => ({ ...g, subtotal: g.rows.reduce((s, r) => s + r.Calc.net, 0) })),
                subtotal: rows.reduce((s, r) => s + r.Calc.net, 0),
                empCount: rows.length,
            };
        }).filter(cat => cat.empCount > 0);
    }, [sheet]);

    if (err)    return <div style={{ padding: 40, color: '#b91c1c' }}>Cannot print: {err}</div>;
    if (!sheet) return <div style={{ padding: 40 }}>Loading…</div>;

    const totalNet = categories.reduce((s, c) => s + c.subtotal, 0);
    const totalDepts = categories.reduce((s, c) => s + c.groups.length, 0);

    return (
        <div className="sheet">
            <PrintBusinessHeader docTitle="Salary Sheet" docSubtitle={monthLabel(monthId)} showOnScreen/>

            <div className="meta">
                <span><b>Late Fine/min:</b> {fmt(sheet.effectiveLateRate)}</span>
                <span><b>Absent Fine/day:</b> {fmt(sheet.effectiveAbsentRate)}</span>
                <span><b>Categories:</b> {categories.length}</span>
                <span><b>Departments:</b> {totalDepts}</span>
                <span><b>Employees:</b> {sheet.rows.length}</span>
            </div>

            {categories.map(cat => (
                <div key={cat.key} className={`cat cat-${cat.key}`}>
                    <div className="cat-head">
                        <span>{cat.label}</span>
                        <span className="cat-meta">{cat.empCount} employees · Net Rs. {fmt(cat.subtotal)}</span>
                    </div>
                    {cat.groups.map(g => (
                <section key={g.name} className="dept">
                    <div className="dept-head">
                        <span className="dept-name">{g.name}</span>
                        <span className="dept-count">{g.rows.length} employees</span>
                    </div>
                    <table className="sheet-tbl">
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
                                <th className="num">Hold</th>
                                <th className="num">Adjust</th>
                                <th className="num net">Net</th>
                                <th>Mode</th>
                            </tr>
                        </thead>
                        <tbody>
                            {g.rows.map((r, i) => (
                                <tr key={r.EmployeeID}>
                                    <td>{r.SrNo || i+1}</td>
                                    <td className="emp">{r.Name}</td>
                                    <td>{r.Designation || ''}</td>
                                    <td className="num">{fmt(r.Calc.basic)}</td>
                                    <td className="num">{fmt(r.Calc.prorated)}</td>
                                    <td className="num">{fmt(r.Calc.fuel)}</td>
                                    <td className="num">{fmt(r.Calc.absentFine)}</td>
                                    <td className="num">{fmt(r.Calc.lateFine)}</td>
                                    <td className="num">{fmt(r.Calc.advance)}</td>
                                    <td className="num">{fmt(r.Calc.messDeduction)}</td>
                                    <td className="num">{fmt(r.Calc.manualFine)}</td>
                                    <td className="num">{fmt(r.Calc.eobi)}</td>
                                    <td className="num">{fmt(r.Calc.hold)}</td>
                                    <td className="num">{fmt(r.Calc.adjustment)}</td>
                                    <td className="num net">{fmt(r.Calc.net)}</td>
                                    <td>{r.IsPaidByBank ? 'Bank' : 'Cash'}</td>
                                </tr>
                            ))}
                            <tr className="subtot">
                                <td colSpan={14} className="right">Department Subtotal — {g.name}</td>
                                <td className="num net">{fmt(g.subtotal)}</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </section>
                    ))}
                    <div className="cat-total">
                        <span>{cat.label} — {cat.empCount} employees</span>
                        <span className="cat-total-amt">Rs. {fmt(cat.subtotal)}</span>
                    </div>
                </div>
            ))}

            <div className="grand">
                <span>GRAND TOTAL ({totalDepts} departments · {sheet.rows.length} employees)</span>
                <span className="grand-amt">Rs. {fmt(totalNet)}</span>
            </div>

            <div className="sigs">
                <div className="sig"><div className="line"/><b>Prepared By</b></div>
                <div className="sig"><div className="line"/><b>Accounts Manager</b></div>
                <div className="sig"><div className="line"/><b>Approved By</b></div>
            </div>

            <style>{`
                @page { size: A4 landscape; margin: 8mm; }
                html, body { margin: 0; background: white !important; }
                .sheet { font-family: Arial, sans-serif; font-size: 10px; color: #000; padding: 6mm; }
                .meta { display: flex; gap: 20px; margin: 6px 0 12px; font-size: 10px; color: #333; }
                .cat { margin-bottom: 14px; }
                .cat-head { display: flex; justify-content: space-between; align-items: center;
                            padding: 6px 12px; color: #fff; font-weight: 700; font-size: 11px;
                            text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
                .cat-eobi    .cat-head { background: #7c3aed; }
                .cat-noneobi .cat-head { background: #b91c1c; }
                .cat-meta { font-size: 10px; opacity: 0.95; text-transform: none; letter-spacing: 0.3px; }
                .cat-total { display: flex; justify-content: space-between; align-items: center;
                             padding: 6px 12px; background: #f8fafc; border: 1px solid #cbd5e1;
                             font-weight: 700; font-size: 10.5px; text-transform: uppercase;
                             letter-spacing: 0.3px; margin-top: 4px; }
                .cat-total-amt { font-size: 12px; }
                .cat-eobi    .cat-total-amt { color: #7c3aed; }
                .cat-noneobi .cat-total-amt { color: #b91c1c; }
                .dept { margin-bottom: 8px; page-break-inside: avoid; }
                .dept-head { background: #1f2937; color: #fff; padding: 4px 10px; display: flex; justify-content: space-between; align-items: center; }
                .dept-name { font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; }
                .dept-count { font-size: 10px; opacity: 0.85; }
                .sheet-tbl { width: 100%; border-collapse: collapse; }
                .sheet-tbl th, .sheet-tbl td { padding: 3px 5px; border: 1px solid #94a3b8; font-size: 10px; }
                .sheet-tbl th { background: #e5e7eb; text-align: left; }
                .sheet-tbl th.net { background: #fef3c7; }
                .sheet-tbl .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
                .sheet-tbl .net { background: #fffbeb; font-weight: 700; }
                .sheet-tbl .emp { font-weight: 600; }
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
