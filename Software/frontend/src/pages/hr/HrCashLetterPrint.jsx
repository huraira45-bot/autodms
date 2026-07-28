import { useEffect, useState } from 'react';
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

    if (err)    return <div style={{ padding: 40, color: '#b91c1c' }}>{err}</div>;
    if (!sheet) return <div style={{ padding: 40 }}>Loading…</div>;

    const cashRows = sheet.rows.filter(r => !r.IsPaidByBank && r.Calc.net > 0);
    const total = cashRows.reduce((s, r) => s + r.Calc.net, 0);

    return (
        <div className="letter">
            <PrintBusinessHeader docTitle="Cash Salary Disbursement" docSubtitle={`Month: ${monthName(monthId)}`} showOnScreen />

            <p style={{ marginTop: 12 }}>
                Cash disbursement list for {cashRows.length} employees, total <b>PKR {fmt(total)}</b>.
                Each employee acknowledges receipt of the amount by signing against their name.
            </p>

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
                    {cashRows.map((r, i) => (
                        <tr key={r.EmployeeID}>
                            <td>{i+1}</td>
                            <td>{r.Name}</td>
                            <td>{r.Designation || '—'}</td>
                            <td>{r.Employee.CNICno || '—'}</td>
                            <td className="num">{fmt(r.Calc.net)}</td>
                            <td></td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                        <td className="num" style={{ fontWeight: 700 }}>{fmt(total)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>

            <div className="sig-row">
                <div className="sig"><div className="line"/><b>Prepared By</b></div>
                <div className="sig"><div className="line"/><b>Cashier</b></div>
                <div className="sig"><div className="line"/><b>Approved By</b></div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body { margin: 0; background: white !important; }
                .letter { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 12mm; max-width: 210mm; margin: 0 auto; box-sizing: border-box; }
                .letter p { line-height: 1.5; margin: 6px 0; }
                .tbl { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 40px; }
                .tbl th, .tbl td { padding: 6px 8px; border: 1px solid #000; font-size: 11px; }
                .tbl th { background: #e5e7eb; text-align: left; }
                .tbl .num { text-align: right; }
                .sig-row { display: flex; gap: 40px; margin-top: 40px; padding: 0 20px; }
                .sig { flex: 1; text-align: center; font-size: 11px; }
                .sig .line { border-bottom: 1px solid #000; padding-top: 30px; margin-bottom: 4px; }
                @media screen { .letter { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; } }
            `}</style>
        </div>
    );
}
