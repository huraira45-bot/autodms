/**
 * Sales — Vehicle Models admin (CRUD).
 * Per locked decision #1: Models are the top of Model → Variant → Vehicle hierarchy.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Car, Plus, RefreshCw, Loader2, Search, Pencil, Trash2, Power, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API = '/api';

export default function VehicleModelsAdmin() {
    const { hasModule } = useAuth();
    const canEdit = hasModule('sales_admin_settings');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [activeOnly, setActiveOnly] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (activeOnly) params.activeOnly = 1;
            if (search) params.search = search;
            const r = await axios.get(`${API}/sales/models`, { params });
            setRows(r.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [activeOnly, search]);
    useEffect(() => { load(); }, [load]);

    const toggleActive = async (m) => {
        try { await axios.put(`${API}/sales/models/${m.ModelID}`, { IsActive: !m.IsActive }); flash('ok', m.IsActive ? 'Deactivated' : 'Activated'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };
    const remove = async (m) => {
        if (!window.confirm(`Delete model "${m.ModelName}"? Only allowed if no variants exist.`)) return;
        try { await axios.delete(`${API}/sales/models/${m.ModelID}`); flash('ok', 'Deleted'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Vehicle Models</h1>
                    <p className="page-subtitle">Top-level model catalog. Variants are added per Model from the Variants page.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canEdit && <button className="btn" onClick={() => setShowCreate(true)}><Plus size={16} /> New Model</button>}
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            </div>

            {msg && <FlashMsg msg={msg} />}

            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, height: 38, minWidth: 240 }}>
                    <Search size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code / name / brand…" style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} /> Active only
                </label>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} models</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <Car size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No models. Click + New Model to start.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Code</Th><Th>Brand</Th><Th>Name</Th>
                                <Th align="right">Active Variants</Th><Th>Status</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.ModelID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td mono color="#475569">{r.ModelCode}</Td>
                                    <Td>{r.BrandName}</Td>
                                    <Td><strong>{r.ModelName}</strong></Td>
                                    <Td align="right">{r.ActiveVariantCount}</Td>
                                    <Td>{r.IsActive ? <Pill bg="#dcfce7" col="#15803d">ACTIVE</Pill> : <Pill bg="#e2e8f0" col="#475569">inactive</Pill>}</Td>
                                    <Td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {canEdit && <button className="btn-icon" onClick={() => setEditItem(r)} title="Edit"><Pencil size={14} /></button>}
                                            {canEdit && <button className="btn-icon" onClick={() => toggleActive(r)} title={r.IsActive ? 'Deactivate' : 'Activate'} style={{ color: r.IsActive ? '#b45309' : '#15803d' }}><Power size={14} /></button>}
                                            {canEdit && <button className="btn-icon" onClick={() => remove(r)} title="Delete" style={{ color: '#b91c1c' }}><Trash2 size={14} /></button>}
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {(showCreate || editItem) && (
                <ModelEditor item={editItem}
                    onClose={() => { setShowCreate(false); setEditItem(null); }}
                    onSaved={() => { setShowCreate(false); setEditItem(null); flash('ok', 'Saved'); load(); }} />
            )}
        </div>
    );
}

function ModelEditor({ item, onClose, onSaved }) {
    const isNew = !item;
    const [code, setCode] = useState(item?.ModelCode || '');
    const [name, setName] = useState(item?.ModelName || '');
    const [brand, setBrand] = useState(item?.BrandName || 'Changan');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            if (isNew) await axios.post(`${API}/sales/models`, { ModelCode: code, ModelName: name, BrandName: brand });
            else await axios.put(`${API}/sales/models/${item.ModelID}`, { ModelName: name, BrandName: brand });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={isNew ? 'New Vehicle Model' : `Edit Model #${item.ModelID}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <Field label="Model Code *"><input value={code} onChange={e => setCode(e.target.value)} disabled={!isNew} placeholder="e.g. CT, KR, GR, BP, WR" style={inputStyle} /></Field>
            <Field label="Model Name *"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Changan Alsvin" style={inputStyle} /></Field>
            <Field label="Brand"><input value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle} /></Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel={isNew ? 'Create' : 'Save'} busy={busy} disabled={!code || !name} />
        </Shell>
    );
}

// shared UI helpers (re-used by all sales admin pages)
export const inputStyle = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' };
export function Field({ label, children, flex }) {
    return <div style={{ marginBottom: 10, flex: flex ? 1 : undefined }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#475569' }}>{label}</label>
        {children}
    </div>;
}
export function Err({ children }) { return <div style={{ padding: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 10, fontSize: '0.85rem' }}>{children}</div>; }
export function Actions({ onCancel, onConfirm, confirmLabel, busy, disabled }) {
    return <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={onConfirm} disabled={busy || disabled}
            style={{ padding: '8px 16px', background: disabled ? '#cbd5e1' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.875rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : null} {confirmLabel}
        </button>
    </div>;
}
export function Shell({ title, onClose, children, width = 480 }) {
    return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
        <div style={{ background: 'white', borderRadius: 10, width, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700 }}>{title}</div>
                <button onClick={onClose} className="btn-icon"><XCircle size={18} /></button>
            </div>
            <div style={{ padding: 18 }}>{children}</div>
        </div>
    </div>;
}
export function FlashMsg({ msg }) {
    return <div style={{ padding: 10, borderRadius: 8, fontSize: '0.875rem',
        background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
        color:      msg.kind === 'ok' ? '#15803d' : '#b91c1c',
        border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca') }}>{msg.text}</div>;
}
export function Pill({ bg, col, children }) {
    return <span style={{ background: bg, color: col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>{children}</span>;
}
export const Th = ({ children, align = 'left' }) => <th style={{ padding: 10, textAlign: align, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{children}</th>;
export const Td = ({ children, align = 'left', mono, color, style = {} }) => <td style={{ padding: '10px 12px', textAlign: align, fontFamily: mono ? 'monospace' : undefined, color, ...style }}>{children}</td>;
