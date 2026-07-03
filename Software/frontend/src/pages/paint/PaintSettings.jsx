/**
 * Paint Settings — master configuration for Paint Lab.
 * - UOM, Categories, Brands, Warehouses (thin lists with add/archive)
 * - Allowed Job Card Business Types (drives what JCs can receive paint)
 * - System-account status (Paint Inventory / Paint Consumption)
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { ErpControlPanel, ErpPanel } from '../../components/erp';

export default function PaintSettings() {
    const { notify, confirm } = useFeedback();
    const [uoms, setUOMs] = useState([]);
    const [cats, setCats] = useState([]);
    const [brands, setBrands] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [jobTypes, setJobTypes] = useState([]);
    const [allowed, setAllowed] = useState([]);
    const [setup, setSetup] = useState(null);
    const [uomName, setUomName] = useState('');
    const [catName, setCatName] = useState('');
    const [brandName, setBrandName] = useState('');
    const [whCode, setWhCode] = useState('');
    const [whDesc, setWhDesc] = useState('');

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

    const addUOM = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/uom', { UOMName: uomName }); setUomName(''); reload(); } catch(x){ err('Could not add UOM', x); } };
    const addCat = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/categories', { CategoryName: catName }); setCatName(''); reload(); } catch(x){ err('Could not add category', x); } };
    const addBrand = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/brands', { BrandName: brandName }); setBrandName(''); reload(); } catch(x){ err('Could not add brand', x); } };
    const addWH = async (e) => { e.preventDefault(); try { await axios.post('/api/paint/warehouses', { WHCode: whCode, WHDesc: whDesc }); setWhCode(''); setWhDesc(''); reload(); } catch(x){ err('Could not add warehouse', x); } };

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel title="Paint Lab Settings"
                subtitle="Master lookups (UOM, categories, brands, warehouses), allowed Job Card business types for Paint Issue, and Paint Lab system-account mapping." />

            {/* Setup readiness banner */}
            {setup && (
                <div className={`erp-alert ${setup.ready ? 'success' : 'warning'}`}>
                    {setup.ready
                        ? <><CheckCircle2 size={14} /> Paint Lab GL is fully configured — GRN and Issue can post.</>
                        : <><AlertTriangle size={14} /> Paint Inventory and Paint Consumption accounts must be mapped in <a href="/accounting/setup" style={{ color: 'inherit' }}>Accounting Setup</a> before GRN/Issue can post.</>}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
                <MasterCard title="Paint UOM" adder={
                    <form onSubmit={addUOM} style={{ display: 'flex', gap: 6 }}>
                        <input placeholder="e.g. Litre" value={uomName} onChange={e => setUomName(e.target.value)} required style={{ flex: 1 }} />
                        <button className="btn" type="submit" style={{ padding: 6 }}><Plus size={14} /></button>
                    </form>
                } rows={uoms} rowKey="PaintUOMID" label={r => r.UOMName}
                   onArchive={r => archive('UOM', 'uom', r.PaintUOMID, r.UOMName)} />

                <MasterCard title="Paint Categories" adder={
                    <form onSubmit={addCat} style={{ display: 'flex', gap: 6 }}>
                        <input placeholder="e.g. Base Coat" value={catName} onChange={e => setCatName(e.target.value)} required style={{ flex: 1 }} />
                        <button className="btn" type="submit" style={{ padding: 6 }}><Plus size={14} /></button>
                    </form>
                } rows={cats} rowKey="PaintCategoryID" label={r => r.CategoryName}
                   onArchive={r => archive('Category', 'categories', r.PaintCategoryID, r.CategoryName)} />

                <MasterCard title="Paint Brands" adder={
                    <form onSubmit={addBrand} style={{ display: 'flex', gap: 6 }}>
                        <input placeholder="e.g. Sikkens" value={brandName} onChange={e => setBrandName(e.target.value)} required style={{ flex: 1 }} />
                        <button className="btn" type="submit" style={{ padding: 6 }}><Plus size={14} /></button>
                    </form>
                } rows={brands} rowKey="PaintBrandID" label={r => r.BrandName}
                   onArchive={r => archive('Brand', 'brands', r.PaintBrandID, r.BrandName)} />

                <MasterCard title="Paint Warehouses" adder={
                    <form onSubmit={addWH} style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                        <input placeholder="Code (e.g. PAINT-02)" value={whCode} onChange={e => setWhCode(e.target.value)} />
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input placeholder="Description *" value={whDesc} onChange={e => setWhDesc(e.target.value)} required style={{ flex: 1 }} />
                            <button className="btn" type="submit" style={{ padding: 6 }}><Plus size={14} /></button>
                        </div>
                    </form>
                } rows={warehouses} rowKey="PaintWHID" label={r => `${r.WHDesc}${r.WHCode ? ` · ${r.WHCode}` : ''}`}
                   onArchive={r => archive('Warehouse', 'warehouses', r.PaintWHID, r.WHDesc)} />
            </div>

            <ErpPanel title="Allowed Job Card Business Types (for Paint Issue)">
                <div style={{ fontSize: 12, color: 'var(--erp-text-muted)', marginBottom: 8 }}>
                    Paint Issue can only be booked against Job Cards of these business types. Default seed is B&P + CT; adjust to match your workshop policy.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                    {jobTypes.map(jt => {
                        const on = allowed.some(a => a.JobCardTypeId === jt.JobCardTypeId);
                        return (
                            <label key={jt.JobCardTypeId} style={{
                                display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px',
                                border: `1px solid ${on ? 'var(--erp-brand)' : 'var(--erp-border)'}`,
                                borderRadius: 6, background: on ? 'var(--erp-brand-soft)' : 'white',
                                cursor: 'pointer', fontSize: 13,
                            }}>
                                <input type="checkbox" checked={on} onChange={() => toggleAllowed(jt.JobCardTypeId)} />
                                <strong>{jt.CardCode}</strong> <span style={{ color: 'var(--erp-text-muted)' }}>{jt.Title}</span>
                            </label>
                        );
                    })}
                </div>
            </ErpPanel>

            {setup && (
                <ErpPanel title="Paint Lab System Accounts">
                    <div style={{ fontSize: 12, color: 'var(--erp-text-muted)', marginBottom: 8 }}>
                        Map these system roles under <a href="/accounting/setup">Accounting Setup</a> before finalising any Paint GRN or Job Card that consumed paint.
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ background: '#f8fafc' }}><th style={th}>Role</th><th style={th}>GL Code</th><th style={th}>GL Title</th></tr></thead>
                        <tbody>
                            {['PAINT_INVENTORY', 'PAINT_CONSUMPTION'].map(k => {
                                const row = setup.systemAccounts.find(s => s.RoleKey === k);
                                return (
                                    <tr key={k} style={{ borderTop: '1px solid #e2e8f0' }}>
                                        <td style={td}><strong>{k}</strong></td>
                                        <td style={td}><code>{row?.GLCode || '—'}</code></td>
                                        <td style={{ ...td, color: row ? 'var(--erp-text)' : 'var(--erp-red)' }}>
                                            {row?.GLTitle || 'NOT MAPPED — set under Accounting Setup'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </ErpPanel>
            )}
        </div>
    );
}

function MasterCard({ title, adder, rows, rowKey, label, onArchive }) {
    return (
        <div className="erp-panel">
            <div className="erp-panel-title">{title} <span className="count">{rows.length}</span></div>
            {adder}
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                {rows.map(r => (
                    <li key={r[rowKey]} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 4px', borderBottom: '1px solid var(--erp-border)', fontSize: 13 }}>
                        <span style={{ flex: 1 }}>{label(r)}</span>
                        {onArchive && (
                            <button type="button" onClick={() => onArchive(r)} title="Archive"
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                <Trash2 size={13} />
                            </button>
                        )}
                    </li>
                ))}
                {rows.length === 0 && (
                    <li style={{ padding: 8, fontSize: 12, color: 'var(--erp-text-muted)' }}>None yet.</li>
                )}
            </ul>
        </div>
    );
}

const th = { padding: 6, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#64748b' };
const td = { padding: 6, fontSize: 13 };
