import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit2, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = '/api/care-offs';

export default function CareOffAdmin() {
  const { hasModule } = useAuth();
  const [careOffs, setCareOffs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ EmployeeID: '', MaxDiscountPct: '', IsActive: true });
  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDD, setShowEmpDD] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const flash = (m, isErr = false) => {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => { setMsg(''); setErr(''); }, 3500);
  };

  const fetchData = async () => {
    try {
      const empRes = await axios.get('/api/employees');
      setEmployees(empRes.data);
    } catch (e) { flash('Failed to load employees.', true); }
    try {
      const coRes = await axios.get(API);
      setCareOffs(coRes.data);
    } catch (e) { flash('Failed to load care-offs.', true); }
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => {
    setEditRow(null);
    setForm({ EmployeeID: '', MaxDiscountPct: '', IsActive: true });
    setEmpSearch('');
    setShowEmpDD(false);
    setModal(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({ EmployeeID: row.EmployeeID, MaxDiscountPct: row.MaxDiscountPct, IsActive: row.IsActive });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.EmployeeID) { flash('Select an employee.', true); return; }
    const pct = parseFloat(form.MaxDiscountPct);
    if (isNaN(pct) || pct < 0 || pct > 100) { flash('Max discount must be 0–100%.', true); return; }
    setSaving(true);
    try {
      const payload = { EmployeeID: form.EmployeeID, MaxDiscountPct: pct, IsActive: form.IsActive };
      if (editRow) {
        await axios.put(`${API}/${editRow.CareOffID}`, payload);
        flash('Care-Off updated.');
      } else {
        await axios.post(API, payload);
        flash('Care-Off added.');
      }
      setModal(false);
      fetchData();
    } catch (e) { flash(e.response?.data?.error || 'Error saving.', true); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (row) => {
    try {
      if (row.IsActive) {
        await axios.delete(`${API}/${row.CareOffID}`);
        flash(`${row.EmployeeName} deactivated.`);
      } else {
        await axios.put(`${API}/${row.CareOffID}`, { EmployeeID: row.EmployeeID, MaxDiscountPct: row.MaxDiscountPct, IsActive: true });
        flash(`${row.EmployeeName} reactivated.`);
      }
      fetchData();
    } catch (e) { flash(e.response?.data?.error || 'Error.', true); }
  };

  const usedEmployeeIds = new Set(careOffs.filter(c => !editRow || c.CareOffID !== editRow.CareOffID).map(c => c.EmployeeID));
  const availableEmployees = employees.filter(e => !usedEmployeeIds.has(e.EmployeeID));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card-header">
        <div>
          <h1 className="page-title">Care-Off Management</h1>
          <p className="page-subtitle">Configure employees who can authorize discounts on Job Cards.</p>
        </div>
        {hasModule('workshop_careoff') && (
          <button className="btn" onClick={openAdd}><Plus size={18} /> Add Care-Off</button>
        )}
      </div>

      {msg && <div className="alert-success">{msg}</div>}
      {err && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{err}</div>}

      <div className="card">
        <div style={{ background: '#fef9ec', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <strong>How it works:</strong> Assign an employee as a Care-Off and set their maximum discount percentage.
          When selected on a Job Card, the user can apply discounts to labour lines up to that percentage of the total labour amount.
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Employee Name</th>
                <th style={{ textAlign: 'center' }}>Max Discount %</th>
                <th style={{ textAlign: 'center' }}>Max on PKR 1,000 job</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {careOffs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                  No Care-Offs configured. Add one above.
                </td></tr>
              ) : careOffs.map((row, i) => (
                <tr key={row.CareOffID}>
                  <td style={{ color: '#94a3b8', width: 40 }}>{i + 1}</td>
                  <td>
                    <strong>{row.EmployeeName}</strong>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>ID #{row.EmployeeID}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: 13 }}>
                      {row.MaxDiscountPct}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', color: '#475569', fontSize: 13 }}>
                    PKR {(1000 * row.MaxDiscountPct / 100).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {row.IsActive
                      ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#166534' }}>Active</span>
                      : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#64748b' }}>Inactive</span>
                    }
                  </td>
                  <td>
                    {hasModule('workshop_careoff') && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button onClick={() => openEdit(row)} title="Edit"
                          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#64748b' }}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleToggleActive(row)} title={row.IsActive ? 'Deactivate' : 'Reactivate'}
                          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: row.IsActive ? '#dc2626' : '#16a34a' }}>
                          {row.IsActive ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ marginBottom: 20, fontSize: 15 }}>{editRow ? 'Edit Care-Off' : 'Add New Care-Off'}</h3>

            <div className="form-group">
              <label>Employee *</label>
              {editRow ? (
                <input className="form-input" value={editRow.EmployeeName} readOnly style={{ background: '#f8fafc' }} />
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    value={empSearch}
                    onChange={e => { setEmpSearch(e.target.value); setShowEmpDD(true); setForm(p => ({ ...p, EmployeeID: '' })); }}
                    onFocus={() => setShowEmpDD(true)}
                    onBlur={() => setTimeout(() => setShowEmpDD(false), 150)}
                    placeholder="Type employee name to search..."
                    autoComplete="off"
                  />
                  {form.EmployeeID && !showEmpDD && (
                    <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>✓ Selected</div>
                  )}
                  {showEmpDD && (
                    <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, zIndex: 50, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', top: '100%' }}>
                      {availableEmployees
                        .filter(e => !empSearch || e.EmployeeName.toLowerCase().includes(empSearch.toLowerCase()))
                        .slice(0, 12)
                        .map(e => (
                          <div key={e.EmployeeID}
                            onMouseDown={() => {
                              setForm(p => ({ ...p, EmployeeID: e.EmployeeID }));
                              setEmpSearch(e.EmployeeName);
                              setShowEmpDD(false);
                            }}
                            style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={ev => ev.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={ev => ev.currentTarget.style.background = '#fff'}>
                            {e.EmployeeName}
                            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>#{e.EmployeeID}</span>
                          </div>
                        ))}
                      {availableEmployees.filter(e => !empSearch || e.EmployeeName.toLowerCase().includes(empSearch.toLowerCase())).length === 0 && (
                        <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>No employees found</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Max Discount % (0–100) *</label>
              <input className="form-input" type="number" min="0" max="100" step="0.5"
                value={form.MaxDiscountPct} onChange={e => setForm(p => ({ ...p, MaxDiscountPct: e.target.value }))}
                placeholder="e.g. 10" />
              {form.MaxDiscountPct !== '' && !isNaN(parseFloat(form.MaxDiscountPct)) && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  On a PKR 1,000 labour card: max discount = PKR {(1000 * parseFloat(form.MaxDiscountPct) / 100).toFixed(2)}
                </div>
              )}
            </div>

            {editRow && (
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.IsActive} onChange={e => setForm(p => ({ ...p, IsActive: e.target.checked }))} />
                  Active (uncheck to deactivate)
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleSave} disabled={saving}
                style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setModal(false)}
                style={{ background: '#e2e8f0', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
