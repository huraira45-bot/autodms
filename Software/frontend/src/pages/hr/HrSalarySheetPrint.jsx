import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HrSalarySheetPrint() {
    const { monthId } = useParams();
    const [sheet, setSheet] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/hr/salary-sheet/${monthId}`)
            .then(r => { setSheet(r.data); setTimeout(() => window.print(), 500); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [monthId]);

    if (err)     return <div style={{ padding: 40, color: '#b91c1c' }}>Cannot print: {err}</div>;
    if (!sheet)  return <div style={{ padding: 40 }}>Loading…</div>;

    return (
        <div className="sheet">
            <PrintBusinessHeader docTitle="Salary Sheet" docSubtitle={`Month: ${monthId}`} showOnScreen />
            <table className="sheet-tbl">
                <thead>
                    <tr>
                        <th>Sr</th><th>Name</th><th>Designation</th>
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
                        <th className="num">Net</th>
                        <th>Mode</th>
                    </tr>
                </thead>
                <tbody>
                    {sheet.rows.map((r, i) => (
                        <tr key={r.EmployeeID}>
                            <td>{r.SrNo || i+1}</td>
                            <td>{r.Name}</td>
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
                            <td className="num" style={{ fontWeight: 700 }}>{fmt(r.Calc.net)}</td>
                            <td>{r.IsPaidByBank ? 'Bank' : 'Cash'}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={14} style={{ textAlign: 'right', fontWeight: 700 }}>GRAND TOTAL</td>
                        <td className="num" style={{ fontWeight: 700 }}>{fmt(sheet.totalNet)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            <style>{`
                @page { size: A4 landscape; margin: 8mm; }
                html, body { margin: 0; background: white !important; }
                .sheet { font-family: Arial, sans-serif; font-size: 10px; color: #000; padding: 6mm; }
                .sheet-tbl { width: 100%; border-collapse: collapse; margin-top: 8px; }
                .sheet-tbl th, .sheet-tbl td { padding: 3px 5px; border: 1px solid #94a3b8; font-size: 10px; }
                .sheet-tbl th { background: #e5e7eb; text-align: left; }
                .sheet-tbl .num { text-align: right; white-space: nowrap; }
                @media screen { .sheet { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; max-width: 297mm; } }
            `}</style>
        </div>
    );
}
