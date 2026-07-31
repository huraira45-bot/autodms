import { useState, useEffect } from 'react';
import axios from 'axios';
import { UserPlus, Wrench, Pencil, UserX, UserCheck, Wallet } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import GLAccountPicker from '../components/GLAccountPicker';
import Can from '../components/Can';
import { useCan } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import { ErpControlPanel } from '../components/erp';

const API_BASE = '/api';

const BLANK_FORM = {
  EmployeeName: '',
  EmployeeNo: '',
  EmployeeGLID: '',
  FatherName: '',
  EmployeeGender: 'Male',
  CNICno: '',
  MobileNo: '',
  PermanentAddress: '',
  DOB: '',
  EmailAddress: '',
  DepartmentID: '',
  DesignationID: '',
  MachineId: '',
  BasicSalary: '',
  UserName: '',
  Password: '',
  ActionUserID: 1,
};

export default function Employees() {
  const { notify, confirm } = useFeedback();
  const { canInsert, canEdit } = useCan('hr_employees');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const [formData, setFormData] = useState(BLANK_FORM);
  const [togglingId, setTogglingId] = useState(null);

  const fetchData = async () => {
    try {
      const [empRes, deptRes, desigRes] = await Promise.all([
        axios.get(`${API_BASE}/employees`, { params: showInactive ? { includeInactive: '1' } : {} }),
        axios.get(`${API_BASE}/departments`),
        axios.get(`${API_BASE}/designations`)
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setDesignations(desigRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(BLANK_FORM);
  };

  const startEdit = (emp) => {
    setFormData({
      EmployeeName: emp.EmployeeName || '',
      EmployeeNo: emp.EmployeeNo || '',
      EmployeeGLID: emp.EmployeeGLID || '',
      FatherName: emp.FatherName || '',
      EmployeeGender: emp.EmployeeGender || 'Male',
      CNICno: emp.CNICno || '',
      MobileNo: emp.MobileNo || '',
      PermanentAddress: emp.PermanentAddress || '',
      DOB: emp.DOB ? String(emp.DOB).slice(0, 10) : '',
      EmailAddress: emp.EmailAddress || '',
      DepartmentID: emp.DepartmentID || '',
      DesignationID: emp.DesignationID || '',
      MachineId: emp.MachineId || '',
      BasicSalary: emp.BasicSalary || '',
      UserName: '',
      Password: '',
      ActionUserID: 1,
    });
    setEditingId(emp.EmployeeID);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/employees/${editingId}`, formData);
        notify({ type: 'success', title: 'Employee updated', message: formData.EmployeeName });
      } else {
        await axios.post(`${API_BASE}/employees`, formData);
        notify({ type: 'success', title: 'Employee registered', message: formData.EmployeeName });
      }
      closeForm();
      fetchData();
    } catch (err) {
      notify({ type: 'error', title: 'Could not save employee', message: err.response?.data?.message || err.response?.data?.details || err.response?.data?.error || err.message });
    }
  };

  const toggleTechnician = async (emp) => {
    setTogglingId(emp.EmployeeID);
    try {
      await axios.patch(`${API_BASE}/employees/${emp.EmployeeID}/technician`, { IsTechnician: !emp.IsTechnician });
      setEmployees(prev => prev.map(e => e.EmployeeID === emp.EmployeeID ? { ...e, IsTechnician: !emp.IsTechnician } : e));
      notify({ type: 'success', title: !emp.IsTechnician ? 'Technician role added' : 'Technician role removed', message: emp.EmployeeName });
    } catch (err) {
      notify({ type: 'error', title: 'Could not update technician role', message: err.response?.data?.error || err.message });
    }
    setTogglingId(null);
  };

  const togglePayroll = async (emp) => {
    setTogglingId(emp.EmployeeID);
    try {
      await axios.patch(`${API_BASE}/employees/${emp.EmployeeID}/payroll-inclusion`, { IsOnPayroll: !emp.IsOnPayroll });
      setEmployees(prev => prev.map(e => e.EmployeeID === emp.EmployeeID ? { ...e, IsOnPayroll: !emp.IsOnPayroll } : e));
      notify({
        type: 'success',
        title: emp.IsOnPayroll ? 'Excluded from Salary Sheet' : 'Included in Salary Sheet',
        message: emp.EmployeeName,
      });
    } catch (err) {
      notify({ type: 'error', title: 'Could not update payroll inclusion', message: err.response?.data?.error || err.message });
    }
    setTogglingId(null);
  };

  const toggleActive = async (emp) => {
    const leaving = !!emp.IsActive;
    const ok = await confirm({
      title: leaving ? 'Mark employee as left?' : 'Reactivate employee?',
      message: leaving
        ? `${emp.EmployeeName} will be marked inactive as of today and removed from the Salary Sheet and active staff lists.`
        : `${emp.EmployeeName} will be marked active again and reappear in active staff lists.`,
      confirmLabel: leaving ? 'Mark as left' : 'Reactivate',
      tone: leaving ? 'warning' : 'primary',
    });
    if (!ok) return;

    setTogglingId(emp.EmployeeID);
    try {
      await axios.patch(`${API_BASE}/employees/${emp.EmployeeID}/active`, { IsActive: !leaving });
      notify({ type: 'success', title: leaving ? 'Marked as left' : 'Reactivated', message: emp.EmployeeName });
      fetchData();
    } catch (err) {
      notify({ type: 'error', title: 'Could not update employee status', message: err.response?.data?.error || err.message });
    }
    setTogglingId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ErpControlPanel
        title="Employees"
        subtitle="Manage dealership staff, credentials, and financials."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show Left Employees
            </label>
            {canInsert && (
              <button type="button" className="erp-btn erp-btn-primary" onClick={() => (showForm ? closeForm() : setShowForm(true))}>
                {showForm ? 'Close Form' : <><UserPlus size={14} /> Add Employee</>}
              </button>
            )}
          </div>
        }
      />

      {showForm && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--primary)' }}>
          <h2 className="card-title" style={{ marginBottom: '16px' }}>
            {editingId ? `Edit Employee — ${formData.EmployeeName}` : 'Comprehensive Employee Registration'}
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              {/* Row 1 */}
              <div className="form-group">
                <label>Emp. Code</label>
                <input type="text" placeholder="e.g. EMP-1768" value={formData.EmployeeNo} onChange={e => setFormData({...formData, EmployeeNo: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Emp. Account (Chart of Accounts)</label>
                <GLAccountPicker
                  value={formData.EmployeeGLID}
                  onChange={(glcaid) => setFormData({ ...formData, EmployeeGLID: glcaid || '' })}
                  parentCode="102004"
                  placeholder="Search employee account under 102004 Staff Receivables…"
                />
              </div>

              {/* Row 2 */}
              <div className="form-group">
                <label>Full Name *</label>
                <input required type="text" value={formData.EmployeeName} onChange={e => setFormData({...formData, EmployeeName: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Father Name</label>
                <input type="text" value={formData.FatherName} onChange={e => setFormData({...formData, FatherName: e.target.value})} />
              </div>

              {/* Row 3 */}
              <div className="form-group">
                <label>Gender</label>
                <select value={formData.EmployeeGender} onChange={e => setFormData({...formData, EmployeeGender: e.target.value})}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="form-group">
                <label>NIC No (CNIC) *</label>
                <input required type="text" placeholder="36302-XXXXXXX-X" value={formData.CNICno} onChange={e => setFormData({...formData, CNICno: e.target.value})} />
              </div>

              {/* Row 4 */}
              <div className="form-group">
                <label>Date Of Birth</label>
                <input type="date" value={formData.DOB} onChange={e => setFormData({...formData, DOB: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Mobile No *</label>
                <input required type="text" value={formData.MobileNo} onChange={e => setFormData({...formData, MobileNo: e.target.value})} />
              </div>

              {/* Row 5 */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Full Address</label>
                <input type="text" value={formData.PermanentAddress} onChange={e => setFormData({...formData, PermanentAddress: e.target.value})} />
              </div>

              {/* Row 6 */}
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formData.EmailAddress} onChange={e => setFormData({...formData, EmailAddress: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Business Unit (Department) *</label>
                <SearchableSelect
                  value={formData.DepartmentID}
                  onChange={v => setFormData({...formData, DepartmentID: v})}
                  placeholder="Select department…"
                  title="Pick Department"
                  options={departments.map(d => ({ id: d.DepartmentID, label: d.DepartmentName }))}
                />
              </div>

              {/* Row 7 */}
              <div className="form-group">
                <label>Designation *</label>
                <SearchableSelect
                  value={formData.DesignationID}
                  onChange={v => setFormData({...formData, DesignationID: v})}
                  placeholder="Select designation…"
                  title="Pick Designation"
                  options={designations.map(d => ({ id: d.DesignationID, label: d.DesignationName }))}
                />
              </div>
              <div className="form-group">
                <label>Machine ID (Biometric)</label>
                <input type="number" value={formData.MachineId} onChange={e => setFormData({...formData, MachineId: e.target.value})} />
              </div>

              {/* Row 8 */}
              <div className="form-group">
                <label>Monthly Salary (PKR)</label>
                <input type="number" step="0.01" value={formData.BasicSalary} onChange={e => setFormData({...formData, BasicSalary: e.target.value})} />
              </div>
              <div></div> {/* Spacer */}

              {!editingId && (
                <>
                  {/* System Credentials Section */}
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
                    <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '8px', color: 'var(--primary)' }}>System Credentials</h3>
                  </div>

                  <div className="form-group">
                    <label>User Name</label>
                    <input type="text" value={formData.UserName} onChange={e => setFormData({...formData, UserName: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={formData.Password} onChange={e => setFormData({...formData, Password: e.target.value})} />
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: 10 }}>
              <button type="submit" className="btn">{editingId ? 'Save Changes' : 'Save Comprehensive Record'}</button>
              {editingId && (
                <button type="button" className="btn" style={{ background: 'var(--surface-2)', color: 'var(--text)' }} onClick={closeForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '16px' }}>
          {showInactive ? 'All Staff (incl. Left)' : 'Active Staff Directory'}
        </h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>NIC No</th>
                <th>Department</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Wrench size={14} /> Technician
                  </span>
                </th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Wallet size={14} /> On Payroll
                  </span>
                </th>
                {canEdit && <th style={{ textAlign: 'center' }}>Edit</th>}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No employees found.</td></tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.EmployeeID} style={!emp.IsActive ? { opacity: 0.6 } : undefined}>
                    <td>{emp.EmployeeNo || `#${emp.EmployeeID}`}</td>
                    <td style={{ fontWeight: '500' }}>{emp.EmployeeName}</td>
                    <td>{emp.MobileNo}</td>
                    <td>{emp.CNICno}</td>
                    <td>
                      {emp.DepartmentName
                        ? <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{emp.DepartmentName}</span>
                        : '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => toggleActive(emp)}
                        disabled={togglingId === emp.EmployeeID || !canEdit}
                        title={emp.IsActive ? 'Mark as left' : `Reactivate (left ${emp.ResignDate ? String(emp.ResignDate).slice(0,10) : ''})`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: emp.IsActive ? '#dcfce7' : '#fee2e2',
                          color: emp.IsActive ? '#16a34a' : '#b91c1c',
                          fontSize: '0.75rem', fontWeight: 600,
                          opacity: togglingId === emp.EmployeeID ? 0.5 : 1,
                        }}
                      >
                        {emp.IsActive ? <UserCheck size={13} /> : <UserX size={13} />}
                        {emp.IsActive ? 'Active' : 'Left'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => toggleTechnician(emp)}
                        disabled={togglingId === emp.EmployeeID || !canEdit}
                        title={emp.IsTechnician ? 'Remove technician role' : 'Mark as technician'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: emp.IsTechnician ? '#dcfce7' : '#f1f5f9',
                          color: emp.IsTechnician ? '#16a34a' : '#94a3b8',
                          transition: 'all 0.15s',
                          opacity: togglingId === emp.EmployeeID ? 0.5 : 1
                        }}
                      >
                        <Wrench size={15} />
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => togglePayroll(emp)}
                        disabled={togglingId === emp.EmployeeID || !canEdit}
                        title={emp.IsOnPayroll === false ? 'Include on Salary Sheet' : 'Exclude from Salary Sheet (no salary drawn)'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: emp.IsOnPayroll === false ? '#f1f5f9' : '#dcfce7',
                          color: emp.IsOnPayroll === false ? '#94a3b8' : '#16a34a',
                          transition: 'all 0.15s',
                          opacity: togglingId === emp.EmployeeID ? 0.5 : 1
                        }}
                      >
                        <Wallet size={15} />
                      </button>
                    </td>
                    {canEdit && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => startEdit(emp)}
                          title="Edit employee"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: '#eef2ff', color: '#4338ca',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
