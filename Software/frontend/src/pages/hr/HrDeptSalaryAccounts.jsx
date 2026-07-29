import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Save, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';
import GLAccountPicker from '../../components/GLAccountPicker';

const API = '/api/hr/dept-accounts';

// The 8 GL slots per department, in display order.
const SLOTS = [
    { key: 'SalaryExpenseEobiGLID',    label: 'Salary Exp — EOBI',      hint: 'Dr for EOBI employees\' prorated basic' },
    { key: 'SalaryExpenseNonEobiGLID', label: 'Salary Exp — Non-EOBI',  hint: 'Dr for non-EOBI employees\' prorated basic' },
    { key: 'FuelExpenseGLID',          label: 'Fuel Expense',            hint: 'Dr for fuel allowance (both categories)' },
    { key: 'AbsentFineGLID',           label: 'Absent Fine',             hint: 'Cr for absent-fine deduction (income)' },
    { key: 'LateFineGLID',             label: 'Late Fine',               hint: 'Cr for late-fine deduction (income)' },
    { key: 'ManualFineGLID',           label: 'Manual Fine',             hint: 'Cr for manual/extra fine deduction (income)' },
    { key: 'MessRecoveryGLID',         label: 'Mess Recovery',           hint: 'Cr for mess deduction (income)' },
    { key: 'EobiPayableGLID',          label: 'EOBI Payable',            hint: 'Cr for EOBI liability to remit' },
];

export default function HrDeptSalaryAccounts() {
    const { notify } = useFeedback();
    const canEdit = useCan('hr_settings').canEdit;
    const [rows, setRows] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            setBusy(true);
            const r = await axios.get(API);
            setRows(r.data);
            setDrafts({});
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };
    useEffect(() => { load(); }, []);

    const patch = (deptId, key, value) => setDrafts(prev => ({
        ...prev, [deptId]: { ...(prev[deptId] || {}), [key]: value }
    }));
    const val = (deptId, key) => {
        const d = drafts[deptId];
        if (d && key in d) return d[key];
        const row = rows.find(r => r.DepartmentID === deptId);
        return row?.[key] ?? '';
    };

    const saveOne = async (deptId) => {
        const cur = drafts[deptId];
        if (!cur) return;
        const row = rows.find(r => r.DepartmentID === deptId) || {};
        const body = {};
        SLOTS.forEach(({ key }) => {
            body[key] = cur[key] !== undefined ? (cur[key] || null) : (row[key] || null);
        });
        try {
            await axios.put(`${API}/${deptId}`, body);
            setDrafts(prev => { const p = { ...prev }; delete p[deptId]; return p; });
        } catch (err) {
            notify({ type: 'error', title: `Save failed for ${row.DepartmentName}`, message: err.response?.data?.error || err.message });
            throw err;
        }
    };
    const saveAll = async () => {
        const ids = Object.keys(drafts).map(Number);
        if (!ids.length) return;
        for (const id of ids) await saveOne(id);
        notify({ type: 'success', title: `${ids.length} departments saved`, message: '' });
        await load();
    };

    const stats = useMemo(() => {
        const t = { depts: rows.length, mapped: 0, partial: 0, unmapped: 0 };
        rows.forEach(r => {
            const set = SLOTS.filter(s => r[s.key]).length;
            if (set === SLOTS.length) t.mapped++;
            else if (set > 0)         t.partial++;
            else                      t.unmapped++;
        });
        return t;
    }, [rows]);

    return (
        <div className="erp-page">
            <ErpControlPanel title="Department Salary Accounts" subtitle={`${rows.length} departments · ${stats.mapped} fully mapped · ${stats.partial} partial · ${stats.unmapped} unmapped`}>
                <button className="erp-btn erp-btn-sm" onClick={load} disabled={busy}><RefreshCw size={13}/> Reload</button>
                <div className="spacer" style={{ flex: 1 }}/>
                <button className="erp-btn erp-btn-primary" onClick={saveAll} disabled={!Object.keys(drafts).length}>
                    <Save size={13}/> Save All {Object.keys(drafts).length > 0 && `(${Object.keys(drafts).length})`}
                </button>
            </ErpControlPanel>

            <p className="hr-hint" style={{ margin: '10px 4px 12px' }}>
                Every department needs 8 GL accounts before its salary accrual JV can be posted.
                The accrual Debits Salary Exp (EOBI or Non-EOBI variant per employee) + Fuel Expense,
                and Credits each of the fine + mess + EOBI-payable accounts. Employee GL takes the
                balancing Cr. If any slot is unmapped, posting for that department is blocked with
                a specific message.
            </p>

            <div className="hr-scroll">
                {rows.map(r => {
                    const dirty = !!drafts[r.DepartmentID];
                    const mapped = SLOTS.filter(s => (dirty && s.key in drafts[r.DepartmentID]) ? drafts[r.DepartmentID][s.key] : r[s.key]).length;
                    return (
                        <section key={r.DepartmentID} className={`hr-dept-card ${dirty ? 'dirty' : ''}`}>
                            <header className="hr-dept-head-lite">
                                <span className="hr-dept-name">{r.DepartmentName}</span>
                                <span className="hr-dept-meta">
                                    {r.ActiveEmployees} employees · {mapped}/{SLOTS.length} accounts mapped
                                </span>
                                {dirty && <button className="erp-btn erp-btn-sm erp-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => saveOne(r.DepartmentID).then(load)}>
                                    <Save size={12}/> Save
                                </button>}
                            </header>
                            <div className="hr-slot-grid">
                                {SLOTS.map(slot => (
                                    <div key={slot.key} className="hr-slot">
                                        <div className="hr-lbl">{slot.label}</div>
                                        <GLAccountPicker
                                            value={val(r.DepartmentID, slot.key) || ''}
                                            onChange={v => patch(r.DepartmentID, slot.key, v)}
                                            placeholder="Pick GL…"
                                            disabled={!canEdit}
                                        />
                                        <div className="hr-slot-hint">{slot.hint}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}
                {!rows.length && (
                    <div className="erp-panel" style={{ padding: 32, textAlign: 'center', color: 'var(--erp-text-muted)' }}>
                        No departments found. Create them in HR Config first.
                    </div>
                )}
            </div>

            <style>{`
                .erp-page { padding: 12px 16px 20px; max-width: 1400px; margin: 0 auto; }
                .hr-hint { font-size: 12px; color: var(--erp-text-muted); line-height: 1.55; }
                .hr-scroll { display: flex; flex-direction: column; gap: 12px; }
                .hr-dept-card { background: var(--erp-surface); border: 1px solid var(--erp-border);
                                border-radius: var(--erp-radius); box-shadow: var(--erp-shadow-sm); overflow: hidden; }
                .hr-dept-card.dirty { border-color: #fbbf24; box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.15); }
                .hr-dept-head-lite { display: flex; gap: 12px; align-items: center; padding: 8px 14px;
                                     background: linear-gradient(180deg, #f7f7f9, #f0f0f2);
                                     border-bottom: 1px solid var(--erp-border); }
                .hr-dept-name { font-weight: 700; font-size: 13px; text-transform: uppercase;
                                letter-spacing: 0.3px; color: var(--erp-text); }
                .hr-dept-meta { font-size: 11px; color: var(--erp-text-muted); }
                .hr-slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                                gap: 12px; padding: 14px; }
                .hr-slot { display: flex; flex-direction: column; gap: 3px; }
                .hr-lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px;
                          color: var(--erp-text-muted); font-weight: 600; }
                .hr-slot-hint { font-size: 10.5px; color: var(--erp-text-soft); font-style: italic; }
            `}</style>
        </div>
    );
}
