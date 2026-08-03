/**
 * Mess Sheet — dedicated monthly screen for the two things that change
 * every month per employee: Mess Days, and (owner ask 2026-08-03) the mess
 * RATE itself, which can be raised or lowered for a single month via
 * MessAmountOverride (migration 111) without touching the employee's
 * standing default rate (gen_EmployeeInfo.MessAmount, set on Employee
 * Salary Settings). Only employees enrolled in Mess (HasMess) show up here.
 *
 * Reads/writes the SAME data the big Salary Sheet uses (GET
 * /api/hr/salary-sheet/:monthId, POST /api/hr/salary) — no new backend
 * endpoints. Every save carries the full existing Entry row forward
 * unchanged except MessDays/MessAmountOverride, same pattern
 * HrSalarySheet.jsx already uses safely (the MERGE overwrites every column
 * on the row, so anything not included would otherwise get zeroed out).
 */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Save, RefreshCw, ChevronLeft, ChevronRight, Utensils } from 'lucide-react';
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

export default function HrMessSheet() {
    const { notify } = useFeedback();
    const canEdit = useCan('hr_salary').canEdit;
    const [monthId, setMonthId] = useState(currentMonth());
    const [rows, setRows] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(false);
    const [collapsed, setCollapsed] = useState({});

    const load = async () => {
        try {
            setBusy(true);
            const r = await axios.get(`${API}/salary-sheet/${monthId}`);
            setRows((r.data?.rows || []).filter(row => row.Employee?.HasMess));
            setDrafts({});
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };
    useEffect(() => { load(); }, [monthId]);

    const draftedFor = (empId, key, fallback) => {
        const d = drafts[empId];
        if (d && key in d) return d[key];
        return fallback;
    };
    const patch = (empId, field, value) => setDrafts(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [field]: value } }));

    const effectiveRate = (row) => {
        const override = draftedFor(row.EmployeeID, 'MessAmountOverride', row.Entry?.MessAmountOverride ?? '');
        return override === '' || override === null ? Number(row.Employee.MessAmount || 0) : Number(override);
    };
    const effectiveDays = (row) => Number(draftedFor(row.EmployeeID, 'MessDays', row.Entry?.MessDays ?? 0)) || 0;

    const saveOne = async (empId) => {
        const cur = drafts[empId];
        if (!cur) return;
        const row = rows.find(r => r.EmployeeID === empId);
        // Every other Entry field is echoed back unchanged so this narrower
        // save can't clobber Advance/Fine/Tax/PaidDays/etc — saveSalaryEntry
        // overwrites the whole row, it doesn't merge partial updates.
        const body = {
            EmployeeID: empId, MonthID: monthId,
            Advance:  row.Entry?.Advance  ?? 0,
            Fine:     row.Entry?.Fine     ?? 0,
            Hold:     row.Entry?.Hold     ?? 0,
            PaidDays: row.Entry?.PaidDays ?? null,
            LateFineRate: row.Entry?.LateFineRate ?? null,
            Adjustment: row.Entry?.Adjustment ?? 0,
            Tax:      row.Entry?.Tax      ?? 0,
            ManualFineRemarks: row.Entry?.ManualFineRemarks ?? '',
            Remarks:  row.Entry?.Remarks  ?? '',
            MessDays: cur.MessDays ?? row.Entry?.MessDays ?? 0,
            MessAmountOverride: cur.MessAmountOverride === '' ? null : (cur.MessAmountOverride ?? row.Entry?.MessAmountOverride ?? null),
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
            notify({ type: 'success', title: `${ids.length} row(s) saved`, message: '' });
            await load();
        } catch {}
    };

    const grouped = (() => {
        const groups = [];
        const idx = new Map();
        rows.forEach(r => {
            const name = r.DepartmentName || 'Unassigned';
            if (!idx.has(name)) { idx.set(name, groups.length); groups.push({ name, rows: [] }); }
            groups[idx.get(name)].rows.push(r);
        });
        return groups;
    })();

    const totalDays = rows.reduce((s, r) => s + effectiveDays(r), 0);
    const totalCost = rows.reduce((s, r) => s + effectiveRate(r) * effectiveDays(r), 0);

    return (
        <div className="erp-page hr-page">
            <ErpControlPanel title="Mess Sheet" subtitle={monthLabel(monthId)}>
                <button className="erp-btn erp-btn-sm" onClick={() => setMonthId(shiftMonth(monthId, -1))} title="Previous month">
                    <ChevronLeft size={13}/>
                </button>
                <input type="month" value={monthId} onChange={e => setMonthId(e.target.value)}
                    style={{ height: 30, padding: '0 8px', border: '1px solid var(--erp-border-strong)',
                             borderRadius: 'var(--erp-radius)', fontSize: 13, background: 'var(--erp-surface)' }}/>
                <button className="erp-btn erp-btn-sm" onClick={() => setMonthId(shiftMonth(monthId, 1))} title="Next month">
                    <ChevronRight size={13}/>
                </button>
                <button className="erp-btn erp-btn-sm" onClick={load} disabled={busy}><RefreshCw size={13}/> Reload</button>
                <div className="spacer" style={{ flex: 1 }}/>
                <button className="erp-btn erp-btn-primary" onClick={saveAll} disabled={!Object.keys(drafts).length}>
                    <Save size={13}/> Save All {Object.keys(drafts).length > 0 && `(${Object.keys(drafts).length})`}
                </button>
            </ErpControlPanel>

            <p className="hr-hint">
                <Utensils size={13} style={{ verticalAlign: -2, marginRight: 4 }}/>
                Only employees enrolled in Mess (set on Employee Salary Settings) appear here. "Rate this month"
                starts out equal to the employee's default rate — change it to raise or lower the rate for{' '}
                {monthLabel(monthId)} only; it reverts to the default next month unless changed again.
            </p>

            <div className="hr-kpi-row" style={{ display: 'flex', gap: 20, padding: '10px 14px', marginBottom: 10 }}>
                <div><div className="hr-kpi-l">Enrolled</div><div className="hr-kpi-v">{fmt0(rows.length)}</div></div>
                <div><div className="hr-kpi-l">Total Mess Days</div><div className="hr-kpi-v">{fmt(totalDays)}</div></div>
                <div><div className="hr-kpi-l">Total Mess Cost</div><div className="hr-kpi-v">{fmt(totalCost)}</div></div>
            </div>

            <div className="hr-sheet-scroll">
                {grouped.map(g => (
                    <section key={g.name} className="hr-dept-block">
                        <header className="hr-dept-head" onClick={() => setCollapsed(p => ({ ...p, [g.name]: !p[g.name] }))}>
                            <span className="hr-dept-caret">{collapsed[g.name] ? '▶' : '▼'}</span>
                            <span className="hr-dept-name">{g.name}</span>
                            <span className="hr-dept-count">{g.rows.length} employees</span>
                        </header>
                        {!collapsed[g.name] && (
                            <div className="hr-sheet-tbl-wrap">
                                <table className="hr-sheet-tbl">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 44 }}>#</th>
                                            <th style={{ width: 240 }}>Employee</th>
                                            <th className="num" style={{ width: 150 }}>Default Rate</th>
                                            <th className="num" style={{ width: 180 }}>Rate this month</th>
                                            <th className="num" style={{ width: 150 }}>Mess Days</th>
                                            <th className="num" style={{ width: 160 }}>Total</th>
                                            <th style={{ width: 100 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {g.rows.map((r, i) => {
                                            const dirty = !!drafts[r.EmployeeID];
                                            const rate = effectiveRate(r);
                                            const days = effectiveDays(r);
                                            const overrideVal = draftedFor(r.EmployeeID, 'MessAmountOverride', r.Entry?.MessAmountOverride ?? '');
                                            return (
                                                <tr key={r.EmployeeID} className={dirty ? 'dirty' : ''}>
                                                    <td>{r.SrNo || i + 1}</td>
                                                    <td className="emp"><b>{r.Name}</b></td>
                                                    <td className="num muted">{fmt(r.Employee.MessAmount)}</td>
                                                    <td className="num">
                                                        <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                            value={overrideVal === null ? '' : overrideVal}
                                                            onChange={e => patch(r.EmployeeID, 'MessAmountOverride', e.target.value)}
                                                            className="hr-inp num" placeholder={fmt(r.Employee.MessAmount)}
                                                            title="Leave blank to use the employee's default rate"/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="0.5" min={0} disabled={!canEdit}
                                                            value={draftedFor(r.EmployeeID, 'MessDays', r.Entry?.MessDays ?? 0)}
                                                            onChange={e => patch(r.EmployeeID, 'MessDays', Number(e.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td className="num"><b>{fmt(rate * days)}</b></td>
                                                    <td>
                                                        {dirty && <button className="erp-btn erp-btn-sm erp-btn-primary" onClick={() => saveOne(r.EmployeeID).then(load)}>Save</button>}
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
                {!rows.length && !busy && (
                    <div className="erp-panel" style={{ padding: 32, textAlign: 'center', color: 'var(--erp-text-muted)' }}>
                        No employees are enrolled in Mess. Enable "Mess" per employee on Employee Salary Settings first.
                    </div>
                )}
            </div>

            <style>{`
                .hr-page { padding: 12px 16px 20px; max-width: 1600px; margin: 0 auto; }
                .hr-hint { font-size: 12px; color: var(--erp-text-muted); margin: 10px 0 6px; }
                .hr-kpi-l { font-size: 10px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--erp-text-muted); }
                .hr-kpi-v { font-size: 15px; font-weight: 700; color: var(--erp-text); margin-top: 2px; letter-spacing: -0.2px; }
                .hr-sheet-scroll { display: flex; flex-direction: column; gap: 12px; }
                .hr-dept-block { background: var(--erp-surface); border: 1px solid var(--erp-border);
                                 border-radius: var(--erp-radius); overflow: hidden; box-shadow: var(--erp-shadow-sm); }
                .hr-dept-head { display: flex; gap: 12px; align-items: center; padding: 8px 12px;
                                background: linear-gradient(180deg, #f7f7f9, #f0f0f2); border-bottom: 1px solid var(--erp-border);
                                cursor: pointer; user-select: none; }
                .hr-dept-caret { color: var(--erp-text-muted); font-size: 11px; width: 12px; }
                .hr-dept-name  { font-weight: 700; font-size: 13px; color: var(--erp-text); text-transform: uppercase; letter-spacing: 0.3px; }
                .hr-dept-count { font-size: 11px; color: var(--erp-text-muted); }
                .hr-sheet-tbl-wrap { overflow-x: auto; }
                .hr-sheet-tbl { width: 100%; border-collapse: collapse; font-size: 14px; }
                .hr-sheet-tbl thead th { padding: 10px 12px; background: #fafafb; border-bottom: 1px solid var(--erp-border);
                                         text-align: left; font-size: 12px; font-weight: 600; color: var(--erp-text-muted);
                                         text-transform: uppercase; letter-spacing: 0.3px; }
                .hr-sheet-tbl thead th.num { text-align: right; }
                .hr-sheet-tbl tbody td { padding: 8px 12px; border-bottom: 1px solid #f4f4f6; }
                .hr-sheet-tbl tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
                .hr-sheet-tbl tbody tr.dirty { background: #fffbea; }
                .hr-sheet-tbl tbody tr:hover { background: var(--erp-surface-hover); }
                .hr-inp { width: 100%; height: 38px; padding: 0 10px; font-size: 15px; border: 1.5px solid var(--erp-border);
                          border-radius: 5px; background: var(--erp-surface); color: var(--erp-text); font-variant-numeric: tabular-nums; }
                .hr-inp.num { text-align: right; }
                .hr-inp:focus { outline: none; border-color: var(--erp-brand); box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15); }
                .hr-inp:disabled { background: #f7f7f9; color: var(--erp-text-muted); }
            `}</style>
        </div>
    );
}
