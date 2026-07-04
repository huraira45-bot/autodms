/**
 * Paint Settings — compact tabbed layout (owner ask 2026-07-05).
 * Six tabs: UOM · Categories · Brands · Warehouses · Allowed JC Types
 * · System Accounts. Each tab is one compact list with inline add.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Plus, Trash2, AlertTriangle, CheckCircle2,
    Ruler, Palette, Tag, Warehouse, ClipboardCheck, KeyRound,
} from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';

const TABS = [
    { key: 'uom',        label: 'Paint UOM',       icon: Ruler },
    { key: 'cat',        label: 'Categories',      icon: Palette },
    { key: 'brand',      label: 'Brands',          icon: Tag },
    { key: 'wh',         label: 'Warehouses',      icon: Warehouse },
    { key: 'allowed',    label: 'Allowed JC Types', icon: ClipboardCheck },
    { key: 'accounts',   label: 'System Accounts', icon: KeyRound },
];

export default function PaintSettings() {
    const { notify, confirm } = useFeedback();
    const [tab, setTab] = useState('uom');
    const [uoms, setUOMs] = useState([]);
    const [cats, setCats] = useState([]);
    const [brands, setBrands] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [jobTypes, setJobTypes] = useState([]);
    const [allowed, setAllowed] = useState([]);
    const [setup, setSetup] = useState(null);

    const [uomName, setUomName]     = useState('');
    const [catName, setCatName]     = useState('');
    const [brandName, setBrandName] = useState('');
    const [whCode, setWhCode]       = useState('');
    const [whDesc, setWhDesc]       = useState('');

    const reload = async () => {
        try {
            const [u, c, b, w, jt, a, st] = await Promise.all([
                axios.get('/api/paint/uom'),
                axios.get('/api/paint/categories'),
                axios.get('/api/paint/brands'),
                axios.get('/api/paint/warehouses'),
                axios.get('/api/workshop/job-types'),
                axios.get('/api/paint/settings/business-types'),
                axios.get('/api/paint/settings/setup-status'),
            ]);
            setUOMs(u.data || []);
            setCats(c.data || []);
            setBrands(b.data || []);
            setWarehouses(w.data || []);
            setJobTypes(jt.data || []);
            setAllowed(a.data || []);
            setSetup(st.data || null);
        } catch (err) { console.error(err); }
    };
    useEffect(() => { reload(); }, []);

    const err = (title, e) => notify({ type: 'error', title, message: e.response?.data?.error || e.message });

    const addUOM   = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/uom', { UOMName: uomName }); setUomName(''); reload(); } catch (x) { err('Could not add UOM', x); } };
    const addCat   = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/categories', { CategoryName: catName }); setCatName(''); reload(); } catch (x) { err('Could not add category', x); } };
    const addBrand = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/brands', { BrandName: brandName }); setBrandName(''); reload(); } catch (x) { err('Could not add brand', x); } };
    const addWH    = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/warehouses', { WHCode: whCode, WHDesc: whDesc }); setWhCode(''); setWhDesc(''); reload(); } catch (x) { err('Could not add warehouse', x); } };

    const archive = async (kind, endpoint, id, label) => {
        const ok = await confirm({ title: `Archive ${kind}?`, message: `Remove "${label}" from active use.`, confirmLabel: 'Archive', tone: 'warning' });
        if (!ok) return;
        try { await axios.delete(`/api/paint/${endpoint}/${id}`); notify({ type: 'success', title: `${kind} archived` }); reload(); }
        catch (e) { err(`Could not archive ${kind}`, e); }
    };

    const toggleAllowed = async (jcTypeId) => {
        const nextIds = allowed.some(a => a.JobCardTypeId === jcTypeId)
            ? allowed.filter(a => a.JobCardTypeId !== jcTypeId).map(a => a.JobCardTypeId)
            : [...allowed.map(a => a.JobCardTypeId), jcTypeId];
        try { await axios.put('/api/paint/settings/business-types', { JobCardTypeIds: nextIds }); reload(); }
        catch (e) { err('Could not save allowed types', e); }
    };

    return (
        <div className="paint-page">
            <div className="paint-actionbar">
                <div className="title">
                    Paint Lab Settings
                    <span className="subtitle">Master lookups, allowed business types, GL system-account mapping</span>
                </div>
            </div>

            {/* Readiness banner (always visible) */}
            {setup && (
                <div className={`erp-alert ${setup.ready ? 'success' : 'warning'}`} style={{ padding: '6px 10px', fontSize: 12 }}>
                    {setup.ready
                        ? <><CheckCircle2 size={13} /> Paint Lab GL is fully configured — GRN and Issue can post.</>
                        : <><AlertTriangle size={13} /> PAINT_INVENTORY + PAINT_CONSUMPTION must be mapped in <a href="/accounting/setup">Accounting Setup</a> before GRN or JC finalize can post.</>}
                </div>
            )}

            <div className="paint-tabbar">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
                            onClick={() => setTab(t.key)}>
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === 'uom' && (
                <SimpleList
                    title="Paint UOM"
                    hint="Units the paint team uses in practice."
                    rows={uoms} rowKey="PaintUOMID"
                    label={r => r.UOMName}
                    adder={
                        <form onSubmit={addUOM} className="paint-line-entry" style={{ gridTemplateColumns: 'minmax(200px,1fr) auto' }}>
                            <input value={uomName} onChange={e => setUomName(e.target.value)} required placeholder="e.g. Litre" />
                            <button type="submit" className="btn btn-primary"><Plus size={12} /> Add</button>
                        </form>
                    }
                    onArchive={r => archive('UOM', 'uom', r.PaintUOMID, r.UOMName)}
                />
            )}

            {tab === 'cat' && (
                <SimpleList
                    title="Paint Categories"
                    hint="Group paints logically (base coat, primer, clear coat…)."
                    rows={cats} rowKey="PaintCategoryID"
                    label={r => r.CategoryName}
                    adder={
                        <form onSubmit={addCat} className="paint-line-entry" style={{ gridTemplateColumns: 'minmax(200px,1fr) auto' }}>
                            <input value={catName} onChange={e => setCatName(e.target.value)} required placeholder="e.g. Base Coat" />
                            <button type="submit" className="btn btn-primary"><Plus size={12} /> Add</button>
                        </form>
                    }
                    onArchive={r => archive('Category', 'categories', r.PaintCategoryID, r.CategoryName)}
                />
            )}

            {tab === 'brand' && (
                <SimpleList
                    title="Paint Brands"
                    hint="Manufacturer / supplier brand."
                    rows={brands} rowKey="PaintBrandID"
                    label={r => r.BrandName}
                    adder={
                        <form onSubmit={addBrand} className="paint-line-entry" style={{ gridTemplateColumns: 'minmax(200px,1fr) auto' }}>
                            <input value={brandName} onChange={e => setBrandName(e.target.value)} required placeholder="e.g. Sikkens" />
                            <button type="submit" className="btn btn-primary"><Plus size={12} /> Add</button>
                        </form>
                    }
                    onArchive={r => archive('Brand', 'brands', r.PaintBrandID, r.BrandName)}
                />
            )}

            {tab === 'wh' && (
                <SimpleList
                    title="Paint Warehouses"
                    hint="Physical stores where paint is held."
                    rows={warehouses} rowKey="PaintWHID"
                    label={r => `${r.WHDesc}${r.WHCode ? ` · ${r.WHCode}` : ''}`}
                    adder={
                        <form onSubmit={addWH} className="paint-line-entry" style={{ gridTemplateColumns: '140px minmax(180px,1fr) auto' }}>
                            <input value={whCode} onChange={e => setWhCode(e.target.value)} placeholder="Code (opt)" />
                            <input value={whDesc} onChange={e => setWhDesc(e.target.value)} required placeholder="Description *" />
                            <button type="submit" className="btn btn-primary"><Plus size={12} /> Add</button>
                        </form>
                    }
                    onArchive={r => archive('Warehouse', 'warehouses', r.PaintWHID, r.WHDesc)}
                />
            )}

            {tab === 'allowed' && (
                <div className="paint-card">
                    <div className="paint-card-title">Allowed Job Card Business Types (for Paint Issue)</div>
                    <div className="hint" style={{ marginBottom: 6 }}>
                        Paint Issue can only be booked against Job Cards of these business types.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
                        {jobTypes.map(jt => {
                            const on = allowed.some(a => a.JobCardTypeId === jt.JobCardTypeId);
                            return (
                                <label key={jt.JobCardTypeId} style={{
                                    display: 'flex', gap: 6, alignItems: 'center', padding: '5px 8px',
                                    border: `1px solid ${on ? 'var(--erp-brand)' : 'var(--erp-border)'}`,
                                    borderRadius: 4, background: on ? 'var(--erp-brand-soft)' : 'white',
                                    cursor: 'pointer', fontSize: 12,
                                }}>
                                    <input type="checkbox" checked={on} onChange={() => toggleAllowed(jt.JobCardTypeId)} />
                                    <strong style={{ minWidth: 40 }}>{jt.CardCode}</strong>
                                    <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jt.Title}</span>
                                </label>
                            );
                        })}
                        {jobTypes.length === 0 && <span className="hint" style={{ padding: 6 }}>No job card types configured.</span>}
                    </div>
                </div>
            )}

            {tab === 'accounts' && setup && (
                <div className="paint-card">
                    <div className="paint-card-title">Paint Lab System Accounts</div>
                    <div className="hint" style={{ marginBottom: 6 }}>
                        Map these roles under <a href="/accounting/setup">Accounting Setup</a> before any Paint GRN or JC that used paint can finalize.
                    </div>
                    <div className="paint-table-wrap short">
                        <table className="paint-table">
                            <thead><tr><th>Role</th><th>GL Code</th><th>GL Title</th></tr></thead>
                            <tbody>
                                {['PAINT_INVENTORY', 'PAINT_CONSUMPTION'].map(k => {
                                    const row = setup.systemAccounts.find(s => s.RoleKey === k);
                                    return (
                                        <tr key={k}>
                                            <td><strong>{k}</strong></td>
                                            <td className="mono">{row?.GLCode || '—'}</td>
                                            <td style={{ color: row ? 'var(--erp-text)' : 'var(--erp-red)' }}>
                                                {row?.GLTitle || 'NOT MAPPED — set under Accounting Setup'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function SimpleList({ title, hint, rows, rowKey, label, adder, onArchive }) {
    return (
        <div className="paint-card">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <div className="paint-card-title" style={{ marginBottom: 0, flex: 1 }}>{title}</div>
                <span className="hint">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
            </div>
            {hint && <div className="hint" style={{ marginBottom: 6 }}>{hint}</div>}
            {adder}
            <div className="paint-table-wrap short" style={{ marginTop: 6 }}>
                <table className="paint-table">
                    <tbody>
                        {rows.map(r => (
                            <tr key={r[rowKey]}>
                                <td>{label(r)}</td>
                                <td style={{ width: 30, textAlign: 'right' }}>
                                    {onArchive && (
                                        <button className="paint-icon-btn danger" onClick={() => onArchive(r)} title="Archive">
                                            <Trash2 size={11} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr><td colSpan={2} style={{ padding: 10, textAlign: 'center', color: '#94a3b8' }}>None yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
