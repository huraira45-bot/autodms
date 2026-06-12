import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Warehouse } from 'lucide-react';

const API_BASE = '/api';

export default function InventorySettings() {
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

  const handleAddCat = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_BASE}/inventory-config/categories`, { CategoryName: catName }); setCatName(''); fetchData(); } 
    catch (err) { alert('Error: ' + err.message); }
  };

  const handleAddBrand = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_BASE}/inventory-config/brands`, { BrandName: brandName }); setBrandName(''); fetchData(); } 
    catch (err) { alert('Error: ' + err.message); }
  };

  const handleAddUom = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_BASE}/inventory-config/uoms`, { UOMName: uomName, Scale: 1 }); setUomName(''); fetchData(); } 
    catch (err) { alert('Error: ' + err.message); }
  };

  const handleAddWarehouse = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_BASE}/inventory-config/warehouses`, whData); setWhData({ WHDesc: '', WhCode: '', PhoneNo: '', LocationAddress: '' }); fetchData(); } 
    catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div>
      <h1 className="page-title">Inventory Configurations</h1>
      <p className="page-subtitle">Setup lookups, categories, and units for the Master Catalog.</p>
      
      <div className="grid-2" style={{ marginTop: '24px', gap: '24px' }}>
        <div className="card">
          <h2 className="card-title">Inventory Categories</h2>
          <form onSubmit={handleAddCat} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input style={{ flex: 1 }} type="text" placeholder="e.g. Vehicles, Oils" value={catName} onChange={e => setCatName(e.target.value)} required />
            <button type="submit" className="btn" style={{ padding: '10px' }}><Plus size={18} /></button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {categories.map(c => (
              <li key={c.CategoryID} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {c.CategoryName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {c.CategoryID})</span>
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
              <li key={u.UOMId} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {u.UOMName} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(ID: {u.UOMId})</span>
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
              <span key={b.ItemBrandId} style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: '16px', fontSize: '0.85rem' }}>
                {b.BrandName}
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
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
