/**
 * Sales — Incentive Policies admin.
 * Defines what staff earn per car. Decision #10: base = negotiated price.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { TrendingUp, Plus, RefreshCw, Loader2, Pencil, Trash2, Power } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

const TRIGGERS = ['AT_BOOKING_SAVE', 'AT_FULL_PAYMENT', 'AT_MASTER_INVOICE_POSTED', 'AT_DELIVERY'];
const BASE_TYPES = ['FlatPerCar', 'PercentOfNegotiatedPrice', 'TieredOnNegotiatedPrice'];
const LEVELS = ['SalesExecutive', 'AGMSales', 'GMSales', 'CustomChainOverride'];

export default function IncentivePoliciesAdmin() {
    const { hasModule } = useAuth();
    const canEdit = hasModule('sales_admin_settings');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeOnly, setActiveOnly] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/sales/incentive-policies`, { params: activeOnly ? { activeOnly: 1 } : {} });
            setRows(r.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [activeOnly]);
    useEffect(() => { load(); }, [load]);

    const toggleActive = async (p) => {
        try { await axios.put(`${API}/sales/incentive-policies/${p.PolicyID}`, { IsActive: !p.IsActive }); flash('ok', 'Updated'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };
    const remove = async (p) => {
        if (!window.confirm('Delete this policy? Only allowed if no accruals reference it.')) return;
        try { await axios.delete(`${API}/sales/incentive-policies/${p.PolicyID}`); flash('ok', 'Deleted'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Incentive Policies</h1>
                    <p className="page-subtitle">Per-hierarchy-level payout rules. Decision #8: accrue at booking save. Decision #10: base = negotiated price.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canEdit && <button className="btn" onClick={() => setShowCreate(true)}><Plus size={16} /> New Policy</button>}
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            </div>

            {msg && <FlashMsg msg={msg} />}

            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} /> Active only
                </label>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} policies</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <TrendingUp size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No policies yet. Create one to start accruing staff incentive on bookings.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Name</Th><Th>Trigger</Th><Th>Base</Th><Th>Hierarchy</Th>
                                <Th>Variant</Th>
                                <Th>Effective</Th><Th align="right">Assignments</Th>
                                <Th>Status</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(p => (
                                <tr key={p.PolicyID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td><strong>{p.Name}</strong></Td>
                                    <Td style={{ fontSize: '0.78rem', color: '#64748b' }}>{p.RecognitionTrigger}</Td>
                                    <Td>{p.BaseType === 'FlatPerCar' ? `PKR ${fmtN(p.BaseAmount)}/car` :
                                          p.BaseType === 'PercentOfNegotiatedPrice' ? `${p.BaseAmount}% of negotiated` :
                                          'Tiered'}</Td>
                                    <Td>{p.AppliesToHierarchyLevel}</Td>
                                    <Td style={{ fontSize: '0.78rem' }}>{p.VariantCode ? <strong style={{ color: '#1e40af' }}>{p.VariantCode}</strong> : <span style={{ color: '#94a3b8' }}>all</span>}</Td>
                                    <Td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                        {new Date(p.EffectiveFrom).toLocaleDateString()}{p.EffectiveTo ? ` → ${new Date(p.EffectiveTo).toLocaleDateString()}` : ''}
                                    </Td>
                                    <Td align="right">{p.ActiveAssignments}</Td>
                                    <Td>{p.IsActive ? <Pill bg="#dcfce7" col="#15803d">ACTIVE</Pill> : <Pill bg="#e2e8f0" col="#475569">inactive</Pill>}</Td>
                                    <Td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {canEdit && <button className="btn-icon" onClick={() => setEditItem(p)} title="Edit"><Pencil size={14} /></button>}
                                            {canEdit && <button className="btn-icon" onClick={() => toggleActive(p)} title={p.IsActive ? 'Deactivate' : 'Activate'} style={{ color: p.IsActive ? '#b45309' : '#15803d' }}><Power size={14} /></button>}
                                            {canEdit && <button className="btn-icon" onClick={() => remove(p)} title="Delete" style={{ color: '#b91c1c' }}><Trash2 size={14} /></button>}
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {(showCreate || editItem) && (
                <PolicyEditor item={editItem}
                    onClose={() => { setShowCreate(false); setEditItem(null); }}
                    onSaved={() => { setShowCreate(false); setEditItem(null); flash('ok', 'Saved'); load(); }} />
            )}
        </div>
    );
}

function PolicyEditor({ item, onClose, onSaved }) {
    const isNew = !item;
    const [name, setName] = useState(item?.Name || '');
    const [trigger, setTrigger] = useState(item?.RecognitionTrigger || 'AT_BOOKING_SAVE');
    const [baseType, setBaseType] = useState(item?.BaseType || 'FlatPerCar');
    const [baseAmount, setBaseAmount] = useState(item?.BaseAmount ?? '');
    const [level, setLevel] = useState(item?.AppliesToHierarchyLevel || 'SalesExecutive');
    const [variantId, setVariantId] = useState(item?.VariantID || '');
    const [variants, setVariants] = useState([]);
    const [ef, setEf] = useState(item?.EffectiveFrom ? new Date(item.EffectiveFrom).toISOString().slice(0,10) : new Date().toISOString().slice(0,10));
    const [et, setEt] = useState(item?.EffectiveTo ? new Date(item.EffectiveTo).toISOString().slice(0,10) : '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        (async () => {
            try { const r = await axios.get(`${API}/sales/variants`, { params: { activeOnly: 1 } }); setVariants(r.data); }
            catch {}
        })();
    }, []);

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            if (isNew) {
                await axios.post(`${API}/sales/incentive-policies`, {
                    Name: name, RecognitionTrigger: trigger, BaseType: baseType, BaseAmount: Number(baseAmount),
                    AppliesToHierarchyLevel: level, VariantID: variantId ? Number(variantId) : null,
                    EffectiveFrom: ef, EffectiveTo: et || null,
                });
            } else {
                await axios.put(`${API}/sales/incentive-policies/${item.PolicyID}`, {
                    Name: name, BaseAmount: Number(baseAmount), EffectiveTo: et || null,
                });
            }
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={isNew ? 'New Incentive Policy' : `Edit Policy #${item.PolicyID}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <Field label="Policy Name *"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Executive Standard 2026" style={inputStyle} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Trigger" flex>
                    <select value={trigger} onChange={e => setTrigger(e.target.value)} disabled={!isNew} style={inputStyle}>
                        {TRIGGERS.map(t => <option key={t}>{t}</option>)}
                    </select>
                </Field>
                <Field label="Applies to level" flex>
                    <select value={level} onChange={e => setLevel(e.target.value)} disabled={!isNew} style={inputStyle}>
                        {LEVELS.map(l => <option key={l}>{l}</option>)}
                    </select>
                </Field>
            </div>
            <Field label="Base Type">
                <select value={baseType} onChange={e => setBaseType(e.target.value)} disabled={!isNew} style={inputStyle}>
                    {BASE_TYPES.map(b => <option key={b}>{b}</option>)}
                </select>
            </Field>
            <Field label="Applies to Variant (optional — leave blank for all variants)">
                <select value={variantId} onChange={e => setVariantId(e.target.value)} disabled={!isNew} style={inputStyle}>
                    <option value="">— All variants (global default) —</option>
                    {variants.map(v => <option key={v.VariantID} value={v.VariantID}>{v.VariantCode} — {v.VariantName}</option>)}
                </select>
            </Field>
            <div style={{ padding: 6, fontSize: '0.7rem', color: '#94a3b8' }}>
                Tip: per-variant policies take precedence over global ones for the same employee. Use this when one variant should pay a different rate than the rest.
            </div>
            <Field label={baseType === 'PercentOfNegotiatedPrice' ? 'Percent (e.g. 0.5)' : baseType === 'FlatPerCar' ? 'Amount per car (PKR)' : 'Default amount (tiers config in v2)'}>
                <input type="number" step="0.0001" value={baseAmount} onChange={e => setBaseAmount(e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Effective from *" flex><input type="date" value={ef} onChange={e => setEf(e.target.value)} disabled={!isNew} style={inputStyle} /></Field>
                <Field label="Effective to (optional)" flex><input type="date" value={et} onChange={e => setEt(e.target.value)} style={inputStyle} /></Field>
            </div>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel={isNew ? 'Create' : 'Save'} busy={busy} disabled={!name || baseAmount === ''} />
        </Shell>
    );
}
