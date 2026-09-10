import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Package, Plus, Search, Pencil, X } from 'lucide-react';
import { useCan } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { ErpControlPanel } from '../components/erp';

const API_BASE = '/api';

const emptyForm = {
  ManualNumber: '', ItenName: '', CategoryID: '', ItemBrandId: '',
  UOMId: '', WHID: '', BinLocation: '',
  ItemType: 'Part',
  ItemSalesPrice: '', ItemPurchasePrice: '',
  ReOrderLevel: '',
  SupersededByItemId: '', SupersededByNumber: '',
};

const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Parts() {
  const { canInsert, canEdit } = useCan('parts_spare');
  const { notify } = useFeedback();

  const [items, setItems]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUOMs]             = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [brands, setBrands]         = useState([]);
  // Owner ask 2026-07-03: read-only "Total Issued" column, sourced from
  // /api/items/issued-summary. Keyed by ItemId.
  const [issuedByItem, setIssuedByItem] = useState({});
  // Owner ask 2026-09-10: show tax and the after-tax sale price per item.
  // GST is a per-line decision at transaction time (the issue/sale screens
  // carry an IsGST toggle), so what the catalog shows is the current standard
  // rate applied to the list price — a price-list figure, not a posted one.
  const [gstRate, setGstRate] = useState(null);

  const [search, setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);   // null = create
  const [formData, setFormData] = useState(emptyForm);

  const fetchData = async () => {
    try {
      const [res, cat, uom, wh, br, iss, tax] = await Promise.all([
        axios.get(`${API_BASE}/items`),
        axios.get(`${API_BASE}/inventory-config/categories`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/inventory-config/uoms`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/inventory-config/warehouses`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/inventory-config/brands`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/items/issued-summary`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/tax-rates`).catch(() => ({ data: [] })),
      ]);
      setItems((res.data || []).filter(i => i.ItemType === 'Part'));
      setCategories(cat.data || []);
      setUOMs(uom.data || []);
      setWarehouses(wh.data || []);
      setBrands(br.data || []);
      // Turn the flat list into a lookup keyed by ItemId for O(1) merging.
      const idx = {};
      for (const row of (iss.data || [])) idx[row.ItemId] = row;
      setIssuedByItem(idx);
      // /api/tax-rates answers { current: [...], scheduled: [...] } — not a
      // flat array. Leave null (not 0) when GST isn't configured or the user
      // can't read rates, so the columns say "not set" rather than quietly
      // showing 0.00 tax as though it were a real zero-rated price.
      const g = (tax.data?.current || []).find(t => t.TaxType === 'GST');
      setGstRate(g ? Number(g.Rate) : null);
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
      ManualNumber:      item.ManualNumber ?? (item.ItemNumber != null ? String(item.ItemNumber) : ''),
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
      SupersededByItemId: item.SupersededByItemId ?? '',
      SupersededByNumber: item.SupersededByNumber ?? '',
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
    const salePrice = Number(formData.ItemSalesPrice) || 0;
    const purchasePrice = Number(formData.ItemPurchasePrice) || 0;
    if (salePrice > 0 && purchasePrice > 0 && salePrice < purchasePrice) {
      notify({ type: 'error', title: 'Sale price too low', message: `Sale price (${salePrice.toFixed(2)}) can't be less than purchase price (${purchasePrice.toFixed(2)}).` });
      return;
    }
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
        <ErpControlPanel
          title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Package size={14} color="var(--erp-brand)" /> Spare Parts Catalog</span>}
          subtitle="Search by name or part number. Click a row to edit price, category or bin location."
          actions={
            canInsert && !showForm && (
              <button type="button" className="erp-btn erp-btn-primary" onClick={startCreate}>
                <Plus size={14} /> Add Part
              </button>
            )
          }
        />

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
                  <th style={{ textAlign: 'right' }} title="List price excluding sales tax">
                    Sale Price<br /><small style={{ fontWeight: 400, color: '#94a3b8' }}>excl. tax</small>
                  </th>
                  <th style={{ textAlign: 'right' }}
                      title={gstRate != null ? `GST at the current ${gstRate}% rate` : 'No GST rate configured'}>
                    Tax<br /><small style={{ fontWeight: 400, color: '#94a3b8' }}>
                      {gstRate != null ? `GST ${gstRate}%` : 'not set'}
                    </small>
                  </th>
                  <th style={{ textAlign: 'right' }} title="What the customer pays — sale price plus sales tax">
                    Sale Price<br /><small style={{ fontWeight: 400, color: '#94a3b8' }}>incl. tax</small>
                  </th>
                  <th style={{ textAlign: 'right' }} title="Total quantity issued to job cards (read-only)">Issued</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={canEdit ? 11 : 10} className="table-empty-row">No parts match this search.</td></tr>
                ) : filtered.map(i => {
                  const iss = issuedByItem[i.ItemId];
                  const sale = Number(i.ItemSalesPrice || 0);
                  const taxAmt = (gstRate != null && sale > 0) ? sale * gstRate / 100 : null;
                  return (
                  <tr key={i.ItemId} onClick={() => canEdit && startEdit(i)} style={{ cursor: canEdit ? 'pointer' : 'default' }}>
                    <td>
                      <code>{i.ManualNumber ?? i.ItemNumber ?? '—'}</code>
                      {i.SupersededByCode && (
                        <div style={{ marginTop: 2, fontSize: '0.7rem', color: '#b45309', whiteSpace: 'nowrap' }}
                             title={i.SupersededByName ? `Superseded by ${i.SupersededByCode} — ${i.SupersededByName}` : `Superseded by ${i.SupersededByCode}`}>
                          → <code style={{ color: '#b45309' }}>{i.SupersededByCode}</code>
                        </div>
                      )}
                    </td>
                    <td>{i.ItenName}</td>
                    <td>{catName(i.CategoryID)}</td>
                    <td>{i.BinLocation || '—'}</td>
                    <td>{uomName(i.UOMId)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {(() => {
                        const purchase = Number(i.ItemPurchasePrice || 0);
                        if (sale <= 0) return <span style={{ color: '#b45309', fontStyle: 'italic' }} title="No sale price set yet">Not set</span>;
                        if (purchase > 0 && sale < purchase) return <span style={{ color: '#b91c1c', fontWeight: 700 }} title={`Below purchase price (${purchase.toFixed(2)})`}>{money(sale)}</span>;
                        return money(sale);
                      })()}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                      {taxAmt == null
                        ? <span style={{ color: '#cbd5e1' }}>—</span>
                        : money(taxAmt)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {taxAmt == null
                        ? <span style={{ color: '#cbd5e1', fontWeight: 400 }}>—</span>
                        : money(sale + taxAmt)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: iss ? '#0f172a' : '#94a3b8', fontWeight: iss ? 600 : 400 }}
                        title={iss ? `Across ${iss.IssueCount} slip(s) — PKR ${Number(iss.TotalIssuedValue || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'No issues yet'}>
                      {iss ? Number(iss.TotalIssuedQty || 0).toLocaleString('en-PK') : '—'}
                    </td>
                    {canEdit && (
                      <td style={{ width: 50, textAlign: 'right' }}>
                        <button className="btn-icon" title="Edit" onClick={(e) => { e.stopPropagation(); startEdit(i); }}>
                          <Pencil size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}
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
                <input value={formData.ManualNumber}
                       onChange={e => setFormData({ ...formData, ManualNumber: e.target.value })}
                       placeholder="Any alphanumeric — e.g. AA-12X-B" />
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

              {/* Live tax preview, so the person setting the price sees what
                  the customer will actually be charged without doing the sum. */}
              {(() => {
                const sp = Number(formData.ItemSalesPrice) || 0;
                if (!(sp > 0) || gstRate == null) return null;
                const t = sp * gstRate / 100;
                return (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
                                padding: '8px 10px', fontSize: '0.78rem', color: '#475569',
                                display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>GST @ {gstRate}%</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      + {money(t)} &nbsp;=&nbsp; <strong style={{ color: '#0f172a' }}>{money(sp + t)}</strong>
                    </span>
                  </div>
                );
              })()}

              <div className="form-group">
                <label>Reorder Level</label>
                <input type="number" min="0" step="1" value={formData.ReOrderLevel}
                       placeholder="Alert when on-hand stock drops to this many units"
                       onChange={e => setFormData({ ...formData, ReOrderLevel: e.target.value })} />
              </div>

              {/* Supersession (owner ask 2026-09-10). Two ways to record it:
                  pick the replacement from the catalog when it is stocked, or
                  type the number from the parts manual when it is not yet. */}
              <div className="form-group">
                <label>Superseded By</label>
                <SearchableSelect
                  value={formData.SupersededByItemId || ''}
                  onChange={v => setFormData({ ...formData, SupersededByItemId: v || '' })}
                  options={items
                    .filter(p => p.ItemId !== editingId)
                    .map(p => ({
                      id: p.ItemId,
                      label: String(p.ManualNumber ?? p.ItemNumber ?? '—'),
                      sub: p.ItenName || '',
                    }))}
                  placeholder="Search the replacement part…"
                  title="Superseded by which part?"
                />
                <input type="text" value={formData.SupersededByNumber}
                       style={{ marginTop: 6 }}
                       placeholder="…or type the new part number if it isn't catalogued yet"
                       onChange={e => setFormData({ ...formData, SupersededByNumber: e.target.value })} />
                <p className="field-hint" style={{ marginTop: 4 }}>
                  Marks this number as replaced by a newer one. Leave both blank if the part is current.
                </p>
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
