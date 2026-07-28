import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (m) => new Date(m + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

export default function HrCashLetterPrint() {
    const { monthId } = useParams();
    const [sheet, setSheet] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/hr/salary-sheet/${monthId}`)
            .then(r => { setSheet(r.data); setTimeout(() => window.print(), 500); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [monthId]);

    const grouped = useMemo(() => {
        if (!sheet) return [];
        const rows = sheet.rows.filter(r => !r.IsPaidByBank && r.Calc.net > 0);
        const groups = [];
        const idx = new Map();
        rows.forEach(r => {
            const name = r.DepartmentName || 'Unassigned';
            if (!idx.has(name)) { idx.set(name, groups.length); groups.push({ name, rows: [] }); }
            groups[idx.get(name)].rows.push(r);
        });
        return groups.map(g => ({ ...g, subtotal: g.rows.reduce((s, r) => s + r.Calc.net, 0) }));
    }, [sheet]);

    if (err)    return <div style={{ padding: 40, color: '#b91c1c' }}>{err}</div>;
    if (!sheet) return <div style={{ padding: 40 }}>Loading…</div>;

    const total = grouped.reduce((s, g) => s + g.subtotal, 0);
    const empCount = grouped.reduce((s, g) => s + g.rows.length, 0);

    return (
        <div className="letter">
            <PrintBusinessHeader docTitle="Cash Salary Disbursement" docSubtitle={monthName(monthId)} showOnScreen/>

            <p style={{ marginTop: 12 }}>
                Cash disbursement list — {empCount} employees across {grouped.length} departments, total <b>PKR {fmt(total)}</b>.
                Each employee acknowledges receipt of the amount by signing against their name.
            </p>

            {grouped.map(g => (
                <section key={g.name} className="dept">
                    <div className="dept-head">
                        <span className="dept-name">{g.name}</span>
                        <span className="dept-count">{g.rows.length} employees</span>
                    </div>
                    <table className="tbl">
                        <thead>
                            <tr>
                                <th>Sr</th>
                                <th>Employee Name</th>
                                <th>Designation</th>
                                <th>CNIC</th>
                                <th className="num">Amount (PKR)</th>
                                <th style={{ width: '25%' }}>Signature</th>
                            </tr>
                        </thead>
                        <tbody>
                            {g.rows.map((r, i) => (
                                <tr key={r.EmployeeID}>
                                    <td>{i+1}</td>
                                    <td className="emp">{r.Name}</td>
                                    <td>{r.Designation || '—'}</td>
                                    <td className="cnic">{r.Employee.CNICno || '—'}</td>
                                    <td className="num">{fmt(r.Calc.net)}</td>
                                    <td></td>
                                </tr>
                            ))}
                            <tr className="subtot">
                                <td colSpan={4} className="right">Department Subtotal — {g.name}</td>
                                <td className="num">{fmt(g.subtotal)}</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            ))}

            <div className="grand">
                <span>GRAND TOTAL — {empCount} employees across {grouped.length} departments</span>
                <span className="grand-amt">Rs. {fmt(total)}</span>
            </div>

            <div className="sig-row">
                <div className="sig"><div className="line"/><b>Prepared By</b></div>
                <div className="sig"><div className="line"/><b>Cashier</b></div>
                <div className="sig"><div className="line"/><b>Approved By</b></div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body { margin: 0; background: white !important; }
                .letter { font-family: Arial, sans-serif; font-size: 11.5px; color: #000; padding: 12mm; max-width: 210mm; margin: 0 auto; box-sizing: border-box; }
                .letter p { line-height: 1.5; margin: 6px 0; }
                .dept { margin-top: 10px; page-break-inside: avoid; }
                .dept-head { background: #1f2937; color: #fff; padding: 4px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; }
                .dept-name { font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
                .tbl { width: 100%; border-collapse: collapse; }
                .tbl th, .tbl td { padding: 5px 8px; border: 1px solid #94a3b8; font-size: 10.5px; }
                .tbl th { background: #e5e7eb; text-align: left; }
                .tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
                .tbl .emp { font-weight: 600; }
                .tbl .cnic { font-family: 'Courier New', monospace; }
                .tbl tr.subtot td { background: #f8fafc; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
                .tbl tr.subtot td.right { text-align: right; }
                .grand { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: #111827; color: #fff; margin-top: 8px; }
                .grand-amt { font-weight: 700; font-size: 14px; }
                .sig-row { display: flex; gap: 40px; margin-top: 40px; padding: 0 20px; page-break-inside: avoid; }
                .sig { flex: 1; text-align: center; font-size: 11px; }
                .sig .line { border-bottom: 1px solid #000; padding-top: 30px; margin-bottom: 4px; }
                @media screen { .letter { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; } }
            `}</style>
        </div>
    );
}
