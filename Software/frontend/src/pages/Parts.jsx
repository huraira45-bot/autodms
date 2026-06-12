import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Plus } from 'lucide-react';

const API_BASE = '/api';

export default function Parts() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUOMs] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    ItemNumber: '', ItenName: '', CategoryID: '', ItemBrandId: '', UOMId: '', WHID: '',
    ItemType: 'Part', ItemSalesPrice: '', ItemPurchasePrice: ''
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [res, cat, uom, wh] = await Promise.all([
        axios.get(`${API_BASE}/items`),
        axios.get(`${API_BASE}/inventory-config/categories`),
        axios.get(`${API_BASE}/inventory-config/uoms`),
        axios.get(`${API_BASE}/inventory-config/warehouses`)
      ]);
      setItems(res.data.filter(i => i.ItemType === 'Part'));
      setCategories(cat.data);
      setUOMs(uom.data);
      setWarehouses(wh.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/items`, formData);
      setSuccess('Part added successfully!');
      setShowForm(false);
      fetchData();
    } catch (err) { setError(err.response?.data?.details || 'Error saving part'); }
  };

  return (
    <div className="page-split">
      <div className="page-split-main">
        <div className="card-header">
          <div><h1 className="page-title">Spare Parts Catalog</h1><p className="page-subtitle">Manage inventory levels and part numbers.</p></div>
          {!showForm && <button className="btn" onClick={() => setShowForm(true)}><Plus size={18} /> Add Part</button>}
        </div>
        {success && <div className="alert-success">{success}</div>}
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Part No</th><th>Description</th><th>UOM</th><th>Price</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.ItemId}>
                    <td><code>{i.ItemNumber}</code></td>
                    <td>{i.ItenName}</td>
                    <td>{i.UOMId}</td>
                    <td>PKR {parseFloat(i.ItemSalesPrice).toLocaleString()}</td>
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
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'16px'}}><h2>Register Part</h2><button onClick={()=>setShowForm(false)}>X</button></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Part Description *</label><input required value={formData.ItenName} onChange={e=>setFormData({...formData, ItenName:e.target.value})}/></div>
              <div className="form-group"><label>Part Number / Barcode</label><input value={formData.ItemNumber} onChange={e=>setFormData({...formData, ItemNumber:e.target.value})}/></div>
              <div className="form-group"><label>UOM *</label>
                <select required value={formData.UOMId} onChange={e=>setFormData({...formData, UOMId:e.target.value})}>
                  <option value="">Select...</option>{uoms.map(u=><option key={u.UOMId} value={u.UOMId}>{u.UOMName}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Warehouse</label>
                <select value={formData.WHID} onChange={e=>setFormData({...formData, WHID:e.target.value})}>
                  <option value="">Select...</option>{warehouses.map(w=><option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Sales Price</label><input type="number" value={formData.ItemSalesPrice} onChange={e=>setFormData({...formData, ItemSalesPrice:e.target.value})}/></div>
              <button type="submit" className="btn" style={{width:'100%', marginTop:'16px'}}>Save Part</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
