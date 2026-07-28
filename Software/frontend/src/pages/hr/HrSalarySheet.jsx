import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Save, FileText, Landmark, Wallet, Printer, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';

const API = '/api/hr';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function HrSalarySheet() {
    const { notify, confirm } = useFeedback();
    const canPost = useCan('hr_salary_post').canView;
    const canEdit = useCan('hr_salary').canEdit;
    const [monthId, setMonthId] = useState(currentMonth());
    const [sheet, setSheet] = useState(null);
    const [drafts, setDrafts] = useState({});         // EmployeeID -> pending entry
    const [postings, setPostings] = useState([]);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            setBusy(true);
            const [sheetRes, postRes] = await Promise.all([
                axios.get(`${API}/salary-sheet/${monthId}`),
                axios.get(`${API}/postings?monthId=${monthId}`),
            ]);
            setSheet(sheetRes.data);
            setPostings(postRes.data);
            setDrafts({});
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };
    useEffect(() => { load(); }, [monthId]);

    const patch = (empId, field, value) => {
        setDrafts(prev => {
            const cur = prev[empId] || (sheet?.rows.find(r => r.EmployeeID === empId)?.Entry || {});
            return { ...prev, [empId]: { ...cur, [field]: value } };
        });
    };

    const saveOne = async (empId) => {
        const cur = drafts[empId];
        if (!cur) return;
        const row = sheet.rows.find(r => r.EmployeeID === empId);
        const body = {
            EmployeeID: empId, MonthID: monthId,
            Advance:  cur.Advance    ?? row.Entry?.Advance    ?? 0,
            Fine:     cur.Fine       ?? row.Entry?.Fine       ?? 0,
            Hold:     cur.Hold       ?? row.Entry?.Hold       ?? 0,
            MessDays: cur.MessDays   ?? row.Entry?.MessDays   ?? 0,
            PaidDays: cur.PaidDays  === '' ? null : (cur.PaidDays ?? row.Entry?.PaidDays ?? null),
            LateFineRate: cur.LateFineRate === '' ? null : (cur.LateFineRate ?? row.Entry?.LateFineRate ?? null),
            Adjustment: cur.Adjustment ?? row.Entry?.Adjustment ?? 0,
            ManualFineRemarks: cur.ManualFineRemarks ?? row.Entry?.ManualFineRemarks ?? '',
            Remarks:  cur.Remarks    ?? row.Entry?.Remarks    ?? '',
        };
        try {
            await axios.post(`${API}/salary`, body);
            setDrafts(prev => { const p = { ...prev }; delete p[empId]; return p; });
            await load();
        } catch (err) {
            notify({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
        }
    };

    const saveAll = async () => {
        const ids = Object.keys(drafts).map(Number);
        if (!ids.length) return notify({ type: 'info', title: 'No changes', message: '' });
        try {
            for (const id of ids) await saveOne(id);
            notify({ type: 'success', title: 'Saved', message: `${ids.length} rows` });
        } catch {}
    };

    const runPost = async (endpoint, label) => {
        const ok = await confirm({
            title: `${label}?`,
            message: `This will post a voucher for ${monthId}. Continue?`,
            confirmText: `Post ${label}`,
        });
        if (!ok) return;
        try {
            setBusy(true);
            const res = await axios.post(`${API}/post/${endpoint}`, { MonthID: monthId });
            notify({ type: 'success', title: `${label} posted`, message: `${res.data.voucherNo} · PKR ${fmt(res.data.totalAmount)} · ${res.data.employees} emp` });
            await load();
        } catch (err) {
            notify({ type: 'error', title: `${label} failed`, message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };

    const totals = useMemo(() => {
        if (!sheet) return null;
        const t = { additions: 0, deductions: 0, net: 0, bankNet: 0, cashNet: 0, empCount: 0 };
        sheet.rows.forEach(r => {
            t.additions  += r.Calc.additions;
            t.deductions += r.Calc.deductions;
            t.net        += r.Calc.net;
            if (r.Calc.net > 0) t.empCount++;
            if (r.IsPaidByBank) t.bankNet += r.Calc.net; else t.cashNet += r.Calc.net;
        });
        return t;
    }, [sheet]);

    const draftedFor = (empId, key, fallback) => {
        const d = drafts[empId];
        if (d && key in d) return d[key];
        return fallback;
    };

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={S.pageHead}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Salary Sheet</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={S.lbl}>Month</label>
                    <input type="month" value={monthId} onChange={e => setMonthId(e.target.value)} style={S.inp} />
                    <button style={S.btn} onClick={load} disabled={busy}><RefreshCw size={13} /> Reload</button>
                </div>
            </div>

            {sheet && (
                <>
                    <div style={S.kpiRow}>
                        <div style={S.kpi}><div style={S.kpiL}>Employees</div><div style={S.kpiV}>{sheet.rows.length}</div></div>
                        <div style={S.kpi}><div style={S.kpiL}>Additions</div><div style={S.kpiV}>{fmt(totals?.additions)}</div></div>
                        <div style={S.kpi}><div style={S.kpiL}>Deductions</div><div style={S.kpiV}>{fmt(totals?.deductions)}</div></div>
                        <div style={{ ...S.kpi, background: '#f0fdf4' }}><div style={S.kpiL}>Net Payable</div><div style={{ ...S.kpiV, color: '#166534' }}>{fmt(totals?.net)}</div></div>
                        <div style={S.kpi}><div style={S.kpiL}>Bank Net</div><div style={S.kpiV}>{fmt(totals?.bankNet)}</div></div>
                        <div style={S.kpi}><div style={S.kpiL}>Cash Net</div><div style={S.kpiV}>{fmt(totals?.cashNet)}</div></div>
                        <div style={S.kpi}><div style={S.kpiL}>Late/min</div><div style={S.kpiV}>{fmt(sheet.effectiveLateRate)}</div></div>
                        <div style={S.kpi}><div style={S.kpiL}>Absent/day</div><div style={S.kpiV}>{fmt(sheet.effectiveAbsentRate)}</div></div>
                    </div>

                    <div style={S.actionsBar}>
                        <button style={S.btnPrimary} onClick={saveAll} disabled={!Object.keys(drafts).length}>
                            <Save size={13}/> Save All Drafts ({Object.keys(drafts).length})
                        </button>
                        {canPost && (
                            <>
                                <button style={S.btn} onClick={() => runPost('accrual', 'Salary Accrual')}><FileText size={13}/> Post Accrual (JV)</button>
                                <button style={S.btn} onClick={() => runPost('pay-bank', 'Bank Payment')}><Landmark size={13}/> Pay via Bank (BPV)</button>
                                <button style={S.btn} onClick={() => runPost('pay-cash', 'Cash Payment')}><Wallet size={13}/> Pay via Cash (CPV)</button>
                            </>
                        )}
                        <a href={`/hr/salary/${monthId}/print`} target="_blank" rel="noreferrer" style={{ ...S.btn, textDecoration: 'none' }}>
                            <Printer size={13}/> Print Sheet
                        </a>
                        <a href={`/hr/bank-letter/${monthId}/print`} target="_blank" rel="noreferrer" style={{ ...S.btn, textDecoration: 'none' }}>
                            <Landmark size={13}/> Bank Letter
                        </a>
                        <a href={`/hr/cash-letter/${monthId}/print`} target="_blank" rel="noreferrer" style={{ ...S.btn, textDecoration: 'none' }}>
                            <Wallet size={13}/> Cash Letter
                        </a>
                    </div>

                    {postings.length > 0 && (
                        <div style={S.postingsBox}>
                            <b>Voucher postings this month:</b>
                            {postings.map(p => (
                                <div key={p.PostingID} style={S.postingRow}>
                                    <span style={S.pill(p.PostingType)}>{p.PostingType.replace('_',' ')}</span>
                                    · {p.VoucherNo || `#${p.VoucherID}`} · PKR {fmt(p.TotalAmount)} · {p.EmployeeCount} emp
                                    · {new Date(p.PostedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                                    {p.PostedByName ? ` · by ${p.PostedByName}` : ''}
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                        <table style={S.tbl}>
                            <thead>
                                <tr>
                                    <th style={S.th}>#</th>
                                    <th style={S.th}>Employee</th>
                                    <th style={S.th}>Designation</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Basic</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Paid Days</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Prorated</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Fuel</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Absent Fine</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Late Fine</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Advance</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Fine</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Hold</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Mess Days</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>EOBI</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Adjust</th>
                                    <th style={{ ...S.th, textAlign: 'right', background: '#fef3c7' }}>Net</th>
                                    <th style={S.th}>Mode</th>
                                    <th style={S.th}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sheet.rows.map((r, i) => {
                                    const dirty = !!drafts[r.EmployeeID];
                                    return (
                                        <tr key={r.EmployeeID} style={dirty ? { background: '#fffbeb' } : undefined}>
                                            <td style={S.td}>{r.SrNo || i + 1}</td>
                                            <td style={S.td}>{r.Name}</td>
                                            <td style={S.td}>{r.Designation || '—'}</td>
                                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(r.Calc.basic)}</td>
                                            <td style={S.td}>
                                                <input type="number" step="0.5" min={0} disabled={!canEdit}
                                                    value={draftedFor(r.EmployeeID, 'PaidDays', r.Entry?.PaidDays ?? '') ?? ''}
                                                    onChange={e => patch(r.EmployeeID, 'PaidDays', e.target.value)}
                                                    style={S.numIn} placeholder={String(r.Calc.monthDays)} />
                                            </td>
                                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(r.Calc.prorated)}</td>
                                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(r.Calc.fuel)}</td>
                                            <td style={{ ...S.td, textAlign: 'right', color: r.Calc.absentFine ? '#b91c1c' : '#666' }}>{fmt(r.Calc.absentFine)}</td>
                                            <td style={{ ...S.td, textAlign: 'right', color: r.Calc.lateFine ? '#b91c1c' : '#666' }}>{fmt(r.Calc.lateFine)}</td>
                                            <td style={S.td}>
                                                <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                    value={draftedFor(r.EmployeeID, 'Advance', r.Entry?.Advance ?? 0)}
                                                    onChange={e => patch(r.EmployeeID, 'Advance', Number(e.target.value))}
                                                    style={S.numIn}/>
                                            </td>
                                            <td style={S.td}>
                                                <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                    value={draftedFor(r.EmployeeID, 'Fine', r.Entry?.Fine ?? 0)}
                                                    onChange={e => patch(r.EmployeeID, 'Fine', Number(e.target.value))}
                                                    style={S.numIn}/>
                                            </td>
                                            <td style={S.td}>
                                                <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                    value={draftedFor(r.EmployeeID, 'Hold', r.Entry?.Hold ?? 0)}
                                                    onChange={e => patch(r.EmployeeID, 'Hold', Number(e.target.value))}
                                                    style={S.numIn}/>
                                            </td>
                                            <td style={S.td}>
                                                <input type="number" step="0.5" min={0} disabled={!canEdit || !r.Employee.HasMess}
                                                    value={draftedFor(r.EmployeeID, 'MessDays', r.Entry?.MessDays ?? 0)}
                                                    onChange={e => patch(r.EmployeeID, 'MessDays', Number(e.target.value))}
                                                    style={S.numIn}/>
                                            </td>
                                            <td style={{ ...S.td, textAlign: 'right', color: '#666' }}>{fmt(r.Calc.eobi)}</td>
                                            <td style={S.td}>
                                                <input type="number" step="0.01" disabled={!canEdit}
                                                    value={draftedFor(r.EmployeeID, 'Adjustment', r.Entry?.Adjustment ?? 0)}
                                                    onChange={e => patch(r.EmployeeID, 'Adjustment', Number(e.target.value))}
                                                    style={S.numIn}/>
                                            </td>
                                            <td style={{ ...S.td, textAlign: 'right', background: '#fef3c7', fontWeight: 700 }}>{fmt(r.Calc.net)}</td>
                                            <td style={S.td}>{r.IsPaidByBank ? <span style={S.pillBank}>Bank</span> : <span style={S.pillCash}>Cash</span>}</td>
                                            <td style={S.td}>
                                                {dirty && <button style={S.btnSm} onClick={() => saveOne(r.EmployeeID)}>Save</button>}
                                                <a href={`/hr/salary-slip/${monthId}/${r.EmployeeID}/print`} target="_blank" rel="noreferrer" style={{ ...S.btnSm, textDecoration: 'none', marginLeft: 4 }}>
                                                    Slip
                                                </a>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

const S = {
    pageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    lbl: { fontSize: 11, color: '#475569', fontWeight: 600 },
    inp: { padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 },
    btn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12,
           background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', color: '#334155' },
    btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12,
                  background: '#7c3aed', border: '1px solid #6d28d9', borderRadius: 4, cursor: 'pointer', color: '#fff' },
    btnSm: { padding: '2px 8px', fontSize: 11, background: '#7c3aed', color: '#fff', border: 0, borderRadius: 3, cursor: 'pointer' },
    kpiRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
    kpi: { flex: '0 1 auto', minWidth: 100, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6 },
    kpiL: { fontSize: 10, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 },
    kpiV: { fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 },
    actionsBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
    postingsBox: { padding: '8px 12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 6, marginBottom: 12, fontSize: 12 },
    postingRow: { marginTop: 4 },
    pill: (type) => ({ padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                        background: type === 'ACCRUAL' ? '#dbeafe' : (type === 'PAY_BANK' ? '#dcfce7' : '#fef3c7'),
                        color:      type === 'ACCRUAL' ? '#1e40af' : (type === 'PAY_BANK' ? '#166534' : '#92400e') }),
    pillBank: { padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#166534' },
    pillCash: { padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e' },
    tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
    th: { padding: '5px 6px', background: '#f1f5f9', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#334155',
          borderBottom: '1px solid #cbd5e1', whiteSpace: 'nowrap' },
    td: { padding: '3px 6px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
    numIn: { width: 65, padding: '2px 4px', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 11 },
};
