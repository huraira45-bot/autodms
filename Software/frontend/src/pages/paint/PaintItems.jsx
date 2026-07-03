/**
 * Paint Items master (Phase 0).
 * Full CRUD (create/edit/soft-delete) over paint_Item with pickers for
 * category / brand / UOM. Stock qty / avg cost / stock value are
 * read-only — they move via GRN / GRTN / Issue only, never here.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Plus, Pencil, X, Loader2 } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { ErpControlPanel, ErpSearchBar, ErpListView } from '../../components/erp';
import SearchableSelect from '../../components/SearchableSelect';

const emptyForm = {
    PaintCode: '', PaintName: '',
    PaintCategoryID: '', PaintBrandID: '', PaintUOMID: '',
    ReorderLevel: '', GSTDefaultOn: true, IsActive: true,
};

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaintItems() {
    const { notify } = useFeedback();
    const [items, setItems] = useState([]);
    const [cats, setCats]   = useState([]);
    const [brands, setBrands] = useState([]);
    const [uoms, setUOMs]   = useState([]);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
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

    const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };
    const openEdit = (row) => {
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
        setShowForm(true);
    };
    const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

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

    const columns = [
        { key: 'code',   label: 'Code',        render: r => <code>{r.PaintCode}</code> },
        { key: 'name',   label: 'Paint Name',  render: r => <strong>{r.PaintName}</strong> },
        { key: 'cat',    label: 'Category',    render: r => r.CategoryName || '—' },
        { key: 'brand',  label: 'Brand',       render: r => r.BrandName || '—' },
        { key: 'uom',    label: 'UOM',         render: r => r.UOMName || '—' },
        { key: 'reord',  label: 'Reorder',     align: 'right', render: r => r.ReorderLevel != null ? fmt(r.ReorderLevel) : '—' },
        { key: 'stock',  label: 'Stock Qty',   align: 'right', render: r => fmt(r.StockQty) },
        { key: 'avg',    label: 'Avg Cost',    align: 'right', render: r => fmt(r.AvgCost) },
        { key: 'value',  label: 'Stock Value', align: 'right', render: r => <strong>{fmt(r.StockValue)}</strong> },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title="Paint Items"
                subtitle="Paint master — codes, brands, categories, UOM. Stock and average cost move only via Paint GRN / GRTN / Issue."
                actions={
                    <button type="button" className="erp-btn erp-btn-primary" onClick={openCreate}>
                        <Plus size={14} /> Add Paint Item
                    </button>
                }
            >
                <ErpSearchBar value={search} onChange={setSearch} placeholder="Search code or name…" width={280} />
            </ErpControlPanel>

            <ErpListView
                columns={columns}
                rows={filtered}
                rowKey="PaintItemID"
                onRowClick={openEdit}
                emptyLabel="No paint items yet. Click Add Paint Item to seed the master."
                footerLeft={`${filtered.length} paint item${filtered.length === 1 ? '' : 's'}`}
            />

            {showForm && (
                <div className="modal-overlay" onClick={closeForm}>
                    <div className="modal-card" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? 'Edit Paint Item' : 'New Paint Item'}</h3>
                            <button onClick={closeForm}><X size={16} /></button>
                        </div>
                        <form onSubmit={submit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group">
                                <label>Paint Code *</label>
                                <input required value={form.PaintCode} disabled={!!editingId}
                                       onChange={e => setForm({ ...form, PaintCode: e.target.value })} />
                                {editingId && <small style={{ color: '#94a3b8' }}>Code is immutable after creation.</small>}
                            </div>
                            <div className="form-group">
                                <label>Paint Name *</label>
                                <input required value={form.PaintName}
                                       onChange={e => setForm({ ...form, PaintName: e.target.value })} />
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Category</label>
                                    <SearchableSelect value={form.PaintCategoryID}
                                        onChange={v => setForm({ ...form, PaintCategoryID: v })}
                                        placeholder="Select category…"
                                        options={cats.map(c => ({ id: c.PaintCategoryID, label: c.CategoryName }))} />
                                </div>
                                <div className="form-group">
                                    <label>Brand</label>
                                    <SearchableSelect value={form.PaintBrandID}
                                        onChange={v => setForm({ ...form, PaintBrandID: v })}
                                        placeholder="Select brand…"
                                        options={brands.map(b => ({ id: b.PaintBrandID, label: b.BrandName }))} />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label>UOM</label>
                                    <SearchableSelect value={form.PaintUOMID}
                                        onChange={v => setForm({ ...form, PaintUOMID: v })}
                                        placeholder="Select UOM…"
                                        options={uoms.map(u => ({ id: u.PaintUOMID, label: u.UOMName }))} />
                                </div>
                                <div className="form-group">
                                    <label>Reorder Level</label>
                                    <input type="number" step="0.001" value={form.ReorderLevel}
                                           onChange={e => setForm({ ...form, ReorderLevel: e.target.value })} />
                                </div>
                            </div>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                                <input type="checkbox" checked={form.GSTDefaultOn}
                                       onChange={e => setForm({ ...form, GSTDefaultOn: e.target.checked })} />
                                GST on by default (line-level override on GRN)
                            </label>
                            {editingId && (
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                                    <input type="checkbox" checked={form.IsActive}
                                           onChange={e => setForm({ ...form, IsActive: e.target.checked })} />
                                    Active
                                </label>
                            )}
                            <button type="submit" className="btn" disabled={busy} style={{ marginTop: 6 }}>
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} {editingId ? 'Save changes' : 'Create paint item'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
