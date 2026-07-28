import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Save, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';

const API = '/api/hr';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function HrAttendance() {
    const { notify } = useFeedback();
    const canEdit = useCan('hr_attendance').canEdit;
    const [monthId, setMonthId] = useState(currentMonth());
    const [employees, setEmployees] = useState([]);
    const [records, setRecords] = useState({});   // EmployeeID -> row
    const [drafts, setDrafts] = useState({});     // EmployeeID -> pending
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            setBusy(true);
            const [empRes, attRes] = await Promise.all([
                axios.get('/api/employees'),
                axios.get(`${API}/attendance?monthId=${monthId}`),
            ]);
            setEmployees((empRes.data || []).filter(e => e.IsActive));
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
        }
    };

    const saveAll = async () => {
        const ids = Object.keys(drafts).map(Number);
        if (!ids.length) return;
        try {
            for (const id of ids) await saveOne(id);
            notify({ type: 'success', title: 'Saved', message: `${ids.length} employees` });
            await load();
        } catch {}
    };

    const val = (empId, key, fallback) => {
        const d = drafts[empId];
        if (d && key in d) return d[key];
        return records[empId]?.[key] ?? fallback;
    };

    const totals = useMemo(() => {
        const t = { absents: 0, late: 0, leave: 0, working: 0 };
        Object.keys({ ...records, ...drafts }).forEach(id => {
            t.absents += Number(val(id, 'Absents',    0)) || 0;
            t.late    += Number(val(id, 'LateMinutes', 0)) || 0;
            t.leave   += Number(val(id, 'LeaveDays',   0)) || 0;
            t.working += Number(val(id, 'WorkingDays', 0)) || 0;
        });
        return t;
    }, [records, drafts]);

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={S.pageHead}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Attendance</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={S.lbl}>Month</label>
                    <input type="month" value={monthId} onChange={e => setMonthId(e.target.value)} style={S.inp}/>
                    <button style={S.btn} onClick={load} disabled={busy}><RefreshCw size={13}/> Reload</button>
                    <button style={S.btnPrimary} onClick={saveAll} disabled={!Object.keys(drafts).length}>
                        <Save size={13}/> Save All ({Object.keys(drafts).length})
                    </button>
                </div>
            </div>

            <div style={S.kpiRow}>
                <div style={S.kpi}><div style={S.kpiL}>Employees</div><div style={S.kpiV}>{employees.length}</div></div>
                <div style={S.kpi}><div style={S.kpiL}>Total Absents</div><div style={S.kpiV}>{fmt(totals.absents)}</div></div>
                <div style={S.kpi}><div style={S.kpiL}>Total Late (min)</div><div style={S.kpiV}>{fmt(totals.late)}</div></div>
                <div style={S.kpi}><div style={S.kpiL}>Total Leave</div><div style={S.kpiV}>{fmt(totals.leave)}</div></div>
                <div style={S.kpi}><div style={S.kpiL}>Total Working</div><div style={S.kpiV}>{fmt(totals.working)}</div></div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <table style={S.tbl}>
                    <thead>
                        <tr>
                            <th style={S.th}>Emp #</th>
                            <th style={S.th}>Name</th>
                            <th style={S.th}>Department</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Absents</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Late (min)</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Leave Days</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Working Days</th>
                            <th style={S.th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(e => {
                            const dirty = !!drafts[e.EmployeeID];
                            return (
                                <tr key={e.EmployeeID} style={dirty ? { background: '#fffbeb' } : undefined}>
                                    <td style={S.td}>{e.EmployeeNo || e.EmployeeID}</td>
                                    <td style={S.td}>{e.EmployeeName}</td>
                                    <td style={S.td}>{e.DepartmentName || '—'}</td>
                                    <td style={S.td}>
                                        <input type="number" step="0.5" min={0} disabled={!canEdit}
                                            value={val(e.EmployeeID, 'Absents', 0)}
                                            onChange={ev => patch(e.EmployeeID, 'Absents', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}>
                                        <input type="number" step="1" min={0} disabled={!canEdit}
                                            value={val(e.EmployeeID, 'LateMinutes', 0)}
                                            onChange={ev => patch(e.EmployeeID, 'LateMinutes', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}>
                                        <input type="number" step="0.5" min={0} disabled={!canEdit}
                                            value={val(e.EmployeeID, 'LeaveDays', 0)}
                                            onChange={ev => patch(e.EmployeeID, 'LeaveDays', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}>
                                        <input type="number" step="0.5" min={0} disabled={!canEdit}
                                            value={val(e.EmployeeID, 'WorkingDays', 0)}
                                            onChange={ev => patch(e.EmployeeID, 'WorkingDays', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}>{dirty && <button style={S.btnSm} onClick={() => saveOne(e.EmployeeID)}>Save</button>}</td>
                                </tr>
                            );
                        })}
                        {!employees.length && (
                            <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No active employees</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
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
    kpi: { flex: '0 1 auto', minWidth: 120, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6 },
    kpiL: { fontSize: 10, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 },
    kpiV: { fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 },
    tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th: { padding: '6px 8px', background: '#f1f5f9', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#334155',
          borderBottom: '1px solid #cbd5e1' },
    td: { padding: '4px 8px', borderBottom: '1px solid #f1f5f9' },
    numIn: { width: 80, padding: '3px 6px', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 12 },
};
