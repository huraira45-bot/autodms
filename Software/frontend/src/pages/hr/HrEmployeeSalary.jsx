import { useEffect, useState } from 'react';
import axios from 'axios';
import { Save, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';
import GLAccountPicker from '../../components/GLAccountPicker';

export default function HrEmployeeSalary() {
    const { notify } = useFeedback();
    const canEdit = useCan('hr_employees').canEdit;
    const [employees, setEmployees] = useState([]);
    const [drafts, setDrafts] = useState({});   // EmployeeID -> pending fields
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            setBusy(true);
            const r = await axios.get('/api/employees');
            setEmployees((r.data || []).filter(e => e.IsActive));
            setDrafts({});
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        } finally { setBusy(false); }
    };
    useEffect(() => { load(); }, []);

    const patch = (id, field, value) => {
        setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
    };
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
        }
    };
    const saveAll = async () => {
        const ids = Object.keys(drafts).map(Number);
        if (!ids.length) return;
        for (const id of ids) await saveOne(id);
        notify({ type: 'success', title: 'Saved', message: `${ids.length} employees` });
        await load();
    };

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={S.pageHead}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Employee Salary Settings</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button style={S.btn} onClick={load} disabled={busy}><RefreshCw size={13}/> Reload</button>
                    <button style={S.btnPrimary} onClick={saveAll} disabled={!Object.keys(drafts).length}>
                        <Save size={13}/> Save All ({Object.keys(drafts).length})
                    </button>
                </div>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0, marginBottom: 8 }}>
                Set per-employee salary attributes here. These feed into the monthly salary sheet calculation.
                Toggle a checkbox to include an allowance/deduction; the amount next to it becomes active.
            </p>

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <table style={S.tbl}>
                    <thead>
                        <tr>
                            <th style={S.th}>Sr</th>
                            <th style={S.th}>Name</th>
                            <th style={S.th}>Department</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Basic Salary</th>
                            <th style={S.th}>EOBI</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>EOBI Amt</th>
                            <th style={S.th}>Fuel</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Fuel Amt</th>
                            <th style={S.th}>Mess</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Mess/day</th>
                            <th style={S.th}>Custom Late</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Late/min</th>
                            <th style={S.th}>Pay Mode</th>
                            <th style={S.th}>Bank Acct #</th>
                            <th style={S.th}>Salary GL</th>
                            <th style={S.th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map((e, i) => {
                            const id = e.EmployeeID;
                            const dirty = !!drafts[id];
                            return (
                                <tr key={id} style={dirty ? { background: '#fffbeb' } : undefined}>
                                    <td style={S.td}>
                                        <input type="text" disabled={!canEdit}
                                            value={val(id, 'SrNo', e.SrNo || '') || ''}
                                            onChange={ev => patch(id, 'SrNo', ev.target.value)}
                                            style={{ ...S.inp, width: 55 }} placeholder={String(i+1)}/>
                                    </td>
                                    <td style={S.td}>{e.EmployeeName}</td>
                                    <td style={S.td}>{e.DepartmentName || '—'}</td>
                                    <td style={S.td}>
                                        <input type="number" step="0.01" min={0} disabled={!canEdit}
                                            value={val(id, 'BasicSalary', e.BasicSalary || 0)}
                                            onChange={ev => patch(id, 'BasicSalary', Number(ev.target.value))}
                                            style={{ ...S.numIn, width: 95 }}/>
                                    </td>
                                    <td style={S.td}><input type="checkbox" disabled={!canEdit}
                                            checked={!!val(id, 'HasEOBI', e.HasEOBI)}
                                            onChange={ev => patch(id, 'HasEOBI', ev.target.checked)}/></td>
                                    <td style={S.td}>
                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasEOBI', e.HasEOBI)}
                                            value={val(id, 'EOBI', e.EOBI || 0)}
                                            onChange={ev => patch(id, 'EOBI', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}><input type="checkbox" disabled={!canEdit}
                                            checked={!!val(id, 'HasFuelAllowance', e.HasFuelAllowance)}
                                            onChange={ev => patch(id, 'HasFuelAllowance', ev.target.checked)}/></td>
                                    <td style={S.td}>
                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasFuelAllowance', e.HasFuelAllowance)}
                                            value={val(id, 'FuelAllowance', e.FuelAllowance || 0)}
                                            onChange={ev => patch(id, 'FuelAllowance', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}><input type="checkbox" disabled={!canEdit}
                                            checked={!!val(id, 'HasMess', e.HasMess)}
                                            onChange={ev => patch(id, 'HasMess', ev.target.checked)}/></td>
                                    <td style={S.td}>
                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasMess', e.HasMess)}
                                            value={val(id, 'MessAmount', e.MessAmount || 0)}
                                            onChange={ev => patch(id, 'MessAmount', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}><input type="checkbox" disabled={!canEdit}
                                            checked={!!val(id, 'HasCustomLateFine', e.HasCustomLateFine)}
                                            onChange={ev => patch(id, 'HasCustomLateFine', ev.target.checked)}/></td>
                                    <td style={S.td}>
                                        <input type="number" step="0.01" min={0} disabled={!canEdit || !val(id, 'HasCustomLateFine', e.HasCustomLateFine)}
                                            value={val(id, 'CustomLateFineAmount', e.CustomLateFineAmount || 0)}
                                            onChange={ev => patch(id, 'CustomLateFineAmount', Number(ev.target.value))}
                                            style={S.numIn}/>
                                    </td>
                                    <td style={S.td}>
                                        <select disabled={!canEdit}
                                            value={val(id, 'IsPaidByBank', e.IsPaidByBank) ? '1' : '0'}
                                            onChange={ev => patch(id, 'IsPaidByBank', ev.target.value === '1')}
                                            style={{ ...S.inp, width: 70 }}>
                                            <option value="0">Cash</option>
                                            <option value="1">Bank</option>
                                        </select>
                                    </td>
                                    <td style={S.td}>
                                        <input type="text" disabled={!canEdit || !val(id, 'IsPaidByBank', e.IsPaidByBank)}
                                            value={val(id, 'BankAccountNumber', e.BankAccountNumber || '') || ''}
                                            onChange={ev => patch(id, 'BankAccountNumber', ev.target.value)}
                                            style={{ ...S.inp, width: 130 }}/>
                                    </td>
                                    <td style={S.td} onClick={e2 => e2.stopPropagation()}>
                                        <div style={{ minWidth: 200 }}>
                                            <GLAccountPicker
                                                value={val(id, 'EmployeeGLID', e.EmployeeGLID || '')}
                                                onChange={v => patch(id, 'EmployeeGLID', v)}
                                                placeholder="Pick GL…"
                                            />
                                        </div>
                                    </td>
                                    <td style={S.td}>{dirty && <button style={S.btnSm} onClick={() => saveOne(id)}>Save</button>}</td>
                                </tr>
                            );
                        })}
                        {!employees.length && (
                            <tr><td colSpan={16} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No active employees</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const S = {
    pageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    btn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12,
           background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', color: '#334155' },
    btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12,
                  background: '#7c3aed', border: '1px solid #6d28d9', borderRadius: 4, cursor: 'pointer', color: '#fff' },
    btnSm: { padding: '2px 8px', fontSize: 11, background: '#7c3aed', color: '#fff', border: 0, borderRadius: 3, cursor: 'pointer' },
    tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
    th: { padding: '5px 6px', background: '#f1f5f9', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#334155',
          borderBottom: '1px solid #cbd5e1', whiteSpace: 'nowrap' },
    td: { padding: '3px 6px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' },
    inp: { padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 11 },
    numIn: { width: 80, padding: '3px 6px', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 11 },
};
