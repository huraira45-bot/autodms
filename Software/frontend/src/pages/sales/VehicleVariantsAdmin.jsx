/**
 * Sales — Vehicle Variants admin.
 *
 * Per decision #1: each Variant has its own standard price, wholesale price,
 * standard Master incentive, and tax treatment (decision #26).
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Layers, Plus, RefreshCw, Loader2, Search, Pencil, Trash2, Power } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';
const TAX_TREATMENTS = ['NoTax', 'WHTWithheld', 'PlusGST_PrepayRequired', 'PlusGST_DeferredPay'];

const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

export default function VehicleVariantsAdmin() {
    const { hasModule } = useAuth();
    const canEdit = hasModule('sales_admin_settings');
    const [rows, setRows] = useState([]);
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modelFilter, setModelFilter] = useState('');
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
            if (modelFilter) params.modelId = modelFilter;
            if (activeOnly) params.activeOnly = 1;
            if (search) params.search = search;
            const [vr, mr] = await Promise.all([
                axios.get(`${API}/sales/variants`, { params }),
                axios.get(`${API}/sales/models`, { params: { activeOnly: 1 } }),
            ]);
            setRows(vr.data);
            setModels(mr.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [modelFilter, search, activeOnly]);
    useEffect(() => { load(); }, [load]);

    const toggleActive = async (v) => {
        try { await axios.put(`${API}/sales/variants/${v.VariantID}`, { IsActive: !v.IsActive }); flash('ok', 'Updated'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };
    const remove = async (v) => {
        if (!window.confirm(`Delete variant "${v.VariantName}"? Only allowed if no vehicles exist.`)) return;
        try { await axios.delete(`${API}/sales/variants/${v.VariantID}`); flash('ok', 'Deleted'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Vehicle Variants</h1>
                    <p className="page-subtitle">Trims and pricing per model. Standard Master incentive + tax treatment set here.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canEdit && <button className="btn" onClick={() => setShowCreate(true)}><Plus size={16} /> New Variant</button>}
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            </div>

            {msg && <FlashMsg msg={msg} />}

            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, height: 38, minWidth: 240 }}>
                    <Search size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code / name…" style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={modelFilter} onChange={e => setModelFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All models</option>
                    {models.map(m => <option key={m.ModelID} value={m.ModelID}>{m.ModelCode} — {m.ModelName}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} /> Active only
                </label>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} variants</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <Layers size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No variants. Create a model first.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Code</Th><Th>Variant</Th><Th>Model</Th>
                                <Th align="right">Std Price</Th><Th align="right">Wholesale</Th>
                                <Th align="right">Std Incentive</Th><Th>Tax</Th>
                                <Th align="right">Vehicles</Th><Th>Status</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(v => (
                                <tr key={v.VariantID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td mono color="#475569">{v.VariantCode}</Td>
                                    <Td><strong>{v.VariantName}</strong></Td>
                                    <Td style={{ fontSize: '0.78rem', color: '#64748b' }}>{v.ModelCode} · {v.BrandName}</Td>
                                    <Td align="right">{fmtN(v.StandardPrice)}</Td>
                                    <Td align="right" style={{ color: '#64748b' }}>{fmtN(v.WholesalePrice)}</Td>
                                    <Td align="right" style={{ color: '#15803d', fontWeight: 600 }}>{fmtN(v.StandardIncentiveAmount)}</Td>
                                    <Td><span style={{ fontSize: '0.72rem', color: v.StandardIncentiveTaxTreatment === 'NoTax' ? '#94a3b8' : '#b45309' }}>{v.StandardIncentiveTaxTreatment}</span></Td>
                                    <Td align="right">{v.VehicleCount}</Td>
                                    <Td>{v.IsActive ? <Pill bg="#dcfce7" col="#15803d">ACTIVE</Pill> : <Pill bg="#e2e8f0" col="#475569">inactive</Pill>}</Td>
                                    <Td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {canEdit && <button className="btn-icon" onClick={() => setEditItem(v)} title="Edit"><Pencil size={14} /></button>}
                                            {canEdit && <button className="btn-icon" onClick={() => toggleActive(v)} title={v.IsActive ? 'Deactivate' : 'Activate'} style={{ color: v.IsActive ? '#b45309' : '#15803d' }}><Power size={14} /></button>}
                                            {canEdit && <button className="btn-icon" onClick={() => remove(v)} title="Delete" style={{ color: '#b91c1c' }}><Trash2 size={14} /></button>}
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {(showCreate || editItem) && (
                <VariantEditor item={editItem} models={models}
                    onClose={() => { setShowCreate(false); setEditItem(null); }}
                    onSaved={() => { setShowCreate(false); setEditItem(null); flash('ok', 'Saved'); load(); }} />
            )}
        </div>
    );
}

function VariantEditor({ item, models, onClose, onSaved }) {
    const isNew = !item;
    const [modelId, setModelId] = useState(item?.ModelID || '');
    const [code, setCode] = useState(item?.VariantCode || '');
    const [name, setName] = useState(item?.VariantName || '');
    const [sp, setSp] = useState(item?.StandardPrice || '');
    const [wp, setWp] = useState(item?.WholesalePrice || '');
    const [si, setSi] = useState(item?.StandardIncentiveAmount || 0);
    const [tt, setTt] = useState(item?.StandardIncentiveTaxTreatment || 'NoTax');
    const [minBook, setMinBook] = useState(item?.MinimumBookingAmount || 0);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            const body = {
                ModelID: Number(modelId), VariantCode: code, VariantName: name,
                StandardPrice: Number(sp), WholesalePrice: Number(wp),
                MinimumBookingAmount: Number(minBook) || 0,
                StandardIncentiveAmount: Number(si), StandardIncentiveTaxTreatment: tt,
            };
            if (isNew) await axios.post(`${API}/sales/variants`, body);
            else await axios.put(`${API}/sales/variants/${item.VariantID}`, body);
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const ready = modelId && code && name && sp >= 0 && wp >= 0;

    return (
        <Shell title={isNew ? 'New Variant' : `Edit Variant #${item.VariantID}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <Field label="Model *">
                <select value={modelId} onChange={e => setModelId(e.target.value)} disabled={!isNew} style={inputStyle}>
                    <option value="">— Pick model —</option>
                    {models.map(m => <option key={m.ModelID} value={m.ModelID}>{m.ModelCode} — {m.ModelName}</option>)}
                </select>
            </Field>
            <Field label="Variant Code *"><input value={code} onChange={e => setCode(e.target.value)} disabled={!isNew} placeholder="e.g. CT-1.5-LUX" style={inputStyle} /></Field>
            <Field label="Variant Name *"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alsvin 1.5L Luxury Auto" style={inputStyle} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Standard Price (PKR) *" flex><input type="number" value={sp} onChange={e => setSp(e.target.value)} style={inputStyle} /></Field>
                <Field label="Wholesale Price (PKR) *" flex><input type="number" value={wp} onChange={e => setWp(e.target.value)} style={inputStyle} /></Field>
            </div>
            <Field label="Minimum Booking Amount (PKR) — required before booking can advance from PendingBookingPayment">
                <input type="number" value={minBook} onChange={e => setMinBook(e.target.value)} placeholder="0 = no minimum required" style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Standard Master Incentive (PKR)" flex><input type="number" value={si} onChange={e => setSi(e.target.value)} style={inputStyle} /></Field>
                <Field label="Tax Treatment" flex>
                    <select value={tt} onChange={e => setTt(e.target.value)} style={inputStyle}>
                        {TAX_TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Field>
            </div>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel={isNew ? 'Create' : 'Save'} busy={busy} disabled={!ready} />
        </Shell>
    );
}
