import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Car, Plus } from 'lucide-react';

const API_BASE = '/api';

export default function Vehicles() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUOMs] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    ItemNumber: '', ItenName: '', CategoryID: '', ItemBrandId: '', UOMId: '', WHID: '',
    ItemType: 'Vehicle', Make: '', ItemModel: '', SerialNo: '',
    ItemSalesPrice: '', ItemPurchasePrice: '', ItemPurchaseGL: '', ItemSalesGL: ''
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
      setItems(res.data.filter(i => i.ItemType === 'Vehicle'));
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
      setSuccess('Vehicle added successfully!');
      setShowForm(false);
      fetchData();
    } catch (err) { setError(err.response?.data?.details || 'Error saving vehicle'); }
  };

  return (
    <div className="page-split">
      <div className="page-split-main">
        <div className="card-header">
          <div><h1 className="page-title">Vehicle Inventory</h1><p className="page-subtitle">Manage showroom stock and vehicle specifications.</p></div>
          {!showForm && <button className="btn" onClick={() => setShowForm(true)}><Plus size={18} /> Add Vehicle</button>}
        </div>
        {success && <div className="alert-success">{success}</div>}
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Make/Model</th><th>Chassis No</th><th>Price</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.ItemId}>
                    <td><strong>{i.Make} {i.ItemModel}</strong><br/><small>{i.ItenName}</small></td>
                    <td>{i.SerialNo}</td>
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
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'16px'}}><h2>Register Vehicle</h2><button onClick={()=>setShowForm(false)}>X</button></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Vehicle Name/Description *</label><input required value={formData.ItenName} onChange={e=>setFormData({...formData, ItenName:e.target.value})}/></div>
              <div className="form-group"><label>Make *</label><input required value={formData.Make} onChange={e=>setFormData({...formData, Make:e.target.value})}/></div>
              <div className="form-group"><label>Model *</label><input required value={formData.ItemModel} onChange={e=>setFormData({...formData, ItemModel:e.target.value})}/></div>
              <div className="form-group"><label>Chassis/Serial No *</label><input required value={formData.SerialNo} onChange={e=>setFormData({...formData, SerialNo:e.target.value})}/></div>
              <div className="form-group"><label>Category</label>
                <select value={formData.CategoryID} onChange={e=>setFormData({...formData, CategoryID:e.target.value})}>
                  <option value="">Select...</option>{categories.map(c=><option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Warehouse</label>
                <select value={formData.WHID} onChange={e=>setFormData({...formData, WHID:e.target.value})}>
                  <option value="">Select...</option>{warehouses.map(w=><option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Sales Price</label><input type="number" value={formData.ItemSalesPrice} onChange={e=>setFormData({...formData, ItemSalesPrice:e.target.value})}/></div>
              <button type="submit" className="btn" style={{width:'100%', marginTop:'16px'}}>Save Vehicle</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
