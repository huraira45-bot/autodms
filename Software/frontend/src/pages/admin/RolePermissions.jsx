/**
 * Role Permissions — granular grid editor.
 *
 * Permission registry lives in Software/config/permissions.js and is fetched
 * from /api/admin/permission-registry. Each "item" has one of three kinds:
 *
 *   document  → 4 action checkboxes: <key>:view, :insert, :edit, :delete
 *               plus a "select all 4" master toggle.
 *   workflow  → single "Access" checkbox keyed on <key> verbatim.
 *   report    → single "Access" checkbox keyed on report:<slug>.
 *
 * The saved payload is a flat array of permission keys.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Trash2, Plus, Save, Check, AlertTriangle } from 'lucide-react';

const ACTIONS = ['view', 'insert', 'edit', 'delete'];

export default function RolePermissions() {
    const [roles, setRoles]       = useState([]);
    const [registry, setRegistry] = useState([]);  // SECTIONS
    const [selected, setSelected] = useState(null);
    const [perms, setPerms]       = useState(new Set());
    const [dirty, setDirty]       = useState(false);
    const [msg, setMsg]           = useState(null);
    const [newRoleName, setNewRoleName] = useState('');
    const [showNewRole, setShowNewRole] = useState(false);

    useEffect(() => { loadRoles(); loadRegistry(); }, []);

    const loadRoles = async () => {
        const r = await axios.get('/api/admin/roles');
        setRoles(r.data);
    };
    const loadRegistry = async () => {
        const r = await axios.get('/api/admin/permission-registry');
        setRegistry(r.data);
    };

    const selectRole = async (role) => {
        if (dirty && !window.confirm('Discard unsaved changes?')) return;
        setSelected(role);
        const r = await axios.get(`/api/admin/roles/${role.GroupID}/permissions`);
        setPerms(new Set(r.data));
        setDirty(false);
        setMsg(null);
    };

    const togglePerm = (key) => {
        setPerms(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
        setDirty(true);
    };

    const toggleAllActions = (modKey, makeOn) => {
        setPerms(prev => {
            const next = new Set(prev);
            for (const a of ACTIONS) {
                const k = `${modKey}:${a}`;
                if (makeOn) next.add(k); else next.delete(k);
            }
            return next;
        });
        setDirty(true);
    };

    const toggleSection = (section, makeOn) => {
        setPerms(prev => {
            const next = new Set(prev);
            for (const item of section.items) {
                if (item.kind === 'document') {
                    for (const a of ACTIONS) {
                        const k = `${item.key}:${a}`;
                        if (makeOn) next.add(k); else next.delete(k);
                    }
                } else {
                    if (makeOn) next.add(item.key); else next.delete(item.key);
                }
            }
            return next;
        });
        setDirty(true);
    };

    const save = async () => {
        try {
            const payload = { permissions: Array.from(perms) };
            await axios.put(`/api/admin/roles/${selected.GroupID}/permissions`, payload);
            setMsg({ type: 'ok', text: `Saved ${perms.size} permissions for ${selected.GroupTitle}.` });
            setDirty(false);
            setTimeout(() => setMsg(null), 2500);
        } catch (e) {
            setMsg({ type: 'err', text: e.response?.data?.error || e.message });
        }
    };

    const createRole = async () => {
        if (!newRoleName.trim()) return;
        await axios.post('/api/admin/roles', { GroupTitle: newRoleName.trim() });
        setNewRoleName(''); setShowNewRole(false);
        loadRoles();
    };

    const deleteRole = async (role) => {
        if (role.GroupID === 1) return;
        if (!window.confirm(`Delete role "${role.GroupTitle}"? This is irreversible.`)) return;
        try {
            await axios.delete(`/api/admin/roles/${role.GroupID}`);
            if (selected?.GroupID === role.GroupID) { setSelected(null); setPerms(new Set()); }
            loadRoles();
        } catch (e) {
            alert(e.response?.data?.error || e.message);
        }
    };

    // For document items: counts of granted actions, used by the "Select All" toggle
    const docState = (modKey) => {
        let on = 0;
        for (const a of ACTIONS) if (perms.has(`${modKey}:${a}`)) on++;
        return { on, total: ACTIONS.length };
    };

    const totalGranted = perms.size;

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: 16 }}>
                <h1 className="page-title">Role Permissions</h1>
                <p className="page-subtitle">Granular per-action access. Workshop / Parts / Sales documents have View / Insert / Edit / Delete; reports + workflow pages have single-access.</p>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* ───── Roles panel ───── */}
                <div style={panel}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <strong style={{ fontSize: 12, color: '#475569', letterSpacing: '0.04em' }}>ROLES</strong>
                        <button style={linkBtn} onClick={() => setShowNewRole(v => !v)}>
                            <Plus size={12} /> New
                        </button>
                    </div>
                    {showNewRole && (
                        <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
                            <input
                                style={{ flex: 1, padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 13 }}
                                placeholder="Role name"
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && createRole()}
                                autoFocus
                            />
                            <button style={linkBtn} onClick={createRole}>Add</button>
                        </div>
                    )}
                    {roles.map(r => (
                        <div key={r.GroupID} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div onClick={() => selectRole(r)} style={roleItem(selected?.GroupID === r.GroupID)}>
                                {r.GroupTitle}
                                {r.GroupID === 1 && <span style={adminBadge}>admin</span>}
                            </div>
                            {r.GroupID !== 1 && (
                                <button title="Delete role" style={delBtn} onClick={() => deleteRole(r)}>
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* ───── Permissions grid ───── */}
                {selected ? (
                    <div style={{ flex: 1 }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 12, padding: '10px 14px', background: '#fff',
                            border: '1px solid #e2e8f0', borderRadius: 8,
                        }}>
                            <div>
                                <h3 style={{ fontSize: 15, color: '#1e293b', margin: 0 }}>
                                    Permissions for: <strong>{selected.GroupTitle}</strong>
                                </h3>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                    {totalGranted} granted
                                    {dirty && <span style={{ color: '#b45309', marginLeft: 8, fontWeight: 600 }}>• unsaved</span>}
                                </div>
                            </div>
                            <button className="btn btn-primary" onClick={save} disabled={!dirty}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: dirty ? 1 : 0.55 }}>
                                <Save size={15} /> Save
                            </button>
                        </div>

                        {msg && (
                            <div style={{
                                padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
                                background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
                                color: msg.type === 'ok' ? '#166534' : '#991b1b',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                {msg.type === 'ok' ? <Check size={14} /> : <AlertTriangle size={14} />}
                                {msg.text}
                            </div>
                        )}

                        {registry.map(section => (
                            <div key={section.name} style={sectionBlock}>
                                <div style={sectionHeader}>
                                    <span>{section.name}</span>
                                    <span style={{ display: 'flex', gap: 8 }}>
                                        <button style={miniLink} onClick={() => toggleSection(section, true)}>all</button>
                                        <button style={miniLink} onClick={() => toggleSection(section, false)}>none</button>
                                    </span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={tableHeadRow}>
                                            <th style={{ ...th, textAlign: 'left' }}>Module</th>
                                            {section.items.some(i => i.kind === 'document') && (
                                                <>
                                                    <th style={th}>All</th>
                                                    <th style={th}>View</th>
                                                    <th style={th}>Insert</th>
                                                    <th style={th}>Edit</th>
                                                    <th style={th}>Delete</th>
                                                </>
                                            )}
                                            {section.items.every(i => i.kind !== 'document') && (
                                                <th style={th}>Access</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {section.items.map(item => (
                                            <tr key={item.key} style={tableRow}>
                                                <td style={td}>
                                                    <div style={{ fontWeight: 500, color: '#1e293b' }}>{item.label}</div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{item.key}</div>
                                                </td>
                                                {item.kind === 'document' ? (
                                                    <>
                                                        <td style={tdCheck}>
                                                            {(() => {
                                                                const { on, total } = docState(item.key);
                                                                const allOn = on === total;
                                                                return (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={allOn}
                                                                        ref={el => { if (el) el.indeterminate = on > 0 && on < total; }}
                                                                        onChange={() => toggleAllActions(item.key, !allOn)}
                                                                        title={allOn ? 'Revoke all' : 'Grant all 4'}
                                                                    />
                                                                );
                                                            })()}
                                                        </td>
                                                        {ACTIONS.map(a => {
                                                            const k = `${item.key}:${a}`;
                                                            return (
                                                                <td key={a} style={tdCheck}>
                                                                    <input type="checkbox" checked={perms.has(k)} onChange={() => togglePerm(k)} />
                                                                </td>
                                                            );
                                                        })}
                                                    </>
                                                ) : (
                                                    // workflow + report: single checkbox spanning whatever cols exist
                                                    <td style={tdCheck} colSpan={section.items.some(i => i.kind === 'document') ? 5 : 1}>
                                                        <input type="checkbox" checked={perms.has(item.key)} onChange={() => togglePerm(item.key)} />
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={emptyHint}>
                        Select a role on the left to configure its permissions.
                    </div>
                )}
            </div>
        </div>
    );
}

const panel = {
    width: 220, background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: 12, flexShrink: 0,
    position: 'sticky', top: 16, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
};
const roleItem = (active) => ({
    flex: 1,
    padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    background: active ? '#dbeafe' : 'transparent',
    color: active ? '#1d4ed8' : '#334155',
    fontWeight: active ? 600 : 400,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
});
const adminBadge = {
    fontSize: 10, background: '#fde68a', color: '#92400e', padding: '1px 6px', borderRadius: 8,
    fontWeight: 600, letterSpacing: '0.03em',
};
const linkBtn = {
    background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, padding: 0,
    display: 'inline-flex', alignItems: 'center', gap: 3,
};
const miniLink = {
    background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, padding: 0,
    textDecoration: 'underline', textTransform: 'lowercase',
};
const delBtn = {
    background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2,
};
const sectionBlock = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden',
};
const sectionHeader = {
    background: '#f1f5f9', padding: '8px 14px', fontSize: 11, fontWeight: 700,
    color: '#475569', letterSpacing: '0.05em',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const tableHeadRow = { background: '#fafafa' };
const tableRow = { borderTop: '1px solid #f1f5f9' };
const th = { padding: '6px 8px', fontSize: 11, color: '#64748b', textAlign: 'center', fontWeight: 600 };
const td = { padding: '8px 12px', fontSize: 13 };
const tdCheck = { padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' };
const emptyHint = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#94a3b8', fontSize: 14, padding: '60px 20px',
    background: '#fff', border: '1px dashed #e2e8f0', borderRadius: 8,
};
