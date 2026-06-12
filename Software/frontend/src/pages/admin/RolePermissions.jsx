import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function RolePermissions() {
    const [roles, setRoles]       = useState([]);
    const [modules, setModules]   = useState([]);
    const [selected, setSelected] = useState(null);
    const [perms, setPerms]       = useState([]);
    const [msg, setMsg]           = useState('');
    const [newRoleName, setNewRoleName] = useState('');
    const [showNewRole, setShowNewRole] = useState(false);

    useEffect(() => { loadRoles(); loadModules(); }, []);

    const loadRoles = async () => {
        const r = await axios.get('/api/admin/roles');
        setRoles(r.data);
    };
    const loadModules = async () => {
        const r = await axios.get('/api/admin/modules');
        setModules(r.data);
    };

    const selectRole = async (role) => {
        setSelected(role);
        const r = await axios.get(`/api/admin/roles/${role.GroupID}/permissions`);
        setPerms(r.data);
    };

    const toggle = (key) => {
        setPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const save = async () => {
        await axios.put(`/api/admin/roles/${selected.GroupID}/permissions`, { modules: perms });
        setMsg('Saved'); setTimeout(() => setMsg(''), 2000);
    };

    const createRole = async () => {
        if (!newRoleName.trim()) return;
        await axios.post('/api/admin/roles', { GroupTitle: newRoleName.trim() });
        setNewRoleName(''); setShowNewRole(false);
        loadRoles();
    };

    const sections = [...new Set(modules.map(m => m.section))];

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Role Permissions</h1>
            </div>

            <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>
                {/* Left: Roles list */}
                <div style={panel}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <strong style={{fontSize:13, color:'#475569'}}>ROLES</strong>
                        <button style={linkBtn} onClick={() => setShowNewRole(!showNewRole)}>+ New</button>
                    </div>
                    {showNewRole && (
                        <div style={{marginBottom:10, display:'flex', gap:6}}>
                            <input
                                style={{flex:1, padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:5, fontSize:13}}
                                placeholder="Role name"
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && createRole()}
                            />
                            <button style={linkBtn} onClick={createRole}>Add</button>
                        </div>
                    )}
                    {roles.map(r => (
                        <div
                            key={r.GroupID}
                            onClick={() => selectRole(r)}
                            style={roleItem(selected?.GroupID === r.GroupID)}
                        >
                            {r.GroupTitle}
                        </div>
                    ))}
                </div>

                {/* Right: Module checkboxes */}
                {selected ? (
                    <div style={{ flex:1 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                            <h3 style={{fontSize:16, color:'#1e293b'}}>Modules for: <strong>{selected.GroupTitle}</strong></h3>
                            <button className="btn-primary" onClick={save}>Save Permissions</button>
                        </div>
                        {msg && <div style={{background:'#dcfce7',color:'#166534',padding:'8px 12px',borderRadius:6,marginBottom:12,fontSize:13}}>{msg}</div>}

                        {sections.map(section => (
                            <div key={section} style={sectionBlock}>
                                <div style={sectionHeader}>{section}</div>
                                <div style={moduleGrid}>
                                    {modules.filter(m => m.section === section).map(m => (
                                        <label key={m.key} style={checkLabel}>
                                            <input
                                                type="checkbox"
                                                checked={perms.includes(m.key)}
                                                onChange={() => toggle(m.key)}
                                                style={{marginRight:6}}
                                            />
                                            {m.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:14}}>
                        Select a role on the left to configure its module access.
                    </div>
                )}
            </div>
        </div>
    );
}

const panel = {
    width: 200, background:'#f8fafc', border:'1px solid #e2e8f0',
    borderRadius:8, padding:14, flexShrink:0
};
const roleItem = (active) => ({
    padding: '8px 10px', borderRadius:6, cursor:'pointer', fontSize:14,
    marginBottom:4,
    background: active ? '#dbeafe' : 'transparent',
    color: active ? '#1d4ed8' : '#334155',
    fontWeight: active ? 600 : 400,
});
const linkBtn = {
    background:'none', border:'none', color:'#2563eb', cursor:'pointer', fontSize:13, padding:0
};
const sectionBlock = {
    background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, marginBottom:14, overflow:'hidden'
};
const sectionHeader = {
    background:'#f1f5f9', padding:'8px 14px', fontSize:11, fontWeight:700,
    color:'#64748b', letterSpacing:'0.05em'
};
const moduleGrid = {
    padding:'12px 14px', display:'flex', flexWrap:'wrap', gap:'10px 24px'
};
const checkLabel = {
    display:'flex', alignItems:'center', fontSize:13, color:'#334155', cursor:'pointer', minWidth:160
};
