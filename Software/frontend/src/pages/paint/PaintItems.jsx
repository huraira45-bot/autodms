/**
 * Paint Items master — compact list + right-side edit panel.
 * Stock qty / avg cost / stock value are read-only backend values.
 * Owner ask 2026-07-05: fit desktop 1366×768 without page overflow.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Plus, Save, X, Search, Loader2 } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import SearchableSelect from '../../components/SearchableSelect';

const emptyForm = {
    PaintCode: '', PaintName: '',
    PaintCategoryID: '', PaintBrandID: '', PaintUOMID: '',
    ReorderLevel: '', GSTDefaultOn: true, IsActive: true,
};

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaintItems() {
    const { notify } = useFeedback();
    const [items, setItems]   = useState([]);
    const [cats, setCats]     = useState([]);
    const [brands, setBrands] = useState([]);
    const [uoms, setUOMs]     = useState([]);
    const [search, setSearch] = useState('');
    const [openForm, setOpenForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [busy, setBusy] = useState(false);

    const fetchAll = async () => {
        try {
            const [r1, r2, r3, r4] = await Promise.all([
                axios.get('/api/paint/items'),
                axios.get('/api/paint/categories'),
                axios.get('/api/paint/brands'),
                axios.get('/api/paint/uom'),
            ]);
            setItems(r1.data || []);
            setCats(r2.data || []);
            setBrands(r3.data || []);
            setUOMs(r4.data || []);
        } catch (err) { console.error(err); }
    };
    useEffect(() => { fetchAll(); }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(i =>
            (i.PaintCode || '').toLowerCase().includes(q) ||
            (i.PaintName || '').toLowerCase().includes(q)
        );
    }, [items, search]);

    const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpenForm(true); };
    const openEdit   = (row) => {
        setEditingId(row.PaintItemID);
        setForm({
            PaintCode:       row.PaintCode || '',
            PaintName:       row.PaintName || '',
            PaintCategoryID: row.PaintCategoryID || '',
            PaintBrandID:    row.PaintBrandID || '',
            PaintUOMID:      row.PaintUOMID || '',
            ReorderLevel:    row.ReorderLevel ?? '',
            GSTDefaultOn:    row.GSTDefaultOn !== 0 && row.GSTDefaultOn !== false,
            IsActive:        row.IsActive !== 0 && row.IsActive !== false,
        });
        setOpenForm(true);
    };
    const closeForm = () => { setOpenForm(false); setEditingId(null); setForm(emptyForm); };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            if (editingId) {
                await axios.put(`/api/paint/items/${editingId}`, form);
                notify({ type: 'success', title: 'Paint item updated', message: form.PaintName });
            } else {
                await axios.post('/api/paint/items', form);
                notify({ type: 'success', title: 'Paint item added', message: form.PaintName });
            }
            closeForm();
            fetchAll();
        } catch (err) {
            notify({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
        }
        setBusy(false);
    };

    return (
        <div className="paint-page">
            <div className="paint-actionbar">
                <div className="title">
                    Paint Items
                    <span className="subtitle">Codes, brands, UOM. Stock moves only via GRN / GRTN / Issue.</span>
                </div>
                <div className="actions">
                    <div className="erp-search-input" style={{ height: 28, minWidth: 220 }}>
                        <Search size={12} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name…" />
                        {search && <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                    </div>
                    <button className="btn btn-primary" onClick={openCreate}><Plus size={13} /> New</button>
                </div>
            </div>

            <div className={openForm ? 'paint-split' : 'paint-split no-form'}>
                <div className="paint-pane" style={{ gridColumn: openForm ? 'auto' : '1 / -1' }}>
                    <div className="paint-table-wrap tall">
                        <table className="paint-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Paint Name</th>
                                    {!openForm && <th>Category</th>}
                                    {!openForm && <th>Brand</th>}
                                    <th>UOM</th>
                                    <th className="num">Reorder</th>
                                    <th className="num">Stock</th>
                                    <th className="num">Avg Cost</th>
                                    <th className="num">Stock Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => (
                                    <tr key={r.PaintItemID}
                                        className={editingId === r.PaintItemID ? 'is-selected' : ''}
                                        onClick={() => openEdit(r)}
                                        style={{ cursor: 'pointer' }}>
                                        <td className="mono">{r.PaintCode}</td>
                                        <td className="trunc"><strong>{r.PaintName}</strong></td>
                                        {!openForm && <td className="trunc">{r.CategoryName || '—'}</td>}
                                        {!openForm && <td className="trunc">{r.BrandName || '—'}</td>}
                                        <td>{r.UOMName || '—'}</td>
                                        <td className="num">{r.ReorderLevel != null ? fmt(r.ReorderLevel) : '—'}</td>
                                        <td className="num">{fmt(r.StockQty)}</td>
                                        <td className="num">{fmt(r.AvgCost)}</td>
                                        <td className="num"><strong>{fmt(r.StockValue)}</strong></td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={openForm ? 7 : 9} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                                        No paint items{search ? ' match your search' : ' yet — click New to add one'}.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="hint">{filtered.length} paint item{filtered.length === 1 ? '' : 's'}</div>
                </div>

                {openForm && (
                    <div className="paint-pane">
                        <div className="paint-card">
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                <div className="paint-card-title" style={{ marginBottom: 0, flex: 1 }}>
                                    {editingId ? 'Edit Paint Item' : 'New Paint Item'}
                                </div>
                                <button className="paint-icon-btn" onClick={closeForm} title="Close"><X size={12} /></button>
                            </div>
                            <form onSubmit={submit} className="paint-form-grid">
                                <label className="span-2">
                                    Paint Code *
                                    <input className="field" required value={form.PaintCode} disabled={!!editingId}
                                        onChange={e => setForm({ ...form, PaintCode: e.target.value })} />
                                    {editingId && <span className="hint">Immutable after creation.</span>}
                                </label>
                                <label className="span-2">
                                    Paint Name *
                                    <input className="field" required value={form.PaintName}
                                        onChange={e => setForm({ ...form, PaintName: e.target.value })} />
                                </label>
                                <label>
                                    Category
                                    <SearchableSelect value={form.PaintCategoryID}
                                        onChange={v => setForm({ ...form, PaintCategoryID: v })}
                                        placeholder="Select…"
                                        options={cats.map(c => ({ id: c.PaintCategoryID, label: c.CategoryName }))} />
                                </label>
                                <label>
                                    Brand
                                    <SearchableSelect value={form.PaintBrandID}
                                        onChange={v => setForm({ ...form, PaintBrandID: v })}
                                        placeholder="Select…"
                                        options={brands.map(b => ({ id: b.PaintBrandID, label: b.BrandName }))} />
                                </label>
                                <label>
                                    UOM
                                    <SearchableSelect value={form.PaintUOMID}
                                        onChange={v => setForm({ ...form, PaintUOMID: v })}
                                        placeholder="Select…"
                                        options={uoms.map(u => ({ id: u.PaintUOMID, label: u.UOMName }))} />
                                </label>
                                <label>
                                    Reorder Level
                                    <input className="field" type="number" step="0.001" value={form.ReorderLevel}
                                        onChange={e => setForm({ ...form, ReorderLevel: e.target.value })} />
                                </label>
                                <label className="span-2" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 12.5, color: 'var(--erp-text)' }}>
                                    <input type="checkbox" checked={form.GSTDefaultOn}
                                        onChange={e => setForm({ ...form, GSTDefaultOn: e.target.checked })}
                                        style={{ height: 'auto', width: 'auto', minHeight: 'auto' }} />
                                    GST on by default (per-line override on GRN)
                                </label>
                                {editingId && (
                                    <label className="span-2" style={{ flexDirection: 'row', gap: 6, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 12.5, color: 'var(--erp-text)' }}>
                                        <input type="checkbox" checked={form.IsActive}
                                            onChange={e => setForm({ ...form, IsActive: e.target.checked })}
                                            style={{ height: 'auto', width: 'auto', minHeight: 'auto' }} />
                                        Active
                                    </label>
                                )}
                                <div className="span-2" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                                    <button type="button" className="btn" onClick={closeForm}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={busy}>
                                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                        {editingId ? ' Save' : ' Create'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
