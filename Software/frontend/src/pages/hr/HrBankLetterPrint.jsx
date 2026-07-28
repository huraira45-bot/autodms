import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (m) => new Date(m + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

export default function HrBankLetterPrint() {
    const { monthId } = useParams();
    const [qs] = useSearchParams();
    const chequeNo = qs.get('cheque') || '__________';
    const chequeDate = qs.get('date') || new Date().toISOString().slice(0, 10);
    const [sheet, setSheet] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/hr/salary-sheet/${monthId}`)
            .then(r => { setSheet(r.data); setTimeout(() => window.print(), 500); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [monthId]);

    if (err)    return <div style={{ padding: 40, color: '#b91c1c' }}>{err}</div>;
    if (!sheet) return <div style={{ padding: 40 }}>Loading…</div>;

    const bankRows = sheet.rows.filter(r => r.IsPaidByBank && r.Calc.net > 0);
    const total = bankRows.reduce((s, r) => s + r.Calc.net, 0);

    return (
        <div className="letter">
            <PrintBusinessHeader docTitle="" showOnScreen />

            <p className="date">Date: {new Date().toLocaleDateString('en-GB')}</p>
            <p>To,<br/><b>The Branch Manager,</b><br/>Bank Name Here<br/>Branch: __________</p>
            <p><b>Subject:</b> Transfer of salaries for the month of <b>{monthName(monthId)}</b></p>
            <p>Dear Sir/Madam,</p>
            <p>Please debit our account for the salaries of the employees listed below and transfer the amount to their respective accounts as per the schedule attached.</p>
            <p><b>Cheque No.:</b> {chequeNo} &nbsp;&nbsp;&nbsp; <b>Cheque Date:</b> {chequeDate}</p>

            <table className="tbl">
                <thead>
                    <tr>
                        <th>Sr</th>
                        <th>Employee Name</th>
                        <th>Designation</th>
                        <th>Account Number</th>
                        <th className="num">Amount (PKR)</th>
                    </tr>
                </thead>
                <tbody>
                    {bankRows.map((r, i) => (
                        <tr key={r.EmployeeID}>
                            <td>{i+1}</td>
                            <td>{r.Name}</td>
                            <td>{r.Designation || '—'}</td>
                            <td>{r.BankAccountNumber || '—'}</td>
                            <td className="num">{fmt(r.Calc.net)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                        <td className="num" style={{ fontWeight: 700 }}>{fmt(total)}</td>
                    </tr>
                </tfoot>
            </table>

            <div className="sig-row">
                <div className="sig"><div className="line"/><b>Authorised Signatory</b></div>
                <div className="sig"><div className="line"/><b>Authorised Signatory</b></div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body { margin: 0; background: white !important; }
                .letter { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 12mm; max-width: 210mm; margin: 0 auto; box-sizing: border-box; }
                .letter p { line-height: 1.5; margin: 6px 0; }
                .date { text-align: right; margin-bottom: 10px; }
                .tbl { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px; }
                .tbl th, .tbl td { padding: 5px 8px; border: 1px solid #000; font-size: 11px; }
                .tbl th { background: #e5e7eb; text-align: left; }
                .tbl .num { text-align: right; }
                .sig-row { display: flex; gap: 80px; margin-top: 50px; padding: 0 20px; }
                .sig { flex: 1; text-align: center; font-size: 11px; }
                .sig .line { border-bottom: 1px solid #000; padding-top: 30px; margin-bottom: 4px; }
                @media screen { .letter { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; } }
            `}</style>
        </div>
    );
}
