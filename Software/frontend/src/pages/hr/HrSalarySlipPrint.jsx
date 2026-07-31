import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HrSalarySlipPrint() {
    const { monthId, employeeId } = useParams();
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/hr/salary-slip/${monthId}/${employeeId}`)
            .then(r => { setData(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [monthId, employeeId]);

    if (err)   return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const { row } = data;
    const c = row.Calc;

    return (
        <div className="slip">
            <PrintBusinessHeader
                docTitle="Salary Slip"
                docSubtitle={`For the month of ${monthId}`}
                showOnScreen
            />

            <hr className="rule" />

            <table className="emp">
                <tbody>
                    <tr>
                        <td><b>Employee:</b> {row.Name}</td>
                        <td><b>Sr #:</b> {row.SrNo || '—'}</td>
                        <td><b>Department:</b> {row.DepartmentName || '—'}</td>
                    </tr>
                    <tr>
                        <td><b>Designation:</b> {row.Designation || '—'}</td>
                        <td><b>Payment:</b> {row.IsPaidByBank ? `Bank (${row.BankAccountNumber || '—'})` : 'Cash'}</td>
                        <td><b>GL:</b> {row.AccountCode ? `${row.AccountCode} — ${row.AccountTitle || ''}` : '—'}</td>
                    </tr>
                </tbody>
            </table>

            <div className="split">
                <table className="col">
                    <thead><tr><th colSpan={2}>ADDITIONS</th></tr></thead>
                    <tbody>
                        <tr><td>Basic (× {c.paidDays}/{c.monthDays})</td><td>{fmt(c.prorated)}</td></tr>
                        <tr><td>Fuel Allowance</td><td>{fmt(c.fuel)}</td></tr>
                        <tr className="total"><td>Total Additions</td><td>{fmt(c.additions)}</td></tr>
                    </tbody>
                </table>

                <table className="col">
                    <thead><tr><th colSpan={2}>DEDUCTIONS</th></tr></thead>
                    <tbody>
                        <tr><td>Absent Fine ({fmt(row.Attendance?.Absents || 0)} × {fmt(c.absentRate)})</td><td>{fmt(c.absentFine)}</td></tr>
                        <tr><td>Late Fine ({row.Attendance?.LateMinutes || 0} × {fmt(c.lateRate)})</td><td>{fmt(c.lateFine)}</td></tr>
                        <tr><td>Advance</td><td>{fmt(c.advance)}</td></tr>
                        <tr><td>Mess ({fmt(row.Entry?.MessDays || 0)} × {fmt(row.Employee.MessAmount)})</td><td>{fmt(c.messDeduction)}</td></tr>
                        <tr><td>Manual Fine</td><td>{fmt(c.manualFine)}</td></tr>
                        <tr><td>EOBI</td><td>{fmt(c.eobi)}</td></tr>
                        <tr><td>Tax</td><td>{fmt(c.tax)}</td></tr>
                        <tr><td>Hold</td><td>{fmt(c.hold)}</td></tr>
                        <tr className="total"><td>Total Deductions</td><td>{fmt(c.deductions)}</td></tr>
                    </tbody>
                </table>
            </div>

            <div className="net">
                <span>NET PAYABLE</span>
                <span className="amt">Rs. {fmt(c.net)}</span>
            </div>

            {row.Entry?.Remarks && (
                <div className="remarks"><b>Remarks:</b> {row.Entry.Remarks}</div>
            )}

            <div className="sigs">
                <div className="sig"><div className="line"/><b>Employee Signature</b></div>
                <div className="sig"><div className="line"/><b>HR / Accounts</b></div>
                <div className="sig"><div className="line"/><b>Received (Date)</b></div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body { margin: 0; background: white !important; }
                .slip { font-family: Arial, sans-serif; font-size: 12px; padding: 12mm; max-width: 210mm; margin: 0 auto; color: #000; box-sizing: border-box; }
                .rule { border: 0; border-top: 1px solid #000; margin: 4px 0 10px; }
                .emp { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }
                .emp td { padding: 3px 6px; }
                .split { display: flex; gap: 12px; margin-bottom: 12px; }
                .col { flex: 1; border-collapse: collapse; }
                .col th { padding: 6px 8px; background: #e5e7eb; font-size: 11px; text-align: left; letter-spacing: 0.5px; }
                .col td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
                .col td:last-child { text-align: right; }
                .col tr.total td { font-weight: 700; border-top: 1px solid #000; background: #f8fafc; }
                .net { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #111827; color: #fff; border-radius: 4px; font-size: 14px; margin-bottom: 10px; }
                .net .amt { font-size: 18px; font-weight: 700; }
                .remarks { font-size: 11px; padding: 6px 8px; border: 1px dashed #94a3b8; background: #f8fafc; margin-bottom: 30px; }
                .sigs { display: flex; gap: 40px; margin-top: 40px; padding: 0 20px; }
                .sig { flex: 1; text-align: center; font-size: 11px; }
                .sig .line { border-bottom: 1px solid #000; padding-top: 30px; margin-bottom: 4px; }
                @media screen { .slip { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; } }
            `}</style>
        </div>
    );
}
