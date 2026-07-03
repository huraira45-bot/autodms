import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Warehouse, Trash2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { PageHeader } from '../components/UXPrimitives';
import { ErpControlPanel } from '../components/erp';

const API_BASE = '/api';

export default function InventorySettings() {
  const { notify, confirm } = useFeedback();
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [uoms, setUOMs] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  
  const [catName, setCatName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [uomName, setUomName] = useState('');
  const [whData, setWhData] = useState({ WHDesc: '', WhCode: '', PhoneNo: '', LocationAddress: '' });

  const fetchData = async () => {
    try {
      const [catRes, brandRes, uomRes, whRes] = await Promise.all([
        axios.get(`${API_BASE}/inventory-config/categories`),
        axios.get(`${API_BASE}/inventory-config/brands`),
        axios.get(`${API_BASE}/inventory-config/uoms`),
        axios.get(`${API_BASE}/inventory-config/warehouses`)
      ]);
      setCategories(catRes.data);
      setBrands(brandRes.data);
      setUOMs(uomRes.data);
      setWarehouses(whRes.data);
    } catch (err) { console.error('Error fetching inventory config:', err); }
  };

  useEffect(() => { fetchData(); }, []);

  const showError = (title, err) => {
    notify({ type: 'error', title, message: err.response?.data?.details || err.response?.data?.error || err.message });
  };

  const handleAddCat = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/inventory-config/categories`, { CategoryName: catName });
      notify({ type: 'success', title: 'Category added', message: catName });
      setCatName('');
      fetchData();
    } catch (err) { showError('Could not add category', err); }
  };

  const handleAddBrand = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/inventory-config/brands`, { BrandName: brandName });
      notify({ type: 'success', title: 'Brand added', message: brandName });
      setBrandName('');
      fetchData();
    } catch (err) { showError('Could not add brand', err); }
  };

  const handleAddUom = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/inventory-config/uoms`, { UOMName: uomName, Scale: 1 });
      notify({ type: 'success', title: 'Unit added', message: uomName });
      setUomName('');
      fetchData();
    } catch (err) { showError('Could not add unit', err); }
  };

  const handleAddWarehouse = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/inventory-config/warehouses`, whData);
      notify({ type: 'success', title: 'Warehouse added', message: whData.WHDesc });
      setWhData({ WHDesc: '', WhCode: '', PhoneNo: '', LocationAddress: '' });
      fetchData();
    } catch (err) { showError('Could not add warehouse', err); }
  };

  // Owner ask 2026-07-03: allow deleting config rows. Categories / brands /
  // UOMs are hard-deleted if unused; the backend returns 409 with a hint
  // if the row is still referenced by any part. Warehouses are archived.
  const handleDelete = async (kind, endpoint, id, label) => {
    const ok = await confirm({
      title: `Delete ${kind}?`,
      message: `Remove "${label}" from the ${kind} list.`,
      details: 'If this record is still used by any part the delete will be refused.',
      confirmLabel: 'Delete',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await axios.delete(`${API_BASE}/inventory-config/${endpoint}/${id}`);
      notify({ type: 'success', title: `${kind} removed`, message: label });
      fetchData();
    } catch (err) {
      notify({ type: 'error', title: `Could not delete ${kind}`, message: err.response?.data?.error || err.message });
    }
  };
  const iconBtn = { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, marginLeft: 'auto' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ErpControlPanel
        title="Inventory Configurations"
        subtitle="Setup lookups, categories, brands, warehouses, and units for the master catalog."
      />
      
      <div className="grid-2" style={{ marginTop: '24px', gap: '24px' }}>
        <div className="card">
          <h2 className="card-title">Inventory Categories</h2>
          <form onSubmit={handleAddCat} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Vehicles, Oils" value={catName} onChange={e => setCatName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {categories.map(c => (
              <li key={c.CategoryID} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
                <span>{c.CategoryName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {c.CategoryID})</span></span>
                <button style={iconBtn} title="Delete category" onClick={() => handleDelete('category', 'categories', c.CategoryID, c.CategoryName)}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="card">
          <h2 className="card-title">Units of Measure (UOM)</h2>
          <form onSubmit={handleAddUom} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Liters, Units" value={uomName} onChange={e => setUomName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {uoms.map(u => (
              <li key={u.UOMId} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
                <span>{u.UOMName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {u.UOMId})</span></span>
                <button style={iconBtn} title="Delete unit" onClick={() => handleDelete('unit of measure', 'uoms', u.UOMId, u.UOMName)}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 className="card-title">Item Brands</h2>
          <form onSubmit={handleAddBrand} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Changan, Toyota" value={brandName} onChange={e => setBrandName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {brands.map(b => (
              <span key={b.ItemBrandId} style={{ background: '#f1f5f9', padding: '4px 6px 4px 12px', borderRadius: '16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {b.BrandName}
                <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, display: 'inline-flex' }}
                        title="Delete brand" onClick={() => handleDelete('brand', 'brands', b.ItemBrandId, b.BrandName)}><Trash2 size={13} /></button>
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Warehouses / Locations</h2>
          <form onSubmit={handleAddWarehouse}>
            <div className="form-group">
              <label>Warehouse Name *</label>
              <input required type="text" value={whData.WHDesc} onChange={e => setWhData({...whData, WHDesc: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Wh. Code</label>
              <input type="text" value={whData.WhCode} onChange={e => setWhData({...whData, WhCode: e.target.value})} />
            </div>
            <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }}><Plus size={18} /> Add Warehouse</button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '16px' }}>
            {warehouses.map(w => (
              <li key={w.WHID} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Warehouse size={16} color="var(--text-muted)" />
                <div>
                  <div style={{ fontWeight: '500' }}>{w.WHDesc}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{w.WhCode}</div>
                </div>
                <button style={iconBtn} title="Archive warehouse" onClick={() => handleDelete('warehouse', 'warehouses', w.WHID, w.WHDesc)}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
