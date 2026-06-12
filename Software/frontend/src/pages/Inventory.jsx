import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Plus } from 'lucide-react';

const API_BASE = '/api';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [uoms, setUOMs] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    ItemNumber: '',
    ItenName: '',
    CategoryID: '',
    ItemBrandId: '',
    UOMId: '',
    WHID: '',
    ItemType: 'Part',
    Make: '',
    ItemModel: '',
    SerialNo: '',
    ItemSalesPrice: '',
    ItemPurchasePrice: '',
    ItemPurchaseGL: '',
    ItemSalesGL: ''
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [itemsRes, catRes, brandRes, uomRes, whRes] = await Promise.all([
        axios.get(`${API_BASE}/items`),
        axios.get(`${API_BASE}/inventory-config/categories`),
        axios.get(`${API_BASE}/inventory-config/brands`),
        axios.get(`${API_BASE}/inventory-config/uoms`),
        axios.get(`${API_BASE}/inventory-config/warehouses`)
      ]);
      setItems(itemsRes.data);
      setCategories(catRes.data);
      setBrands(brandRes.data);
      setUOMs(uomRes.data);
      setWarehouses(whRes.data);
    } catch (err) {
      console.error('Error fetching inventory data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      await axios.post(`${API_BASE}/items`, formData);
      setSuccess('Item successfully added to catalog!');
      setFormData({
        ItemNumber: '', ItenName: '', CategoryID: '', ItemBrandId: '', UOMId: '',
        WHID: '', ItemType: 'Part', Make: '', ItemModel: '', SerialNo: '',
        ItemSalesPrice: '', ItemPurchasePrice: '', ItemPurchaseGL: '', ItemSalesGL: ''
      });
      setShowForm(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.details || 'Error saving item.');
    }
  };

  return (
    <div className="page-split">
      <div className="page-split-main">
        <div className="card-header" style={{ marginBottom: '24px' }}>
          <div>
            <h1 className="page-title">Master Catalog</h1>
            <p className="page-subtitle">Manage Vehicles, Spare Parts, and Services.</p>
          </div>
          {!showForm && (
            <button className="btn" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Add New Item
            </button>
          )}
        </div>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{success}</div>}

        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '16px' }}>Catalog Directory</h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Part No</th>
                  <th>Name / Description</th>
                  <th>Type</th>
                  <th>Sales Price</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No items found in catalog.</td></tr>
                ) : (
                  items.slice(-15).reverse().map(item => (
                    <tr key={item.ItemId}>
                      <td>{item.ItemNumber || `#${item.ItemId}`}</td>
                      <td style={{ fontWeight: '500' }}>
                        {item.ItenName}
                        {item.ItemType === 'Vehicle' && <span style={{display:'block', fontSize:'0.8rem', color:'var(--text-muted)'}}>{item.Make} {item.ItemModel}</span>}
                      </td>
                      <td>
                        <span style={{ 
                          background: item.ItemType === 'Vehicle' ? '#e0e7ff' : item.ItemType === 'Service' ? '#fce7f3' : '#f1f5f9', 
                          color: item.ItemType === 'Vehicle' ? '#3730a3' : item.ItemType === 'Service' ? '#9d174d' : '#475569',
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: '500' 
                        }}>
                          {item.ItemType}
                        </span>
                      </td>
                      <td>{item.ItemSalesPrice ? `PKR ${parseFloat(item.ItemSalesPrice).toLocaleString()}` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="page-split-side">
          <div className="card" style={{ borderLeft: '4px solid var(--primary)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="card-title">Register New Item</h2>
              <button className="btn" style={{ background: 'transparent', color: 'var(--text-muted)', padding: '4px 8px' }} onClick={() => setShowForm(false)}>X</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="form-group">
                  <label>Item Name / Description *</label>
                  <input required type="text" value={formData.ItenName} onChange={e => setFormData({...formData, ItenName: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Part Number / Barcode</label>
                  <input type="number" value={formData.ItemNumber} onChange={e => setFormData({...formData, ItemNumber: e.target.value})} />
                </div>
                
                <div className="form-group">
                  <label>Item Type</label>
                  <select value={formData.ItemType} onChange={e => setFormData({...formData, ItemType: e.target.value})}>
                    <option value="Part">Spare Part</option>
                    <option value="Vehicle">Vehicle</option>
                    <option value="Service">Service / Labor</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select required value={formData.CategoryID} onChange={e => setFormData({...formData, CategoryID: e.target.value})}>
                    <option value="" disabled>Select Category...</option>
                    {categories.map(c => <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Unit of Measure (UOM) *</label>
                  <select required value={formData.UOMId} onChange={e => setFormData({...formData, UOMId: e.target.value})}>
                    <option value="" disabled>Select UOM...</option>
                    {uoms.map(u => <option key={u.UOMId} value={u.UOMId}>{u.UOMName}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Default Warehouse *</label>
                  <select required value={formData.WHID} onChange={e => setFormData({...formData, WHID: e.target.value})}>
                    <option value="" disabled>Select Warehouse...</option>
                    {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Brand / Manufacturer</label>
                  <select value={formData.ItemBrandId} onChange={e => setFormData({...formData, ItemBrandId: e.target.value})}>
                    <option value="">No Brand</option>
                    {brands.map(b => <option key={b.ItemBrandId} value={b.ItemBrandId}>{b.BrandName}</option>)}
                  </select>
                </div>

                {formData.ItemType === 'Vehicle' && (
                  <>
                    <div className="form-group" style={{ marginTop: '12px' }}>
                      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Vehicle Specifications</h3>
                    </div>
                    <div className="form-group">
                      <label>Make (e.g. Changan)</label>
                      <input type="text" value={formData.Make} onChange={e => setFormData({...formData, Make: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Model (e.g. Alsvin 1.5)</label>
                      <input type="text" value={formData.ItemModel} onChange={e => setFormData({...formData, ItemModel: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Chassis No / Serial No</label>
                      <input type="text" value={formData.SerialNo} onChange={e => setFormData({...formData, SerialNo: e.target.value})} />
                    </div>
                  </>
                )}

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Financial & Ledger Config</h3>
                </div>
                <div className="form-group">
                  <label>Default Purchase Price</label>
                  <input type="number" step="0.01" value={formData.ItemPurchasePrice} onChange={e => setFormData({...formData, ItemPurchasePrice: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Default Sales Price</label>
                  <input type="number" step="0.01" value={formData.ItemSalesPrice} onChange={e => setFormData({...formData, ItemSalesPrice: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Purchase Ledger ID</label>
                  <input type="number" value={formData.ItemPurchaseGL} onChange={e => setFormData({...formData, ItemPurchaseGL: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Sales Ledger ID</label>
                  <input type="number" value={formData.ItemSalesGL} onChange={e => setFormData({...formData, ItemSalesGL: e.target.value})} />
                </div>
              </div>
              
              <div style={{ marginTop: '24px' }}>
                <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }}>Save to Catalog</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
