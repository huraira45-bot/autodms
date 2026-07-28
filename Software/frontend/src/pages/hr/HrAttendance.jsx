import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Save, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';

const API = '/api/hr';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (m) => new Date(m + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
const shiftMonth = (m, d) => { const [y, mo] = m.split('-').map(Number); const dt = new Date(y, mo - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; };

export default function HrAttendance() {
    const { notify } = useFeedback();
    const canEdit = useCan('hr_attendance').canEdit;
    const [monthId, setMonthId] = useState(currentMonth());
    const [employees, setEmployees] = useState([]);
    const [records, setRecords] = useState({});
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(false);
    const [collapsed, setCollapsed] = useState({});

    const load = async () => {
        try {
            setBusy(true);
            const [empRes, attRes] = await Promise.all([
                axios.get('/api/employees'),
                axios.get(`${API}/attendance?monthId=${monthId}`),
            ]);
            const emps = (empRes.data || []).filter(e => e.IsActive);
            emps.sort((a, b) => (a.DepartmentName || '~').localeCompare(b.DepartmentName || '~')
                                 || (a.SrNo || '').localeCompare(b.SrNo || '')
                                 || (a.EmployeeName || '').localeCompare(b.EmployeeName || ''));
            setEmployees(emps);
            const map = {};
            (attRes.data || []).forEach(r => { map[r.EmployeeID] = r; });
            setRecords(map);
            setDrafts({});
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };
    useEffect(() => { load(); }, [monthId]);

    const patch = (empId, field, value) => {
        setDrafts(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [field]: value } }));
    };

    const saveOne = async (empId) => {
        const cur = drafts[empId];
        if (!cur) return;
        const existing = records[empId] || {};
        const body = {
            EmployeeID: empId, MonthID: monthId,
            Absents:     cur.Absents     ?? existing.Absents     ?? 0,
            LateMinutes: cur.LateMinutes ?? existing.LateMinutes ?? 0,
            LeaveDays:   cur.LeaveDays   ?? existing.LeaveDays   ?? 0,
            WorkingDays: cur.WorkingDays ?? existing.WorkingDays ?? 0,
        };
        try {
            await axios.post(`${API}/attendance`, body);
            setDrafts(prev => { const p = { ...prev }; delete p[empId]; return p; });
        } catch (err) {
            notify({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
            throw err;
        }
    };

    const saveAll = async () => {
        const ids = Object.keys(drafts).map(Number);
        if (!ids.length) return;
        try {
            for (const id of ids) await saveOne(id);
            notify({ type: 'success', title: `${ids.length} employees saved`, message: '' });
            await load();
        } catch {}
    };

    const val = (empId, key, fallback) => {
        const d = drafts[empId];
        if (d && key in d) return d[key];
        return records[empId]?.[key] ?? fallback;
    };

    const grouped = useMemo(() => {
        const groups = [];
        const idx = new Map();
        employees.forEach(e => {
            const name = e.DepartmentName || 'Unassigned';
            if (!idx.has(name)) { idx.set(name, groups.length); groups.push({ name, employees: [] }); }
            groups[idx.get(name)].employees.push(e);
        });
        return groups;
    }, [employees]);

    const totals = useMemo(() => {
        const t = { absents: 0, late: 0, leave: 0, working: 0 };
        employees.forEach(e => {
            t.absents += Number(val(e.EmployeeID, 'Absents',    0)) || 0;
            t.late    += Number(val(e.EmployeeID, 'LateMinutes', 0)) || 0;
            t.leave   += Number(val(e.EmployeeID, 'LeaveDays',   0)) || 0;
            t.working += Number(val(e.EmployeeID, 'WorkingDays', 0)) || 0;
        });
        return t;
    }, [employees, records, drafts]);

    return (
        <div className="erp-page hr-page">
            <ErpControlPanel title="Attendance" subtitle={monthLabel(monthId)}>
                <button className="erp-btn erp-btn-sm" onClick={() => setMonthId(shiftMonth(monthId, -1))}><ChevronLeft size={13}/></button>
                <input type="month" value={monthId} onChange={e => setMonthId(e.target.value)}
                    style={{ height: 30, padding: '0 8px', border: '1px solid var(--erp-border-strong)',
                             borderRadius: 'var(--erp-radius)', fontSize: 13, background: 'var(--erp-surface)' }}/>
                <button className="erp-btn erp-btn-sm" onClick={() => setMonthId(shiftMonth(monthId, 1))}><ChevronRight size={13}/></button>
                <button className="erp-btn erp-btn-sm" onClick={load} disabled={busy}><RefreshCw size={13}/> Reload</button>
                <div className="spacer" style={{ flex: 1 }}/>
                <button className="erp-btn erp-btn-primary" onClick={saveAll} disabled={!Object.keys(drafts).length}>
                    <Save size={13}/> Save All {Object.keys(drafts).length > 0 && `(${Object.keys(drafts).length})`}
                </button>
            </ErpControlPanel>

            <div className="hr-kpi-row">
                <Kpi label="Employees" value={employees.length}/>
                <Kpi label="Departments" value={grouped.length}/>
                <Kpi label="Total Absents" value={fmt(totals.absents)} tone="down"/>
                <Kpi label="Total Late (min)" value={fmt(totals.late)} tone="down"/>
                <Kpi label="Total Leave" value={fmt(totals.leave)}/>
                <Kpi label="Total Working" value={fmt(totals.working)} tone="net"/>
            </div>

            <div className="hr-sheet-scroll">
                {grouped.map(g => (
                    <section key={g.name} className="hr-dept-block">
                        <header className="hr-dept-head" onClick={() => setCollapsed(p => ({ ...p, [g.name]: !p[g.name] }))}>
                            <span className="hr-dept-caret">{collapsed[g.name] ? '▶' : '▼'}</span>
                            <span className="hr-dept-name">{g.name}</span>
                            <span className="hr-dept-count">{g.employees.length} employees</span>
                        </header>
                        {!collapsed[g.name] && (
                            <div className="hr-sheet-tbl-wrap">
                                <table className="hr-sheet-tbl">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 80 }}>Emp #</th>
                                            <th>Name</th>
                                            <th style={{ width: 140 }}>Designation</th>
                                            <th className="num" style={{ width: 110 }}>Absents</th>
                                            <th className="num" style={{ width: 110 }}>Late (min)</th>
                                            <th className="num" style={{ width: 110 }}>Leave Days</th>
                                            <th className="num" style={{ width: 110 }}>Working Days</th>
                                            <th style={{ width: 70 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {g.employees.map(e => {
                                            const dirty = !!drafts[e.EmployeeID];
                                            return (
                                                <tr key={e.EmployeeID} className={dirty ? 'dirty' : ''}>
                                                    <td className="muted">{e.EmployeeNo || e.EmployeeID}</td>
                                                    <td className="emp"><b>{e.EmployeeName}</b></td>
                                                    <td className="muted">{e.DesignationName || '—'}</td>
                                                    <td className="num">
                                                        <input type="number" step="0.5" min={0} disabled={!canEdit}
                                                            value={val(e.EmployeeID, 'Absents', 0)}
                                                            onChange={ev => patch(e.EmployeeID, 'Absents', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="1" min={0} disabled={!canEdit}
                                                            value={val(e.EmployeeID, 'LateMinutes', 0)}
                                                            onChange={ev => patch(e.EmployeeID, 'LateMinutes', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="0.5" min={0} disabled={!canEdit}
                                                            value={val(e.EmployeeID, 'LeaveDays', 0)}
                                                            onChange={ev => patch(e.EmployeeID, 'LeaveDays', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="0.5" min={0} disabled={!canEdit}
                                                            value={val(e.EmployeeID, 'WorkingDays', 0)}
                                                            onChange={ev => patch(e.EmployeeID, 'WorkingDays', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td>{dirty && <button className="erp-btn erp-btn-sm erp-btn-primary" onClick={() => saveOne(e.EmployeeID)}>Save</button>}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                ))}
                {!grouped.length && (
                    <div className="erp-panel" style={{ padding: 32, textAlign: 'center', color: 'var(--erp-text-muted)' }}>
                        No active employees.
                    </div>
                )}
            </div>

            <SharedStyles/>
        </div>
    );
}

function Kpi({ label, value, tone }) {
    return (
        <div className={`hr-kpi ${tone ? 'hr-kpi-' + tone : ''}`}>
            <div className="hr-kpi-l">{label}</div>
            <div className="hr-kpi-v">{value}</div>
        </div>
    );
}

function SharedStyles() {
    // Shared style block. Kept here rather than in index.css to keep the HR
    // module self-contained; if we ship more HR pages we'll promote it.
    return (
        <style>{`
            .hr-page { padding: 12px 16px 20px; max-width: 1600px; margin: 0 auto; }
            .hr-kpi-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 10px 0; }
            .hr-kpi { background: var(--erp-surface); border: 1px solid var(--erp-border); border-radius: var(--erp-radius); padding: 8px 12px; }
            .hr-kpi-l { font-size: 10px; letter-spacing: 0.4px; text-transform: uppercase; color: var(--erp-text-muted); }
            .hr-kpi-v { font-size: 15px; font-weight: 700; color: var(--erp-text); margin-top: 2px; }
            .hr-kpi-down .hr-kpi-v { color: var(--erp-red); }
            .hr-kpi-net { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border-color: #bbf7d0; }
            .hr-kpi-net .hr-kpi-v { color: #166534; }
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
            .hr-sheet-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
            .hr-sheet-tbl thead th { padding: 6px 10px; background: #fafafb; border-bottom: 1px solid var(--erp-border);
                                     text-align: left; font-size: 10.5px; font-weight: 600; color: var(--erp-text-muted);
                                     text-transform: uppercase; letter-spacing: 0.3px; }
            .hr-sheet-tbl thead th.num { text-align: right; }
            .hr-sheet-tbl tbody td { padding: 4px 10px; border-bottom: 1px solid #f4f4f6; }
            .hr-sheet-tbl tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
            .hr-sheet-tbl tbody td.muted { color: var(--erp-text-muted); }
            .hr-sheet-tbl tbody tr.dirty { background: #fffbea; }
            .hr-sheet-tbl tbody tr:hover { background: var(--erp-surface-hover); }
            .hr-inp { width: 100%; height: 26px; padding: 0 8px; font-size: 12px; border: 1px solid var(--erp-border);
                      border-radius: 3px; background: var(--erp-surface); color: var(--erp-text); font-variant-numeric: tabular-nums; }
            .hr-inp.num { text-align: right; }
            .hr-inp:focus { outline: none; border-color: var(--erp-brand); box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.1); }
            .hr-inp:disabled { background: #f7f7f9; color: var(--erp-text-muted); }
        `}</style>
    );
}
