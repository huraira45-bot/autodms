import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Save, FileText, Landmark, Wallet, Printer, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';

const API = '/api/hr';
const fmt  = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (m) => new Date(m + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });

function shiftMonth(m, delta) {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function HrSalarySheet() {
    const { notify, confirm } = useFeedback();
    const canPost = useCan('hr_salary_post').canView;
    const canEdit = useCan('hr_salary').canEdit;
    const [monthId, setMonthId] = useState(currentMonth());
    const [sheet, setSheet] = useState(null);
    const [drafts, setDrafts] = useState({});
    const [postings, setPostings] = useState([]);
    const [busy, setBusy] = useState(false);
    const [collapsedDepts, setCollapsedDepts] = useState({});
    const [postModalOpen, setPostModalOpen] = useState(false);
    const [postDate, setPostDate] = useState(new Date().toISOString().slice(0, 10));
    const [payModalOpen, setPayModalOpen] = useState(false);

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
            Tax:      cur.Tax        ?? row.Entry?.Tax        ?? 0,
            ManualFineRemarks: cur.ManualFineRemarks ?? row.Entry?.ManualFineRemarks ?? '',
            Remarks:  cur.Remarks    ?? row.Entry?.Remarks    ?? '',
        };
        try {
            await axios.post(`${API}/salary`, body);
            setDrafts(prev => { const p = { ...prev }; delete p[empId]; return p; });
        } catch (err) {
            notify({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
            throw err;
        }
    };

    const saveAll = async () => {
        const ids = Object.keys(drafts).map(Number);
        if (!ids.length) return notify({ type: 'info', title: 'No changes', message: '' });
        try {
            for (const id of ids) await saveOne(id);
            notify({ type: 'success', title: `${ids.length} rows saved`, message: '' });
            await load();
        } catch {}
    };

    const runAccrual = async () => {
        try {
            setBusy(true);
            const res = await axios.post(`${API}/post/accrual`, { MonthID: monthId, PostDate: postDate });
            const summary = (res.data.vouchers || []).map(v =>
                `${v.category}: ${v.voucherNo} · PKR ${fmt(v.totalAmount)} · ${v.employees} emp`).join(' · ');
            notify({
                type: 'success',
                title: `Accrual posted — ${res.data.vouchers?.length || 0} vouchers`,
                message: `Total payable: PKR ${fmt(res.data.totalPayable)} across ${res.data.totalEmployees} employees. ${summary}`,
            });
            setPostModalOpen(false);
            await load();
        } catch (err) {
            notify({ type: 'error', title: `Accrual failed`, message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };

    // Bulk pay-out of the already-accrued net salary (owner ask 2026-08-07).
    // One voucher per group: Non-EOBI Cash, EOBI Cash, and one BPV per
    // distinct bank used by EOBI bank-paid employees.
    const runDisbursement = async () => {
        try {
            setBusy(true);
            const res = await axios.post(`${API}/post/disbursement`, { MonthID: monthId, PostDate: postDate });
            const summary = (res.data.vouchers || []).map(v =>
                `${v.label}: ${v.voucherNo} · PKR ${fmt(v.totalAmount)} · ${v.employees} emp`).join(' · ');
            notify({
                type: 'success',
                title: `Salary disbursed — ${res.data.vouchers?.length || 0} vouchers`,
                message: `Total paid: PKR ${fmt(res.data.totalPaid)} across ${res.data.totalEmployees} employees. ${summary}`,
            });
            setPayModalOpen(false);
            await load();
        } catch (err) {
            notify({ type: 'error', title: `Disbursement failed`, message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };

    // Two payroll categories: EOBI (bank + cash) and Non-EOBI (cash only).
    // Within each, group by DepartmentName.
    const categories = useMemo(() => {
        if (!sheet) return [];
        const cats = [
            { key: 'eobi',    label: 'EOBI Payroll',      match: r => r.Employee.HasEOBI,  groups: [] },
            { key: 'noneobi', label: 'Non-EOBI Payroll',  match: r => !r.Employee.HasEOBI, groups: [] },
        ];
        cats.forEach(cat => {
            const rows = sheet.rows.filter(cat.match);
            const idx = new Map();
            rows.forEach(r => {
                const name = r.DepartmentName || 'Unassigned';
                if (!idx.has(name)) { idx.set(name, cat.groups.length); cat.groups.push({ name, rows: [] }); }
                cat.groups[idx.get(name)].rows.push(r);
            });
            cat.groups = cat.groups.map(g => ({
                ...g,
                additions:  g.rows.reduce((s, r) => s + r.Calc.additions, 0),
                deductions: g.rows.reduce((s, r) => s + r.Calc.deductions, 0),
                net:        g.rows.reduce((s, r) => s + r.Calc.net, 0),
            }));
            cat.count      = rows.length;
            cat.additions  = rows.reduce((s, r) => s + r.Calc.additions, 0);
            cat.deductions = rows.reduce((s, r) => s + r.Calc.deductions, 0);
            cat.net        = rows.reduce((s, r) => s + r.Calc.net, 0);
        });
        return cats;
    }, [sheet]);

    const totals = useMemo(() => {
        if (!sheet) return null;
        const t = { additions: 0, deductions: 0, net: 0,
                    // Owner ask 2026-08-04: segregate the single Deductions
                    // total into its components — same 8 fields
                    // salaryCalculator.js already sums into r.Calc.deductions.
                    absentFine: 0, lateFine: 0, advance: 0, manualFine: 0,
                    eobiDeduction: 0, hold: 0, tax: 0, messDeduction: 0,
                    bankEobi: 0, bankEobiCount: 0,
                    cashEobi: 0, cashEobiCount: 0,
                    cashNon:  0, cashNonCount:  0,
                    empCount: 0 };
        sheet.rows.forEach(r => {
            t.additions  += r.Calc.additions;
            t.deductions += r.Calc.deductions;
            t.net        += r.Calc.net;
            t.absentFine    += r.Calc.absentFine;
            t.lateFine      += r.Calc.lateFine;
            t.advance       += r.Calc.advance;
            t.manualFine    += r.Calc.manualFine;
            t.eobiDeduction += r.Calc.eobi;
            t.hold          += r.Calc.hold;
            t.tax           += r.Calc.tax;
            t.messDeduction += r.Calc.messDeduction;
            if (r.Calc.net <= 0) return;
            t.empCount++;
            const eobi = !!r.Employee.HasEOBI;
            if (r.IsPaidByBank && eobi)  { t.bankEobi += r.Calc.net; t.bankEobiCount++; }
            else if (!r.IsPaidByBank && eobi) { t.cashEobi += r.Calc.net; t.cashEobiCount++; }
            else if (!r.IsPaidByBank && !eobi) { t.cashNon += r.Calc.net; t.cashNonCount++; }
            // (bank + non-EOBI is disallowed — see Employee Salary Settings)
        });
        return t;
    }, [sheet]);

    const draftedFor = (empId, key, fallback) => {
        const d = drafts[empId];
        if (d && key in d) return d[key];
        return fallback;
    };

    const toggleDept = (name) => setCollapsedDepts(p => ({ ...p, [name]: !p[name] }));

    return (
        <div className="erp-page hr-page">
            <ErpControlPanel
                title="Salary Sheet"
                subtitle={monthLabel(monthId)}
            >
                <button className="erp-btn erp-btn-sm" onClick={() => setMonthId(shiftMonth(monthId, -1))} title="Previous month">
                    <ChevronLeft size={13}/>
                </button>
                <input type="month" value={monthId} onChange={e => setMonthId(e.target.value)}
                    style={{ height: 30, padding: '0 8px', border: '1px solid var(--erp-border-strong)',
                             borderRadius: 'var(--erp-radius)', fontSize: 13, background: 'var(--erp-surface)' }}/>
                <button className="erp-btn erp-btn-sm" onClick={() => setMonthId(shiftMonth(monthId, 1))} title="Next month">
                    <ChevronRight size={13}/>
                </button>
                <button className="erp-btn erp-btn-sm" onClick={load} disabled={busy}>
                    <RefreshCw size={13}/> Reload
                </button>
                <div className="spacer" style={{ flex: 1 }}/>
                <button className="erp-btn erp-btn-primary" onClick={saveAll} disabled={!Object.keys(drafts).length}>
                    <Save size={13}/> Save All {Object.keys(drafts).length > 0 && `(${Object.keys(drafts).length})`}
                </button>
            </ErpControlPanel>

            {sheet && (
                <>
                    <div className="hr-kpi-row">
                        <Kpi label="Employees" value={fmt0(sheet.rows.length)} />
                        <Kpi label="Additions" value={fmt(totals?.additions)} />
                        <Kpi label="Deductions" value={fmt(totals?.deductions)} tone="down" />
                        <Kpi label="Net Payable" value={fmt(totals?.net)} tone="net" />
                        <Kpi label="Bank — EOBI"     value={fmt(totals?.bankEobi)}     sub={`${totals?.bankEobiCount} emp`} />
                        <Kpi label="Cash — EOBI"     value={fmt(totals?.cashEobi)}     sub={`${totals?.cashEobiCount} emp`} />
                        <Kpi label="Cash — Non-EOBI" value={fmt(totals?.cashNon)}      sub={`${totals?.cashNonCount} emp`} />
                        <Kpi label="Late / min" value={fmt(sheet.effectiveLateRate)} />
                    </div>

                    {/* Owner ask 2026-08-04: segregate the single Deductions
                        total above into its components. */}
                    <div className="hr-kpi-group-label">Deductions Breakdown</div>
                    <div className="hr-kpi-row hr-kpi-row-ded">
                        <Kpi label="Absent Fine" value={fmt(totals?.absentFine)} tone="down" />
                        <Kpi label="Late Fine"   value={fmt(totals?.lateFine)}   tone="down" />
                        <Kpi label="Advance"     value={fmt(totals?.advance)}    tone="down" />
                        <Kpi label="Fine"        value={fmt(totals?.manualFine)} tone="down" />
                        <Kpi label="EOBI"        value={fmt(totals?.eobiDeduction)} tone="down" />
                        <Kpi label="Hold"        value={fmt(totals?.hold)}       tone="down" />
                        <Kpi label="Tax"         value={fmt(totals?.tax)}        tone="down" />
                        <Kpi label="Mess"        value={fmt(totals?.messDeduction)} tone="down" />
                    </div>

                    <div className="hr-actions">
                        {canPost && (
                            <>
                                <button className="erp-btn erp-btn-primary" onClick={() => setPostModalOpen(true)}>
                                    <FileText size={13}/> Post Accrual (JV)
                                </button>
                                <button className="erp-btn erp-btn-primary" onClick={() => setPayModalOpen(true)}>
                                    <Wallet size={13}/> Pay Salary
                                </button>
                                <div style={{ width: 1, height: 20, background: 'var(--erp-border)', margin: '0 4px' }}/>
                            </>
                        )}
                        <a className="erp-btn" href={`/hr/salary/${monthId}/print`} target="_blank" rel="noreferrer"
                           title="Everyone together, department-wise, no EOBI column">
                            <Printer size={13}/> Sheet · All (Combined)
                        </a>
                        <a className="erp-btn" href={`/hr/salary/${monthId}/print?type=eobi-bank`} target="_blank" rel="noreferrer">
                            <Printer size={13}/> Sheet · EOBI Bank
                        </a>
                        <a className="erp-btn" href={`/hr/salary/${monthId}/print?type=eobi-cash`} target="_blank" rel="noreferrer">
                            <Printer size={13}/> Sheet · EOBI Cash
                        </a>
                        <a className="erp-btn" href={`/hr/salary/${monthId}/print?type=noneobi`} target="_blank" rel="noreferrer">
                            <Printer size={13}/> Sheet · Non-EOBI
                        </a>
                        <a className="erp-btn" href={`/hr/bank-letter/${monthId}/print`} target="_blank" rel="noreferrer">
                            <Landmark size={13}/> Bank Letter
                        </a>
                        <a className="erp-btn" href={`/hr/cash-letter/${monthId}/print`} target="_blank" rel="noreferrer">
                            <Wallet size={13}/> Cash Letter (Both)
                        </a>
                        <a className="erp-btn" href={`/hr/cash-letter/${monthId}/print?type=eobi`} target="_blank" rel="noreferrer">
                            <Wallet size={13}/> Cash EOBI
                        </a>
                        <a className="erp-btn" href={`/hr/cash-letter/${monthId}/print?type=noneobi`} target="_blank" rel="noreferrer">
                            <Wallet size={13}/> Cash Non-EOBI
                        </a>
                    </div>

                    {postings.length > 0 && (
                        <div className="erp-panel hr-postings">
                            <div className="erp-panel-title">Voucher postings for {monthLabel(monthId)}
                                <span className="count">{postings.length}</span></div>
                            {postings.map(p => (
                                <div key={p.PostingID} className="hr-posting-row">
                                    <span className={`hr-pill hr-pill-${p.PostingType.toLowerCase()}`}>
                                        {p.PostingType.replace('_',' ')}
                                    </span>
                                    <span className="hr-posting-vno">{p.VoucherNo || `#${p.VoucherID}`}</span>
                                    <span>PKR {fmt(p.TotalAmount)}</span>
                                    <span className="hr-posting-meta">{p.EmployeeCount} emp · {new Date(p.PostedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}{p.PostedByName ? ` · ${p.PostedByName}` : ''}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="hr-sheet-scroll">
                        {categories.map(cat => cat.count > 0 && (
                            <div key={cat.key} className={`hr-cat hr-cat-${cat.key}`}>
                                <div className="hr-cat-head">
                                    <span className="hr-cat-name">{cat.label}</span>
                                    <span className="hr-cat-meta">
                                        {cat.count} employees · Net <b>{fmt(cat.net)}</b> · Add {fmt(cat.additions)} · Ded {fmt(cat.deductions)}
                                    </span>
                                </div>
                                {cat.groups.map(g => (
                            <section key={g.name} className="hr-dept-block">
                                <header className="hr-dept-head" onClick={() => toggleDept(`${cat.key}:${g.name}`)}>
                                    <span className="hr-dept-caret">{collapsedDepts[`${cat.key}:${g.name}`] ? '▶' : '▼'}</span>
                                    <span className="hr-dept-name">{g.name}</span>
                                    <span className="hr-dept-count">{g.rows.length} employees</span>
                                    <span className="hr-dept-tot">
                                        Net: <b>{fmt(g.net)}</b> · Add: {fmt(g.additions)} · Ded: {fmt(g.deductions)}
                                    </span>
                                </header>
                                {!collapsedDepts[`${cat.key}:${g.name}`] && (
                                    <div className="hr-sheet-tbl-wrap">
                                        <table className="hr-sheet-tbl">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 50 }}>#</th>
                                                    <th style={{ width: 220 }}>Employee</th>
                                                    <th style={{ width: 160 }}>Designation</th>
                                                    <th className="num" style={{ width: 100 }}>Basic</th>
                                                    <th className="num" style={{ width: 90 }}>Paid</th>
                                                    <th className="num" style={{ width: 105 }}>Prorated</th>
                                                    <th className="num" style={{ width: 90 }}>Fuel</th>
                                                    <th className="num neg" style={{ width: 95 }}>Abs Fine</th>
                                                    <th className="num neg" style={{ width: 95 }}>Late Fine</th>
                                                    <th className="num" style={{ width: 95 }}>Advance</th>
                                                    <th className="num" style={{ width: 90 }}>Fine</th>
                                                    <th className="num" style={{ width: 90 }}>Hold</th>
                                                    <th className="num" style={{ width: 90 }}>Tax</th>
                                                    <th className="num" style={{ width: 95 }}>Mess Days</th>
                                                    <th className="num" style={{ width: 85 }}>EOBI</th>
                                                    <th className="num net" style={{ width: 115 }}>Net</th>
                                                    <th style={{ width: 100 }}>Mode</th>
                                                    <th style={{ width: 180 }}>Remarks</th>
                                                    <th style={{ width: 110 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {g.rows.map((r, i) => {
                                                    const dirty = !!drafts[r.EmployeeID];
                                                    return (
                                                        <tr key={r.EmployeeID} className={dirty ? 'dirty' : ''}>
                                                            <td>{r.SrNo || i+1}</td>
                                                            <td className="emp"><b>{r.Name}</b></td>
                                                            <td className="muted">{r.Designation || '—'}</td>
                                                            <td className="num">{fmt(r.Calc.basic)}</td>
                                                            <td className="num">
                                                                <input type="number" step="0.5" min={0} disabled={!canEdit}
                                                                    value={draftedFor(r.EmployeeID, 'PaidDays', r.Entry?.PaidDays ?? '') ?? ''}
                                                                    onChange={e => patch(r.EmployeeID, 'PaidDays', e.target.value)}
                                                                    className="hr-inp num" placeholder={String(r.Calc.monthDays)}/>
                                                            </td>
                                                            <td className="num">{fmt(r.Calc.prorated)}</td>
                                                            <td className="num">{fmt(r.Calc.fuel)}</td>
                                                            <td className={`num ${r.Calc.absentFine ? 'neg' : 'muted'}`}>{fmt(r.Calc.absentFine)}</td>
                                                            <td className={`num ${r.Calc.lateFine ? 'neg' : 'muted'}`}>{fmt(r.Calc.lateFine)}</td>
                                                            <td className="num">
                                                                <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                                    value={draftedFor(r.EmployeeID, 'Advance', r.Entry?.Advance ?? 0)}
                                                                    onChange={e => patch(r.EmployeeID, 'Advance', Number(e.target.value))}
                                                                    className="hr-inp num"/>
                                                            </td>
                                                            <td className="num">
                                                                <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                                    value={draftedFor(r.EmployeeID, 'Fine', r.Entry?.Fine ?? 0)}
                                                                    onChange={e => patch(r.EmployeeID, 'Fine', Number(e.target.value))}
                                                                    className="hr-inp num"/>
                                                            </td>
                                                            <td className="num">
                                                                <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                                    value={draftedFor(r.EmployeeID, 'Hold', r.Entry?.Hold ?? 0)}
                                                                    onChange={e => patch(r.EmployeeID, 'Hold', Number(e.target.value))}
                                                                    className="hr-inp num"/>
                                                            </td>
                                                            <td className="num">
                                                                <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                                    value={draftedFor(r.EmployeeID, 'Tax', r.Entry?.Tax ?? 0)}
                                                                    onChange={e => patch(r.EmployeeID, 'Tax', Number(e.target.value))}
                                                                    className="hr-inp num"/>
                                                            </td>
                                                            <td className="num">
                                                                <input type="number" step="0.5" min={0} disabled={!canEdit || !r.Employee.HasMess}
                                                                    value={draftedFor(r.EmployeeID, 'MessDays', r.Entry?.MessDays ?? 0)}
                                                                    onChange={e => patch(r.EmployeeID, 'MessDays', Number(e.target.value))}
                                                                    className="hr-inp num" title={r.Employee.HasMess ? '' : 'Employee not enrolled in Mess'}/>
                                                            </td>
                                                            <td className="num muted">{fmt(r.Calc.eobi)}</td>
                                                            <td className="num net"><b>{fmt(r.Calc.net)}</b></td>
                                                            <td>
                                                                {r.Employee.HasEOBI
                                                                    ? (r.IsPaidByBank
                                                                        ? <span className="hr-pill hr-pill-bank">Bank · EOBI</span>
                                                                        : <span className="hr-pill hr-pill-cash">Cash · EOBI</span>)
                                                                    : <span className="hr-pill hr-pill-cash-non">Cash · Non-EOBI</span>}
                                                            </td>
                                                            <td>
                                                                <input type="text" disabled={!canEdit}
                                                                    value={draftedFor(r.EmployeeID, 'Remarks', r.Entry?.Remarks ?? '')}
                                                                    onChange={e => patch(r.EmployeeID, 'Remarks', e.target.value)}
                                                                    className="hr-inp" placeholder="Remarks…"/>
                                                            </td>
                                                            <td>
                                                                {dirty && <button className="erp-btn erp-btn-sm erp-btn-primary" onClick={() => saveOne(r.EmployeeID).then(load)}>Save</button>}
                                                                {!dirty && <a className="erp-btn erp-btn-sm erp-btn-ghost" href={`/hr/salary-slip/${monthId}/${r.EmployeeID}/print`} target="_blank" rel="noreferrer">Slip</a>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        ))}
                            </div>
                        ))}
                        {!sheet.rows.length && (
                            <div className="erp-panel" style={{ padding: 32, textAlign: 'center', color: 'var(--erp-text-muted)' }}>
                                No active employees found.
                            </div>
                        )}
                    </div>
                </>
            )}

            {postModalOpen && (
                <div className="hr-modal-bg" onClick={() => setPostModalOpen(false)}>
                    <div className="hr-modal" onClick={e => e.stopPropagation()}>
                        <div className="hr-modal-head">Post Salary Accrual (JV)</div>
                        <div className="hr-modal-body">
                            <p>Post the salary accrual JV for <b>{monthLabel(monthId)}</b>.</p>
                            <label style={{ display: 'block', marginTop: 12 }}>
                                <div className="hr-lbl">Voucher Date</div>
                                <input type="date" value={postDate}
                                    onChange={e => setPostDate(e.target.value)}
                                    className="hr-inp" style={{ width: '100%', height: 34 }}/>
                            </label>
                            <p className="hr-hint" style={{ marginTop: 10 }}>
                                Journal is built from Employee GLs + per-department salary accounts.
                                Any employee missing a Salary GL, or any department missing a required
                                account, will block the post with a specific message.
                            </p>
                        </div>
                        <div className="hr-modal-foot">
                            <button className="erp-btn" onClick={() => setPostModalOpen(false)}>Cancel</button>
                            <button className="erp-btn erp-btn-primary" disabled={busy || !postDate} onClick={runAccrual}>
                                {busy ? 'Posting…' : 'Post JV'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {payModalOpen && (
                <div className="hr-modal-bg" onClick={() => setPayModalOpen(false)}>
                    <div className="hr-modal" onClick={e => e.stopPropagation()}>
                        <div className="hr-modal-head">Pay Salary (Cash + Bank)</div>
                        <div className="hr-modal-body">
                            <p>Pay out the net salary for <b>{monthLabel(monthId)}</b> — Non-EOBI Cash, EOBI Cash,
                               and one voucher per bank for EOBI employees paid by bank.</p>
                            <label style={{ display: 'block', marginTop: 12 }}>
                                <div className="hr-lbl">Voucher Date</div>
                                <input type="date" value={postDate}
                                    onChange={e => setPostDate(e.target.value)}
                                    className="hr-inp" style={{ width: '100%', height: 34 }}/>
                            </label>
                            <p className="hr-hint" style={{ marginTop: 10 }}>
                                Pays exactly each employee's Net (same figure on the Bank/Cash Letters), debiting
                                their Salary GL and crediting Cash Book or their assigned Pay Bank. A group already
                                disbursed this month is skipped with an error — reverse that voucher first to redo it.
                            </p>
                        </div>
                        <div className="hr-modal-foot">
                            <button className="erp-btn" onClick={() => setPayModalOpen(false)}>Cancel</button>
                            <button className="erp-btn erp-btn-primary" disabled={busy || !postDate} onClick={runDisbursement}>
                                {busy ? 'Paying…' : 'Pay Salary'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <PageStyles/>
        </div>
    );
}

function Kpi({ label, value, sub, tone }) {
    return (
        <div className={`hr-kpi ${tone ? 'hr-kpi-' + tone : ''}`}>
            <div className="hr-kpi-l">{label}</div>
            <div className="hr-kpi-v">{value}</div>
            {sub && <div className="hr-kpi-s">{sub}</div>}
        </div>
    );
}

function PageStyles() {
    return (
        <style>{`
            .hr-page { padding: 12px 16px 20px; max-width: 1600px; margin: 0 auto; }
            .hr-kpi-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 10px 0; }
            .hr-kpi { background: var(--erp-surface); border: 1px solid var(--erp-border); border-radius: var(--erp-radius);
                      padding: 8px 12px; min-width: 0; }
            .hr-kpi-l { font-size: 10px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--erp-text-muted); }
            .hr-kpi-v { font-size: 15px; font-weight: 700; color: var(--erp-text); margin-top: 2px; letter-spacing: -0.2px; }
            .hr-kpi-s { font-size: 10px; color: var(--erp-text-muted); margin-top: 2px; }
            .hr-kpi-down .hr-kpi-v { color: var(--erp-red); }
            .hr-kpi-net { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border-color: #bbf7d0; }
            .hr-kpi-net .hr-kpi-v { color: #166534; }
            .hr-kpi-group-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
                                   letter-spacing: 0.4px; color: var(--erp-text-muted); margin: 4px 2px 0; }
            .hr-kpi-row-ded { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); margin-top: 4px; }
            .hr-kpi-row-ded .hr-kpi { padding: 6px 10px; background: #fef2f2; border-color: #fecaca; }
            .hr-kpi-row-ded .hr-kpi-v { font-size: 13px; }

            .hr-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 10px 0; }
            .hr-actions .erp-btn { text-decoration: none; }

            .hr-postings { margin-bottom: 12px; padding: 8px 12px; }
            .hr-posting-row { display: flex; gap: 10px; align-items: center; font-size: 12px; padding: 4px 0;
                              border-top: 1px dashed var(--erp-border); }
            .hr-posting-vno { font-weight: 600; color: var(--erp-text); }
            .hr-posting-meta { color: var(--erp-text-muted); font-size: 11px; margin-left: auto; }

            .hr-pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; }
            .hr-pill-bank     { background: #dcfce7; color: #14532d; }
            .hr-pill-cash     { background: #fef3c7; color: #78350f; }
            .hr-pill-cash-non { background: #fde2e2; color: #7f1d1d; }
            .hr-pill-accrual         { background: #dbeafe; color: #1e40af; }
            .hr-pill-pay_bank        { background: #dcfce7; color: #14532d; }
            .hr-pill-pay_cash        { background: #fef3c7; color: #78350f; }
            .hr-pill-pay_cash_eobi   { background: #fef3c7; color: #78350f; }
            .hr-pill-pay_cash_noneobi { background: #fde2e2; color: #7f1d1d; }

            .hr-sheet-scroll { display: flex; flex-direction: column; gap: 18px; }

            .hr-cat { display: flex; flex-direction: column; gap: 8px; padding-bottom: 4px;
                      border-left: 4px solid transparent; padding-left: 8px; }
            .hr-cat-eobi    { border-left-color: #7c3aed; }
            .hr-cat-noneobi { border-left-color: #b91c1c; }
            .hr-cat-head { display: flex; justify-content: space-between; align-items: center;
                           padding: 8px 14px; color: #fff; border-radius: var(--erp-radius);
                           font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; font-size: 12px; }
            .hr-cat-eobi    .hr-cat-head { background: #7c3aed; }
            .hr-cat-noneobi .hr-cat-head { background: #b91c1c; }
            .hr-cat-name { font-size: 13px; }
            .hr-cat-meta { font-size: 11px; opacity: 0.95; font-weight: 500; letter-spacing: 0.3px; text-transform: none; }
            .hr-cat-meta b { font-weight: 700; }

            .hr-dept-block { background: var(--erp-surface); border: 1px solid var(--erp-border);
                             border-radius: var(--erp-radius); overflow: hidden; box-shadow: var(--erp-shadow-sm); }
            .hr-dept-head { display: flex; gap: 12px; align-items: center; padding: 8px 12px;
                            background: linear-gradient(180deg, #f7f7f9, #f0f0f2); border-bottom: 1px solid var(--erp-border);
                            cursor: pointer; user-select: none; }
            .hr-dept-caret { color: var(--erp-text-muted); font-size: 11px; width: 12px; }
            .hr-dept-name  { font-weight: 700; font-size: 13px; color: var(--erp-text); text-transform: uppercase; letter-spacing: 0.3px; }
            .hr-dept-count { font-size: 11px; color: var(--erp-text-muted); }
            .hr-dept-tot   { margin-left: auto; font-size: 11.5px; color: var(--erp-text-muted); }
            .hr-dept-tot b { color: #166534; font-weight: 700; }

            .hr-sheet-tbl-wrap { overflow-x: auto; }
            .hr-sheet-tbl { width: 100%; min-width: 2080px; border-collapse: collapse; font-size: 13px; }
            .hr-sheet-tbl thead th { position: sticky; top: 0; background: #fafafb; padding: 10px 12px;
                                     border-bottom: 1px solid var(--erp-border); text-align: left;
                                     font-size: 12px; font-weight: 600; color: var(--erp-text-muted);
                                     text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
            .hr-sheet-tbl thead th.num { text-align: right; }
            .hr-sheet-tbl thead th.net { background: #fef3c7; color: #78350f; }
            .hr-sheet-tbl thead th.neg { color: var(--erp-red); }
            .hr-sheet-tbl tbody td { padding: 7px 12px; border-bottom: 1px solid #f4f4f6; white-space: nowrap; color: var(--erp-text); }
            .hr-sheet-tbl tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
            .hr-sheet-tbl tbody td.emp { color: var(--erp-text); }
            .hr-sheet-tbl tbody td.muted { color: var(--erp-text-muted); }
            .hr-sheet-tbl tbody td.neg   { color: var(--erp-red); }
            .hr-sheet-tbl tbody td.net   { background: #fffbeb; }
            .hr-sheet-tbl tbody tr.dirty { background: #fffbea; }
            .hr-sheet-tbl tbody tr:hover { background: var(--erp-surface-hover); }
            .hr-sheet-tbl tbody tr.dirty:hover { background: #fef3c7; }

            .hr-inp { width: 100%; min-width: 60px; height: 32px; padding: 0 8px; font-size: 13px;
                      border: 1.5px solid var(--erp-border); border-radius: 4px;
                      background: var(--erp-surface); color: var(--erp-text);
                      font-variant-numeric: tabular-nums; }
            .hr-inp.num { text-align: right; }
            .hr-inp:focus { outline: none; border-color: var(--erp-brand); box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15); }
            .hr-inp:disabled { background: #f7f7f9; color: var(--erp-text-muted); cursor: not-allowed; }
            .hr-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px;
                      color: var(--erp-text-muted); font-weight: 600; margin-bottom: 4px; }
            .hr-hint { font-size: 11.5px; color: var(--erp-text-muted); line-height: 1.5; margin: 0; }

            .hr-modal-bg { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
                           display: flex; align-items: center; justify-content: center; z-index: 100; }
            .hr-modal { background: var(--erp-surface); border-radius: 6px; box-shadow: 0 20px 60px rgba(0,0,0,0.35);
                        width: 420px; max-width: calc(100vw - 40px); overflow: hidden; }
            .hr-modal-head { padding: 12px 16px; font-weight: 700; font-size: 14px;
                             background: linear-gradient(180deg, #f7f7f9, #f0f0f2);
                             border-bottom: 1px solid var(--erp-border); }
            .hr-modal-body { padding: 16px; font-size: 13px; color: var(--erp-text); }
            .hr-modal-body p { margin: 0 0 10px; line-height: 1.5; }
            .hr-modal-foot { padding: 10px 16px; display: flex; gap: 8px; justify-content: flex-end;
                             background: #fafafb; border-top: 1px solid var(--erp-border); }
        `}</style>
    );
}
