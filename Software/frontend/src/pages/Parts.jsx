import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Package, Plus, Search, Pencil, X } from 'lucide-react';
import { useCan } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';

const API_BASE = '/api';

const emptyForm = {
  ItemNumber: '', ItenName: '', CategoryID: '', ItemBrandId: '',
  UOMId: '', WHID: '', BinLocation: '',
  ItemType: 'Part',
  ItemSalesPrice: '', ItemPurchasePrice: '',
  ReOrderLevel: '',
};

export default function Parts() {
  const { canInsert, canEdit } = useCan('parts_spare');
  const { notify } = useFeedback();

  const [items, setItems]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUOMs]             = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [brands, setBrands]         = useState([]);

  const [search, setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);   // null = create
  const [formData, setFormData] = useState(emptyForm);

  const fetchData = async () => {
    try {
      const [res, cat, uom, wh, br] = await Promise.all([
        axios.get(`${API_BASE}/items`),
        axios.get(`${API_BASE}/inventory-config/categories`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/inventory-config/uoms`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/inventory-config/warehouses`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/inventory-config/brands`).catch(() => ({ data: [] })),
      ]);
      setItems((res.data || []).filter(i => i.ItemType === 'Part'));
      setCategories(cat.data || []);
      setUOMs(uom.data || []);
      setWarehouses(wh.data || []);
      setBrands(br.data || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchData(); }, []);

  // Filter by part number OR name. Case-insensitive on both.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      (i.ItemNumber != null && String(i.ItemNumber).toLowerCase().includes(q)) ||
      (i.ManualNumber       && String(i.ManualNumber).toLowerCase().includes(q)) ||
      (i.ItenName           && i.ItenName.toLowerCase().includes(q))
    );
  }, [items, search]);

  const startCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const startEdit = (item) => {
    setEditingId(item.ItemId);
    setFormData({
      ItemNumber:        item.ItemNumber ?? '',
      ItenName:          item.ItenName ?? '',
      CategoryID:        item.CategoryID ?? '',
      ItemBrandId:       item.ItemBrandId ?? '',
      UOMId:             item.UOMId ?? '',
      WHID:              item.WHID ?? '',
      BinLocation:       item.BinLocation ?? '',
      ItemType:          item.ItemType || 'Part',
      ItemSalesPrice:    item.ItemSalesPrice ?? '',
      ItemPurchasePrice: item.ItemPurchasePrice ?? '',
      ReOrderLevel:      item.ReOrderLevel ?? '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/items/${editingId}`, formData);
        notify({ type: 'success', title: 'Part updated', message: formData.ItenName });
      } else {
        await axios.post(`${API_BASE}/items`, formData);
        notify({ type: 'success', title: 'Part added', message: formData.ItenName });
      }
      closeForm();
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || err.message;
      notify({ type: 'error', title: 'Save failed', message: msg });
    }
  };

  const catName = (id) => categories.find(c => c.CategoryID === id)?.CategoryName || '—';
  const uomName = (id) => uoms.find(u => u.UOMId === id)?.UOMName || '';

  return (
    <div className="page-split">
      <div className="page-split-main">
        <div className="card-header">
          <div>
            <h1 className="page-title">Spare Parts Catalog</h1>
            <p className="page-subtitle">Search by name or part number. Click a row to edit price, category or bin location.</p>
          </div>
          {canInsert && !showForm && (
            <button className="btn" onClick={startCreate}><Plus size={18} /> Add Part</button>
          )}
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by part number or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span style={{ color: '#94a3b8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
              {filtered.length} of {items.length}
            </span>
          </div>
        </div>

        <div className="card data-card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Part No</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Bin</th>
                  <th>UOM</th>
                  <th style={{ textAlign: 'right' }}>Sale Price</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={canEdit ? 7 : 6} className="table-empty-row">No parts match this search.</td></tr>
                ) : filtered.map(i => (
                  <tr key={i.ItemId} onClick={() => canEdit && startEdit(i)} style={{ cursor: canEdit ? 'pointer' : 'default' }}>
                    <td><code>{i.ItemNumber ?? i.ManualNumber ?? '—'}</code></td>
                    <td>{i.ItenName}</td>
                    <td>{catName(i.CategoryID)}</td>
                    <td>{i.BinLocation || '—'}</td>
                    <td>{uomName(i.UOMId)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(i.ItemSalesPrice || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    {canEdit && (
                      <td style={{ width: 50, textAlign: 'right' }}>
                        <button className="btn-icon" title="Edit" onClick={(e) => { e.stopPropagation(); startEdit(i); }}>
                          <Pencil size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="page-split-side">
          <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                {editingId ? 'Edit Part' : 'Register Part'}
              </h2>
              <button className="btn-icon" onClick={closeForm}><X size={16} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Part Description *</label>
                <input required value={formData.ItenName}
                       onChange={e => setFormData({ ...formData, ItenName: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Part Number / Barcode</label>
                <input value={formData.ItemNumber}
                       onChange={e => setFormData({ ...formData, ItemNumber: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select value={formData.CategoryID}
                        onChange={e => setFormData({ ...formData, CategoryID: e.target.value })}>
                  <option value="">— Select category —</option>
                  {categories.map(c => (
                    <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Bin / Shelf Location</label>
                <input value={formData.BinLocation}
                       placeholder="e.g. A-12, RACK-3"
                       onChange={e => setFormData({ ...formData, BinLocation: e.target.value })} />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>UOM {!editingId && '*'}</label>
                  <select required={!editingId} value={formData.UOMId}
                          onChange={e => setFormData({ ...formData, UOMId: e.target.value })}>
                    <option value="">Select…</option>
                    {uoms.map(u => <option key={u.UOMId} value={u.UOMId}>{u.UOMName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Brand</label>
                  <select value={formData.ItemBrandId}
                          onChange={e => setFormData({ ...formData, ItemBrandId: e.target.value })}>
                    <option value="">—</option>
                    {brands.map(b => <option key={b.ItemBrandId} value={b.ItemBrandId}>{b.BrandName}</option>)}
                  </select>
                </div>
              </div>

              {!editingId && (
                <div className="form-group">
                  <label>Warehouse</label>
                  <select value={formData.WHID}
                          onChange={e => setFormData({ ...formData, WHID: e.target.value })}>
                    <option value="">Select…</option>
                    {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
                  </select>
                </div>
              )}

              <div className="grid-2">
                <div className="form-group">
                  <label>Sale Price</label>
                  <input type="number" step="0.01" value={formData.ItemSalesPrice}
                         onChange={e => setFormData({ ...formData, ItemSalesPrice: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Purchase Price</label>
                  <input type="number" step="0.01" value={formData.ItemPurchasePrice}
                         onChange={e => setFormData({ ...formData, ItemPurchasePrice: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label>Reorder Level</label>
                <input type="number" min="0" step="1" value={formData.ReOrderLevel}
                       placeholder="Alert when on-hand stock drops to this many units"
                       onChange={e => setFormData({ ...formData, ReOrderLevel: e.target.value })} />
              </div>

              {editingId && (
                <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>
                  Sale price updates here will reflect in Store Sale and Parts Issue pickers automatically.
                </p>
              )}

              <button type="submit" className="btn" style={{ width: '100%', marginTop: 4 }}>
                {editingId ? 'Save Changes' : 'Save Part'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
