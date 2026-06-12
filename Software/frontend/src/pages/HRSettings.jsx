import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Save, Loader2 } from 'lucide-react';

const API_BASE = '/api';

export default function HRSettings() {
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [deptName, setDeptName] = useState('');
  const [desigName, setDesigName] = useState('');

  const fetchData = async () => {
    try {
      const [deptRes, desigRes, empRes] = await Promise.all([
        axios.get(`${API_BASE}/departments`),
        axios.get(`${API_BASE}/designations`),
        axios.get(`${API_BASE}/employees`),
      ]);
      setDepartments(deptRes.data);
      setDesignations(desigRes.data);
      setEmployees(empRes.data);
    } catch (err) { console.error('Error fetching HR config:', err); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddDept = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/departments`, { DepartmentName: deptName, ActionUserID: 1 });
      setDeptName(''); fetchData();
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleAddDesig = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/designations`, { DesignationName: desigName, ActionUserID: 1 });
      setDesigName(''); fetchData();
    } catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div>
      <h1 className="page-title">HR Configurations</h1>
      <p className="page-subtitle">Manage departments, designations, and the org-chart relationships used by escalation chains.</p>

      <div className="grid-2" style={{ marginTop: '24px', gap: '24px' }}>
        <div className="card">
          <h2 className="card-title">Departments</h2>
          <form onSubmit={handleAddDept} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Sales, Service" value={deptName} onChange={e => setDeptName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <DepartmentManagerList departments={departments} employees={employees} onChanged={fetchData} />
        </div>

        <div className="card">
          <h2 className="card-title">Designations</h2>
          <form onSubmit={handleAddDesig} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Service Advisor" value={desigName} onChange={e => setDesigName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {designations.map(d => (
              <li key={d.DesignationID} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                {d.DesignationName}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 8 }}>(ID: {d.DesignationID})</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Reports-To assignments — second section */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 className="card-title">Reporting Hierarchy</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
          Set <strong>Reports To</strong> for each employee. Drives escalation chains and org-chart reports.
        </p>
        <EmployeeReportsToList employees={employees} onChanged={fetchData} />
      </div>
    </div>
  );
}

function DepartmentManagerList({ departments, employees, onChanged }) {
  return (
    <div>
      {departments.map(d => (
        <DeptManagerRow key={d.DepartmentID} dept={d} employees={employees} onSaved={onChanged} />
      ))}
    </div>
  );
}

function DeptManagerRow({ dept, employees, onSaved }) {
  const [managerId, setManagerId] = useState(dept.ManagerEmployeeID || '');
  const [busy, setBusy] = useState(false);
  const dirty = String(managerId || '') !== String(dept.ManagerEmployeeID || '');

  const save = async () => {
    setBusy(true);
    try {
      await axios.patch(`${API_BASE}/departments/${dept.DepartmentID}/manager`, {
        ManagerEmployeeID: managerId || null
      });
      onSaved();
    } catch (err) { alert('Error: ' + err.message); }
    setBusy(false);
  };

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{dept.DepartmentName}</div>
      <select
        value={managerId}
        onChange={e => setManagerId(e.target.value)}
        style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.85rem', minWidth: 220 }}
      >
        <option value="">— No manager —</option>
        {employees.map(e => (
          <option key={e.EmployeeID} value={e.EmployeeID}>{e.EmployeeName}</option>
        ))}
      </select>
      <button
        onClick={save}
        disabled={!dirty || busy}
        style={{
          padding: '6px 10px', fontSize: '0.8rem',
          background: dirty ? 'var(--primary)' : '#f1f5f9',
          color: dirty ? 'white' : '#94a3b8',
          border: 'none', borderRadius: 4,
          cursor: dirty && !busy ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 4
        }}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        Save
      </button>
    </div>
  );
}

function EmployeeReportsToList({ employees, onChanged }) {
  const [filter, setFilter] = useState('');
  const filtered = filter
    ? employees.filter(e => e.EmployeeName?.toLowerCase().includes(filter.toLowerCase()) ||
                            e.DepartmentName?.toLowerCase().includes(filter.toLowerCase()))
    : employees;

  return (
    <div>
      <input
        type="text"
        placeholder="Filter by employee name or department..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, marginBottom: 12, fontSize: '0.875rem' }}
      />
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: 8, textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b' }}>Employee</th>
              <th style={{ padding: 8, textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b' }}>Department</th>
              <th style={{ padding: 8, textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b' }}>Reports To</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <ReportsToRow key={emp.EmployeeID} emp={emp} all={employees} onSaved={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsToRow({ emp, all, onSaved }) {
  const [reportsToId, setReportsToId] = useState(emp.ReportsToID || '');
  const [busy, setBusy] = useState(false);
  const dirty = String(reportsToId || '') !== String(emp.ReportsToID || '');

  const save = async () => {
    setBusy(true);
    try {
      await axios.patch(`${API_BASE}/employees/${emp.EmployeeID}/reports-to`, {
        ReportsToID: reportsToId || null
      });
      onSaved();
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
    setBusy(false);
  };

  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: 8 }}>{emp.EmployeeName}</td>
      <td style={{ padding: 8, color: '#64748b' }}>{emp.DepartmentName || '—'}</td>
      <td style={{ padding: 8 }}>
        <select
          value={reportsToId}
          onChange={e => setReportsToId(e.target.value)}
          style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.8rem', width: '100%' }}
        >
          <option value="">— Top of chain —</option>
          {all.filter(e => e.EmployeeID !== emp.EmployeeID).map(e => (
            <option key={e.EmployeeID} value={e.EmployeeID}>{e.EmployeeName}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: 8, width: 60 }}>
        <button
          onClick={save}
          disabled={!dirty || busy}
          style={{
            padding: '4px 8px', fontSize: '0.75rem',
            background: dirty ? 'var(--primary)' : '#f1f5f9',
            color: dirty ? 'white' : '#94a3b8',
            border: 'none', borderRadius: 4,
            cursor: dirty && !busy ? 'pointer' : 'default'
          }}
        >
          {busy ? '...' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
