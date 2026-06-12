/**
 * Sales — Vehicle Inventory admin (per-VIN list).
 *
 * Receive (status flip): sales_master_settlement.
 * Allocate (link to a booking): handled from a separate "Allocation" page in Phase 3.
 *
 * Open-allocation vehicles auto-create their memo ledger row at creation time.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Truck, Plus, RefreshCw, Loader2, Search, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';

const STATUS_STYLES = {
    AtMaster:  { bg: '#e2e8f0', col: '#475569' },
    InTransit: { bg: '#dbeafe', col: '#1e40af' },
    AtDealer:  { bg: '#fef3c7', col: '#92400e' },
    Allocated: { bg: '#fed7aa', col: '#9a3412' },
    Delivered: { bg: '#dcfce7', col: '#15803d' },
    Sold:      { bg: '#dcfce7', col: '#15803d' },
    Returned:  { bg: '#fee2e2', col: '#b91c1c' },
};

const STATUSES = ['AtMaster', 'InTransit', 'AtDealer', 'Allocated', 'Delivered', 'Returned', 'Sold'];

export default function VehicleInventoryAdmin() {
    const { hasModule } = useAuth();
    const canCreate = hasModule('sales_admin_settings') || hasModule('sales_master_settlement');
    const canUpdate = canCreate;
    const canDelete = hasModule('sales_admin_settings');

    const [rows, setRows] = useState([]);
    const [variants, setVariants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [allocFilter, setAllocFilter] = useState('');
    const [variantFilter, setVariantFilter] = useState('');
    const [search, setSearch] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (allocFilter) params.allocationType = allocFilter;
            if (variantFilter) params.variantId = variantFilter;
            if (search) params.search = search;
            const [vr, varr] = await Promise.all([
                axios.get(`${API}/sales/vehicles`, { params }),
                axios.get(`${API}/sales/variants`, { params: { activeOnly: 1 } }),
            ]);
            setRows(vr.data);
            setVariants(varr.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [statusFilter, allocFilter, variantFilter, search]);
    useEffect(() => { load(); }, [load]);

    const remove = async (v) => {
        if (!window.confirm(`Delete chassis ${v.ChasisNo}? Only allowed if not linked to a booking.`)) return;
        try { await axios.delete(`${API}/sales/vehicles/${v.VehicleID}`); flash('ok', 'Deleted'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Vehicle Inventory</h1>
                    <p className="page-subtitle">Per-chassis records. Booked vehicles go on the balance sheet; Open-Allocation are memo-only until sold.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canCreate && <button className="btn" onClick={() => setShowCreate(true)}><Plus size={16} /> Receive Chassis</button>}
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            </div>

            {msg && <FlashMsg msg={msg} />}

            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, height: 38, minWidth: 220 }}>
                    <Search size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chassis / engine / color…" style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All statuses</option>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={allocFilter} onChange={e => setAllocFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All allocation types</option>
                    <option value="Booked">Booked</option>
                    <option value="OpenAllocation">Open Allocation</option>
                </select>
                <select value={variantFilter} onChange={e => setVariantFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All variants</option>
                    {variants.map(v => <option key={v.VariantID} value={v.VariantID}>{v.VariantCode}</option>)}
                </select>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} vehicles</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <Truck size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No vehicles match.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Chassis</Th><Th>Engine</Th><Th>Variant</Th><Th>Color</Th>
                                <Th>Allocation</Th><Th>Status</Th><Th>Booking</Th>
                                <Th>Location</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(v => {
                                const st = STATUS_STYLES[v.Status] || STATUS_STYLES.AtMaster;
                                return (
                                    <tr key={v.VehicleID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td mono color="#475569">{v.ChasisNo}</Td>
                                        <Td mono color="#64748b">{v.EngineNo}</Td>
                                        <Td><strong>{v.VariantCode}</strong><div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{v.VariantName}</div></Td>
                                        <Td>{v.Color || '—'}</Td>
                                        <Td><Pill bg={v.AllocationType === 'OpenAllocation' ? '#fef3c7' : '#dbeafe'} col={v.AllocationType === 'OpenAllocation' ? '#92400e' : '#1e40af'}>{v.AllocationType === 'OpenAllocation' ? 'OPEN' : 'BOOKED'}</Pill></Td>
                                        <Td><Pill bg={st.bg} col={st.col}>{v.Status}</Pill></Td>
                                        <Td mono color="#1e40af">{v.CurrentBookingNo || '—'}</Td>
                                        <Td style={{ fontSize: '0.78rem' }}>{v.Location || '—'}</Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {canUpdate && <button className="btn-icon" onClick={() => setEditItem(v)} title="Edit"><Pencil size={14} /></button>}
                                                {canDelete && <button className="btn-icon" onClick={() => remove(v)} title="Delete" style={{ color: '#b91c1c' }}><Trash2 size={14} /></button>}
                                            </div>
                                        </Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {(showCreate || editItem) && (
                <VehicleEditor item={editItem} variants={variants}
                    onClose={() => { setShowCreate(false); setEditItem(null); }}
                    onSaved={() => { setShowCreate(false); setEditItem(null); flash('ok', 'Saved'); load(); }} />
            )}
        </div>
    );
}

function VehicleEditor({ item, variants, onClose, onSaved }) {
    const isNew = !item;
    const [variantId, setVariantId] = useState(item?.VariantID || '');
    const [chasis, setChasis] = useState(item?.ChasisNo || '');
    const [engine, setEngine] = useState(item?.EngineNo || '');
    const [color, setColor] = useState(item?.Color || '');
    const [year, setYear] = useState(item?.ManufactureYear || new Date().getFullYear());
    const [allocType, setAllocType] = useState(item?.AllocationType || 'Booked');
    const [status, setStatus] = useState(item?.Status || 'AtMaster');
    const [location, setLocation] = useState(item?.Location || '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            if (isNew) {
                await axios.post(`${API}/sales/vehicles`, {
                    VariantID: Number(variantId), ChasisNo: chasis, EngineNo: engine,
                    Color: color || undefined, ManufactureYear: Number(year) || undefined,
                    AllocationType: allocType, Status: status, Location: location || undefined,
                });
            } else {
                await axios.put(`${API}/sales/vehicles/${item.VehicleID}`, {
                    Color: color || null, ManufactureYear: Number(year) || null,
                    Status: status, Location: location || null,
                });
            }
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const ready = variantId && chasis && engine;

    return (
        <Shell title={isNew ? 'Receive Chassis' : `Edit Vehicle #${item.VehicleID}`} onClose={onClose} width={560}>
            {err && <Err>{err}</Err>}
            <Field label="Variant *">
                <select value={variantId} onChange={e => setVariantId(e.target.value)} disabled={!isNew} style={inputStyle}>
                    <option value="">— Pick variant —</option>
                    {variants.map(v => <option key={v.VariantID} value={v.VariantID}>{v.VariantCode} — {v.VariantName}</option>)}
                </select>
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Chassis Number *" flex><input value={chasis} onChange={e => setChasis(e.target.value)} disabled={!isNew} style={{ ...inputStyle, fontFamily: 'monospace' }} /></Field>
                <Field label="Engine Number *" flex><input value={engine} onChange={e => setEngine(e.target.value)} disabled={!isNew} style={{ ...inputStyle, fontFamily: 'monospace' }} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Color" flex><input value={color} onChange={e => setColor(e.target.value)} placeholder="Pearl White" style={inputStyle} /></Field>
                <Field label="Manufacture Year" flex><input type="number" value={year} onChange={e => setYear(e.target.value)} style={inputStyle} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Allocation Type *" flex>
                    <select value={allocType} onChange={e => setAllocType(e.target.value)} disabled={!isNew} style={inputStyle}>
                        <option value="Booked">Booked (ours — paid to Master)</option>
                        <option value="OpenAllocation">Open Allocation (Master's — memo-only)</option>
                    </select>
                </Field>
                <Field label="Status *" flex>
                    <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </Field>
            </div>
            <Field label="Location"><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Showroom, yard, etc." style={inputStyle} /></Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel={isNew ? 'Receive' : 'Save'} busy={busy} disabled={!ready} />
        </Shell>
    );
}
