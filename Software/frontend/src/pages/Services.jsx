import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Wrench, Plus } from 'lucide-react';

const API_BASE = '/api';

export default function Services() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    ItenName: '', ItemType: 'Service', ItemSalesPrice: '', UOMId: 1 // Default to Units
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/items`);
      setItems(res.data.filter(i => i.ItemType === 'Service'));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/items`, formData);
      setSuccess('Service added successfully!');
      setShowForm(false);
      fetchData();
    } catch (err) { setError(err.response?.data?.details || 'Error saving service'); }
  };

  return (
    <div className="page-split">
      <div className="page-split-main">
        <div className="card-header">
          <div><h1 className="page-title">Labor & Services</h1><p className="page-subtitle">Manage standard labor rates and service packages.</p></div>
          {!showForm && <button className="btn" onClick={() => setShowForm(true)}><Plus size={18} /> Add Service</button>}
        </div>
        {success && <div className="alert-success">{success}</div>}
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Service Name</th><th>Standard Rate</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.ItemId}>
                    <td><strong>{i.ItenName}</strong></td>
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
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'16px'}}><h2>Register Service</h2><button onClick={()=>setShowForm(false)}>X</button></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Service Description *</label><input required value={formData.ItenName} onChange={e=>setFormData({...formData, ItenName:e.target.value})}/></div>
              <div className="form-group"><label>Standard Labor Rate</label><input type="number" value={formData.ItemSalesPrice} onChange={e=>setFormData({...formData, ItemSalesPrice:e.target.value})}/></div>
              <button type="submit" className="btn" style={{width:'100%', marginTop:'16px'}}>Save Service</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
