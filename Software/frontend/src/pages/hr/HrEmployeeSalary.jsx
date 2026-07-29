import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Save, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';
import GLAccountPicker from '../../components/GLAccountPicker';

export default function HrEmployeeSalary() {
    const { notify } = useFeedback();
    const canEdit = useCan('hr_employees').canEdit;
    const [employees, setEmployees] = useState([]);
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(false);
    const [collapsed, setCollapsed] = useState({});

    const load = async () => {
        try {
            setBusy(true);
            const r = await axios.get('/api/employees');
            const emps = (r.data || []).filter(e => e.IsActive);
            emps.sort((a, b) => (a.DepartmentName || '~').localeCompare(b.DepartmentName || '~')
                                 || (a.SrNo || '').localeCompare(b.SrNo || '')
                                 || (a.EmployeeName || '').localeCompare(b.EmployeeName || ''));
            setEmployees(emps);
            setDrafts({});
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };
    useEffect(() => { load(); }, []);

    const patch = (id, field, value) => setDrafts(prev => {
        const next = { ...(prev[id] || {}), [field]: value };
        // Owner rule 2026-07-29: non-EOBI employees are ALWAYS paid in cash.
        // Unchecking EOBI must force pay-mode back to Cash automatically so
        // the UI can't send an invalid combination to the backend.
        if (field === 'HasEOBI' && !value) next.IsPaidByBank = false;
        return { ...prev, [id]: next };
    });
    const val = (id, key, fallback) => (drafts[id] && key in drafts[id]) ? drafts[id][key] : (employees.find(e => e.EmployeeID === id)?.[key] ?? fallback);

    const saveOne = async (id) => {
        const d = drafts[id];
        if (!d) return;
        const emp = employees.find(e => e.EmployeeID === id) || {};
        const body = {
            SrNo:                 val(id, 'SrNo',                emp.SrNo || ''),
            BasicSalary:          val(id, 'BasicSalary',         emp.BasicSalary || 0),
            HasEOBI:              val(id, 'HasEOBI',             !!emp.HasEOBI),
            EOBI:                 val(id, 'EOBI',                emp.EOBI || 0),
            HasFuelAllowance:     val(id, 'HasFuelAllowance',    !!emp.HasFuelAllowance),
            FuelAllowance:        val(id, 'FuelAllowance',       emp.FuelAllowance || 0),
            HasMess:              val(id, 'HasMess',             !!emp.HasMess),
            MessAmount:           val(id, 'MessAmount',          emp.MessAmount || 0),
            HasCustomLateFine:    val(id, 'HasCustomLateFine',   !!emp.HasCustomLateFine),
            CustomLateFineAmount: val(id, 'CustomLateFineAmount', emp.CustomLateFineAmount || 0),
            IsPaidByBank:         val(id, 'IsPaidByBank',        !!emp.IsPaidByBank),
            BankAccountNumber:    val(id, 'BankAccountNumber',   emp.BankAccountNumber || ''),
            EmployeeGLID:         val(id, 'EmployeeGLID',        emp.EmployeeGLID || null),
        };
        try {
            await axios.patch(`/api/employees/${id}/salary-settings`, body);
            setDrafts(prev => { const p = { ...prev }; delete p[id]; return p; });
        } catch (err) {
            notify({ type: 'error', title: `Save failed for ${emp.EmployeeName}`, message: err.response?.data?.error || err.message });
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

    return (
        <div className="erp-page hr-page">
            <ErpControlPanel title="Employee Salary Settings" subtitle={`${employees.length} active employees · ${grouped.length} departments`}>
                <button className="erp-btn erp-btn-sm" onClick={load} disabled={busy}><RefreshCw size={13}/> Reload</button>
                <div className="spacer" style={{ flex: 1 }}/>
                <button className="erp-btn erp-btn-primary" onClick={saveAll} disabled={!Object.keys(drafts).length}>
                    <Save size={13}/> Save All {Object.keys(drafts).length > 0 && `(${Object.keys(drafts).length})`}
                </button>
            </ErpControlPanel>

            <p className="hr-hint">
                Set each employee's per-month salary attributes here. Toggling a checkbox includes that allowance / deduction
                on the monthly salary sheet; the amount to its right becomes active.
            </p>

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
                                            <th style={{ width: 55 }}>Sr</th>
                                            <th style={{ width: 180 }}>Name</th>
                                            <th className="num" style={{ width: 100 }}>Basic Salary</th>
                                            <th style={{ width: 45, textAlign: 'center' }}>EOBI</th>
                                            <th className="num" style={{ width: 80 }}>EOBI Amt</th>
                                            <th style={{ width: 45, textAlign: 'center' }}>Fuel</th>
                                            <th className="num" style={{ width: 80 }}>Fuel Amt</th>
                                            <th style={{ width: 45, textAlign: 'center' }}>Mess</th>
                                            <th className="num" style={{ width: 90 }}>Mess/day</th>
                                            <th style={{ width: 55, textAlign: 'center' }}>Cust. Late</th>
                                            <th className="num" style={{ width: 80 }}>Late/min</th>
                                            <th style={{ width: 75 }}>Pay Mode</th>
                                            <th style={{ width: 140 }}>Bank Acct #</th>
                                            <th style={{ width: 220 }}>Salary GL</th>
                                            <th style={{ width: 60 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {g.employees.map((e, i) => {
                                            const id = e.EmployeeID;
                                            const dirty = !!drafts[id];
                                            return (
                                                <tr key={id} className={dirty ? 'dirty' : ''}>
                                                    <td>
                                                        <input type="text" disabled={!canEdit}
                                                            value={val(id, 'SrNo', e.SrNo || '') || ''}
                                                            onChange={ev => patch(id, 'SrNo', ev.target.value)}
                                                            className="hr-inp" placeholder={String(i+1)} style={{ width: 45 }}/>
                                                    </td>
                                                    <td className="emp"><b>{e.EmployeeName}</b></td>
                                                    <td className="num">
                                                        <input type="number" step="0.01" min={0} disabled={!canEdit}
                                                            value={val(id, 'BasicSalary', e.BasicSalary || 0)}
                                                            onChange={ev => patch(id, 'BasicSalary', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" disabled={!canEdit}
                                                            checked={!!val(id, 'HasEOBI', e.HasEOBI)}
                                                            onChange={ev => patch(id, 'HasEOBI', ev.target.checked)}/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasEOBI', e.HasEOBI)}
                                                            value={val(id, 'EOBI', e.EOBI || 0)}
                                                            onChange={ev => patch(id, 'EOBI', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" disabled={!canEdit}
                                                            checked={!!val(id, 'HasFuelAllowance', e.HasFuelAllowance)}
                                                            onChange={ev => patch(id, 'HasFuelAllowance', ev.target.checked)}/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasFuelAllowance', e.HasFuelAllowance)}
                                                            value={val(id, 'FuelAllowance', e.FuelAllowance || 0)}
                                                            onChange={ev => patch(id, 'FuelAllowance', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" disabled={!canEdit}
                                                            checked={!!val(id, 'HasMess', e.HasMess)}
                                                            onChange={ev => patch(id, 'HasMess', ev.target.checked)}/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasMess', e.HasMess)}
                                                            value={val(id, 'MessAmount', e.MessAmount || 0)}
                                                            onChange={ev => patch(id, 'MessAmount', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" disabled={!canEdit}
                                                            checked={!!val(id, 'HasCustomLateFine', e.HasCustomLateFine)}
                                                            onChange={ev => patch(id, 'HasCustomLateFine', ev.target.checked)}/>
                                                    </td>
                                                    <td className="num">
                                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasCustomLateFine', e.HasCustomLateFine)}
                                                            value={val(id, 'CustomLateFineAmount', e.CustomLateFineAmount || 0)}
                                                            onChange={ev => patch(id, 'CustomLateFineAmount', Number(ev.target.value))}
                                                            className="hr-inp num"/>
                                                    </td>
                                                    <td>
                                                        {(() => {
                                                            const eobiOn = !!val(id, 'HasEOBI', e.HasEOBI);
                                                            const bankOn = !!val(id, 'IsPaidByBank', e.IsPaidByBank);
                                                            return (
                                                                <select disabled={!canEdit || !eobiOn}
                                                                    value={bankOn ? '1' : '0'}
                                                                    onChange={ev => patch(id, 'IsPaidByBank', ev.target.value === '1')}
                                                                    className="hr-inp"
                                                                    title={eobiOn ? '' : 'Non-EOBI employees are always paid in cash'}>
                                                                    <option value="0">Cash</option>
                                                                    <option value="1">Bank</option>
                                                                </select>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td>
                                                        <input type="text" disabled={!canEdit || !val(id, 'IsPaidByBank', e.IsPaidByBank)}
                                                            value={val(id, 'BankAccountNumber', e.BankAccountNumber || '') || ''}
                                                            onChange={ev => patch(id, 'BankAccountNumber', ev.target.value)}
                                                            className="hr-inp"/>
                                                    </td>
                                                    <td>
                                                        <GLAccountPicker
                                                            value={val(id, 'EmployeeGLID', e.EmployeeGLID || '')}
                                                            onChange={v => patch(id, 'EmployeeGLID', v)}
                                                            placeholder="Pick GL…"
                                                            modal
                                                        />
                                                    </td>
                                                    <td>{dirty && <button className="erp-btn erp-btn-sm erp-btn-primary" onClick={async () => {
                                                        try { await saveOne(id); await load(); notify({ type: 'success', title: 'Saved', message: e.EmployeeName }); }
                                                        catch (err) { console.error('saveOne failed:', err); }
                                                    }}>Save</button>}</td>
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

            <style>{`
                .hr-page { padding: 12px 16px 20px; max-width: 1600px; margin: 0 auto; }
                .hr-hint { font-size: 12px; color: var(--erp-text-muted); margin: 10px 0 6px; }
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
                .hr-sheet-tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; }
                .hr-sheet-tbl thead th { padding: 6px 8px; background: #fafafb; border-bottom: 1px solid var(--erp-border);
                                         text-align: left; font-size: 10.5px; font-weight: 600; color: var(--erp-text-muted);
                                         text-transform: uppercase; letter-spacing: 0.3px; }
                .hr-sheet-tbl thead th.num { text-align: right; }
                .hr-sheet-tbl tbody td { padding: 3px 8px; border-bottom: 1px solid #f4f4f6; }
                .hr-sheet-tbl tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
                .hr-sheet-tbl tbody tr.dirty { background: #fffbea; }
                .hr-sheet-tbl tbody tr:hover { background: var(--erp-surface-hover); }
                .hr-inp { width: 100%; height: 26px; padding: 0 6px; font-size: 11.5px; border: 1px solid var(--erp-border);
                          border-radius: 3px; background: var(--erp-surface); color: var(--erp-text); font-variant-numeric: tabular-nums; }
                .hr-inp.num { text-align: right; }
                .hr-inp:focus { outline: none; border-color: var(--erp-brand); box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.1); }
                .hr-inp:disabled { background: #f7f7f9; color: var(--erp-text-muted); }
            `}</style>
        </div>
    );
}
