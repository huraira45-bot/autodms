import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (m) => new Date(m + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

// Owner ask 2026-08-07: employees can be paid from different company bank
// accounts (dms_BankAccounts), so this letter — which asks a bank to debit
// "our account" and transfer salaries — must be split one-per-bank. A
// letter addressed to Bank A can't reference employees paid from Bank B.
// Employees marked Bank but with no PaymentBankGLCAID assigned yet land in
// an "Unassigned" group with a warning instead of a real letter, so they
// don't silently fall through the cracks.
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

    const byBank = useMemo(() => {
        if (!sheet) return [];
        const rows = sheet.rows.filter(r => r.IsPaidByBank && r.Calc.net > 0);
        const groups = [];
        const idx = new Map();
        rows.forEach(r => {
            const key = r.PaymentBankGLCAID || 'unassigned';
            if (!idx.has(key)) {
                idx.set(key, groups.length);
                groups.push({ key, bankTitle: r.PaymentBankTitle || null, bankCode: r.PaymentBankCode || null, rows: [] });
            }
            groups[idx.get(key)].rows.push(r);
        });
        return groups.map(g => {
            const deptGroups = [];
            const dIdx = new Map();
            g.rows.forEach(r => {
                const name = r.DepartmentName || 'Unassigned';
                if (!dIdx.has(name)) { dIdx.set(name, deptGroups.length); deptGroups.push({ name, rows: [] }); }
                deptGroups[dIdx.get(name)].rows.push(r);
            });
            return {
                ...g,
                deptGroups: deptGroups.map(dg => ({ ...dg, subtotal: dg.rows.reduce((s, r) => s + r.Calc.net, 0) })),
                bankTotal: g.rows.reduce((s, r) => s + r.Calc.net, 0),
                empCount: g.rows.length,
            };
        });
    }, [sheet]);

    if (err)    return <div style={{ padding: 40, color: '#b91c1c' }}>{err}</div>;
    if (!sheet) return <div style={{ padding: 40 }}>Loading…</div>;

    return (
        <div className="letters">
            {byBank.map((bank, bi) => (
                <div className={`letter${bi > 0 ? ' newpage' : ''}`} key={bank.key}>
                    <PrintBusinessHeader docTitle="" showOnScreen/>

                    <p className="date">Date: {new Date().toLocaleDateString('en-GB')}</p>

                    {bank.key === 'unassigned' ? (
                        <div className="warn">
                            <b>⚠ No paying bank assigned</b> — the {bank.empCount} employee(s) below are marked "Bank"
                            but have no bank account picked on Employee Salary Settings. Assign one for each before
                            sending a real letter to a bank.
                        </div>
                    ) : (
                        <>
                            <p>To,<br/><b>The Branch Manager,</b><br/>{bank.bankTitle || 'Bank Name Here'}<br/>Branch: __________</p>
                            <p><b>Subject:</b> Transfer of salaries for the month of <b>{monthName(monthId)}</b></p>
                            <p>Dear Sir/Madam,</p>
                            <p>Please debit our account for the salaries of the {bank.empCount} employees listed below and transfer the amounts to their respective accounts as per the schedule.</p>
                            <p><b>Cheque No.:</b> {chequeNo} &nbsp;&nbsp;&nbsp; <b>Cheque Date:</b> {chequeDate} &nbsp;&nbsp;&nbsp; <b>Total:</b> Rs. {fmt(bank.bankTotal)}</p>
                        </>
                    )}

                    {bank.deptGroups.map(g => (
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
                                        <th>Account Number</th>
                                        <th className="num">Amount (PKR)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {g.rows.map((r, i) => (
                                        <tr key={r.EmployeeID}>
                                            <td>{i+1}</td>
                                            <td className="emp">{r.Name}</td>
                                            <td>{r.Designation || '—'}</td>
                                            <td className="acct">{r.BankAccountNumber || '—'}</td>
                                            <td className="num">{fmt(r.Calc.net)}</td>
                                        </tr>
                                    ))}
                                    <tr className="subtot">
                                        <td colSpan={4} className="right">Department Subtotal — {g.name}</td>
                                        <td className="num">{fmt(g.subtotal)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>
                    ))}

                    <div className="grand">
                        <span>{bank.key === 'unassigned' ? 'TOTAL (unassigned)' : `GRAND TOTAL — ${bank.bankTitle || ''}`} — {bank.empCount} employees across {bank.deptGroups.length} departments</span>
                        <span className="grand-amt">Rs. {fmt(bank.bankTotal)}</span>
                    </div>

                    {bank.key !== 'unassigned' && (
                        <div className="sig-row">
                            <div className="sig"><div className="line"/><b>Authorised Signatory</b></div>
                            <div className="sig"><div className="line"/><b>Authorised Signatory</b></div>
                        </div>
                    )}
                </div>
            ))}

            {!byBank.length && (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    No bank-paid employees with a net amount for {monthName(monthId)}.
                </div>
            )}

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body { margin: 0; background: white !important; }
                .letter { font-family: Arial, sans-serif; font-size: 11.5px; color: #000; padding: 12mm; max-width: 210mm; margin: 0 auto; box-sizing: border-box; }
                .letter.newpage { break-before: page; page-break-before: always; }
                .letter p { line-height: 1.5; margin: 6px 0; }
                .date { text-align: right; margin-bottom: 10px; }
                .warn { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 8px 12px; border-radius: 4px; margin: 8px 0 14px; }
                .dept { margin-top: 10px; page-break-inside: avoid; }
                .dept-head { background: #1f2937; color: #fff; padding: 4px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; }
                .dept-name { font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
                .tbl { width: 100%; border-collapse: collapse; }
                .tbl th, .tbl td { padding: 4px 8px; border: 1px solid #94a3b8; font-size: 10.5px; }
                .tbl th { background: #e5e7eb; text-align: left; }
                .tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
                .tbl .emp { font-weight: 600; }
                .tbl .acct { font-family: 'Courier New', monospace; letter-spacing: 0.4px; }
                .tbl tr.subtot td { background: #f8fafc; font-weight: 700; font-size: 10px; text-transform: uppercase; }
                .tbl tr.subtot td.right { text-align: right; letter-spacing: 0.3px; }
                .grand { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: #111827; color: #fff; margin-top: 8px; }
                .grand-amt { font-weight: 700; font-size: 14px; }
                .sig-row { display: flex; gap: 80px; margin-top: 40px; padding: 0 20px; page-break-inside: avoid; }
                .sig { flex: 1; text-align: center; font-size: 11px; }
                .sig .line { border-bottom: 1px solid #000; padding-top: 30px; margin-bottom: 4px; }
                @media screen { .letters { display: flex; flex-direction: column; gap: 24px; align-items: center; padding: 20px 0; }
                                .letter { box-shadow: 0 4px 12px rgba(0,0,0,0.1); background: white; } }
            `}</style>
        </div>
    );
}
