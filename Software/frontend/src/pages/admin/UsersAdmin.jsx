import React, { useEffect, useState } from 'react';
import axios from 'axios';

const emptyForm = { UserName: '', Password: '', GroupID: '', Active: true, LinkedEmployeeID: '' };

export default function UsersAdmin() {
    const [users, setUsers]     = useState([]);
    const [roles, setRoles]     = useState([]);
    const [employees, setEmployees] = useState([]);
    const [modal, setModal]     = useState(null); // null | 'create' | 'edit'
    const [form, setForm]       = useState(emptyForm);
    const [editId, setEditId]   = useState(null);
    const [pwdModal, setPwdModal] = useState(null);
    const [newPwd, setNewPwd]   = useState('');
    const [msg, setMsg]         = useState('');
    const [err, setErr]         = useState('');

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [u, r, e] = await Promise.all([
            axios.get('/api/admin/users'),
            axios.get('/api/admin/roles'),
            axios.get('/api/employees').catch(() => ({ data: [] })),
        ]);
        setUsers(u.data);
        setRoles(r.data);
        setEmployees(e.data);
    };

    const flash = (m, isErr = false) => {
        isErr ? setErr(m) : setMsg(m);
        setTimeout(() => { setMsg(''); setErr(''); }, 3000);
    };

    const openCreate = () => { setForm(emptyForm); setEditId(null); setModal('create'); };
    const openEdit = (u) => {
        setForm({
            UserName: u.UserName, Password: '',
            GroupID: u.GroupID, Active: !!u.Active,
            LinkedEmployeeID: u.LinkedEmployeeID || ''
        });
        setEditId(u.Userid);
        setModal('edit');
    };

    const save = async () => {
        try {
            if (modal === 'create') {
                await axios.post('/api/admin/users', form);
                flash('User created');
            } else {
                await axios.put(`/api/admin/users/${editId}`, form);
                flash('User updated');
            }
            setModal(null);
            load();
        } catch (e) {
            flash(e.response?.data?.error || 'Error', true);
        }
    };

    const doResetPwd = async () => {
        try {
            await axios.put(`/api/admin/users/${pwdModal}/reset-password`, { Password: newPwd });
            flash('Password reset');
            setPwdModal(null); setNewPwd('');
        } catch (e) {
            flash(e.response?.data?.error || 'Error', true);
        }
    };

    const roleName = (id) => roles.find(r => r.GroupID === id)?.GroupTitle || id;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">User Management</h1>
                <button className="btn-primary" onClick={openCreate}>+ New User</button>
            </div>

            {msg && <div style={notifStyle('#dcfce7','#166534')}>{msg}</div>}
            {err && <div style={notifStyle('#fee2e2','#b91c1c')}>{err}</div>}

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Linked Employee</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.Userid}>
                                <td>{u.UserName}</td>
                                <td>{u.GroupTitle || roleName(u.GroupID)}</td>
                                <td style={{ color: u.LinkedEmployeeName ? '#0f172a' : '#94a3b8', fontStyle: u.LinkedEmployeeName ? 'normal' : 'italic' }}>
                                    {u.LinkedEmployeeName || 'not linked'}
                                </td>
                                <td>
                                    <span style={badgeStyle(u.Active)}>
                                        {u.Active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    <button className="btn-secondary" style={{marginRight:6}} onClick={() => openEdit(u)}>Edit</button>
                                    <button className="btn-secondary" onClick={() => { setPwdModal(u.Userid); setNewPwd(''); }}>Reset Pwd</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal && (
                <div style={overlay}>
                    <div style={modalBox}>
                        <h3 style={{marginBottom:16}}>{modal === 'create' ? 'Create User' : 'Edit User'}</h3>
                        <Field label="Username">
                            <input className="form-input" value={form.UserName} onChange={e => setForm({...form, UserName: e.target.value})} />
                        </Field>
                        <Field label="Role">
                            <select className="form-input" value={form.GroupID} onChange={e => setForm({...form, GroupID: parseInt(e.target.value)})}>
                                <option value="">-- Select Role --</option>
                                {roles.map(r => <option key={r.GroupID} value={r.GroupID}>{r.GroupTitle}</option>)}
                            </select>
                        </Field>
                        <Field label="Linked Employee (optional — for attributing JC actions, escalations, etc.)">
                            <select className="form-input" value={form.LinkedEmployeeID} onChange={e => setForm({...form, LinkedEmployeeID: e.target.value})}>
                                <option value="">— Not linked —</option>
                                {employees.map(emp => (
                                    <option key={emp.EmployeeID} value={emp.EmployeeID}>
                                        {emp.EmployeeName}{emp.DepartmentName ? ` (${emp.DepartmentName})` : ''}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        {modal === 'create' && (
                            <Field label="Password">
                                <input className="form-input" type="password" value={form.Password} onChange={e => setForm({...form, Password: e.target.value})} />
                            </Field>
                        )}
                        <Field label="Status">
                            <select className="form-input" value={form.Active ? '1' : '0'} onChange={e => setForm({...form, Active: e.target.value === '1'})}>
                                <option value="1">Active</option>
                                <option value="0">Inactive</option>
                            </select>
                        </Field>
                        <div style={{display:'flex',gap:8,marginTop:16}}>
                            <button className="btn-primary" onClick={save}>Save</button>
                            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {pwdModal && (
                <div style={overlay}>
                    <div style={modalBox}>
                        <h3 style={{marginBottom:16}}>Reset Password</h3>
                        <Field label="New Password">
                            <input className="form-input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                        </Field>
                        <div style={{display:'flex',gap:8,marginTop:16}}>
                            <button className="btn-primary" onClick={doResetPwd}>Reset</button>
                            <button className="btn-secondary" onClick={() => setPwdModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div style={{marginBottom:12}}>
            <label style={{display:'block',fontSize:12,fontWeight:500,color:'#475569',marginBottom:4}}>{label}</label>
            {children}
        </div>
    );
}

const notifStyle = (bg, color) => ({
    background: bg, color, padding:'10px 14px', borderRadius:6, marginBottom:12, fontSize:13
});
const badgeStyle = (active) => ({
    padding:'2px 8px', borderRadius:12, fontSize:12, fontWeight:500,
    background: active ? '#dcfce7' : '#fee2e2',
    color: active ? '#166534' : '#b91c1c',
});
const overlay = {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.4)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
};
const modalBox = {
    background:'#fff', borderRadius:10, padding:28, width:380, boxShadow:'0 8px 32px rgba(0,0,0,0.18)'
};
