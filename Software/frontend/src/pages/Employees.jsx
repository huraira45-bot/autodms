import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UserPlus, Wrench } from 'lucide-react';

const API_BASE = '/api';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  
  // Comprehensive Form State matching the legacy image
  const [formData, setFormData] = useState({
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
    ActionUserID: 1
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [togglingId, setTogglingId] = useState(null);

  const fetchData = async () => {
    try {
      const [empRes, deptRes, desigRes] = await Promise.all([
        axios.get(`${API_BASE}/employees`),
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
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      // The UserName and Password are captured but will require the sp_InsertUser logic later.
      // For now, we pass all fields to our expanded sp_InsertEmployee endpoint.
      await axios.post(`${API_BASE}/employees`, formData);
      setSuccess('Employee comprehensively registered!');
      
      // Reset form
      setFormData({
        EmployeeName: '', EmployeeNo: '', EmployeeGLID: '', FatherName: '',
        EmployeeGender: 'Male', CNICno: '', MobileNo: '', PermanentAddress: '',
        DOB: '', EmailAddress: '', DepartmentID: '', DesignationID: '',
        MachineId: '', BasicSalary: '', UserName: '', Password: '', ActionUserID: 1
      });
      setShowForm(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.details || 'An error occurred while saving.');
    }
  };

  const toggleTechnician = async (emp) => {
    setTogglingId(emp.EmployeeID);
    try {
      await axios.patch(`${API_BASE}/employees/${emp.EmployeeID}/technician`, { IsTechnician: !emp.IsTechnician });
      setEmployees(prev => prev.map(e => e.EmployeeID === emp.EmployeeID ? { ...e, IsTechnician: !emp.IsTechnician } : e));
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
    setTogglingId(null);
  };

  return (
    <div>
      <div className="card-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Manage dealership staff, credentials, and financials.</p>
        </div>
        <button className="btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Close Form' : <><UserPlus size={18} /> Add Employee</>}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--primary)' }}>
          <h2 className="card-title" style={{ marginBottom: '16px' }}>Comprehensive Employee Registration</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              {/* Row 1 */}
              <div className="form-group">
                <label>Emp. Code</label>
                <input type="text" placeholder="e.g. EMP-1768" value={formData.EmployeeNo} onChange={e => setFormData({...formData, EmployeeNo: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Emp. Account (GL ID)</label>
                <input type="number" placeholder="120815" value={formData.EmployeeGLID} onChange={e => setFormData({...formData, EmployeeGLID: e.target.value})} />
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
                <select required value={formData.DepartmentID} onChange={e => setFormData({...formData, DepartmentID: e.target.value})}>
                  <option value="" disabled>Select a department...</option>
                  {departments.map(d => <option key={d.DepartmentID} value={d.DepartmentID}>{d.DepartmentName}</option>)}
                </select>
              </div>

              {/* Row 7 */}
              <div className="form-group">
                <label>Designation *</label>
                <select required value={formData.DesignationID} onChange={e => setFormData({...formData, DesignationID: e.target.value})}>
                  <option value="" disabled>Select a designation...</option>
                  {designations.map(d => <option key={d.DesignationID} value={d.DesignationID}>{d.DesignationName}</option>)}
                </select>
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
            </div>
            
            <div style={{ marginTop: '24px' }}>
              <button type="submit" className="btn">Save Comprehensive Record</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '16px' }}>Active Staff Directory</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>NIC No</th>
                <th>Department</th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Wrench size={14} /> Technician
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No active employees found.</td></tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.EmployeeID}>
                    <td>{emp.EmployeeNo || `#${emp.EmployeeID}`}</td>
                    <td style={{ fontWeight: '500' }}>{emp.EmployeeName}</td>
                    <td>{emp.MobileNo}</td>
                    <td>{emp.CNICno}</td>
                    <td>
                      {emp.DepartmentID ?
                        <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>
                          Dept {emp.DepartmentID}
                        </span>
                        : '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => toggleTechnician(emp)}
                        disabled={togglingId === emp.EmployeeID}
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
