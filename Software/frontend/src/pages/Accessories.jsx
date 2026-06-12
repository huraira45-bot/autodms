import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, Save, X, Loader2, Package } from 'lucide-react';

const API = '/api/accessories';

const emptyForm = { Title: '', SortOrder: 0, IsActive: true };

export default function Accessories() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const res = await axios.get(`${API}/master/all`);
      setItems(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };

  const openEdit = (item) => {
    setEditing(item.AccessoryID);
    setForm({ Title: item.Title, SortOrder: item.SortOrder || 0, IsActive: !!item.IsActive });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        payload.AccessoryID = editing;
        await axios.put(`${API}/master/${editing}`, payload);
      } else {
        await axios.post(`${API}/master`, payload);
      }
      setMsg(editing ? 'Accessory updated.' : 'Accessory added.');
      setShowForm(false);
      load();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
    setSaving(false);
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this accessory?')) return;
    try {
      await axios.delete(`${API}/master/${id}`);
      load();
    } catch (err) { alert('Error: ' + err.message); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card-header">
        <div>
          <h1 className="page-title">Accessories Master</h1>
          <p className="page-subtitle">Manage the list of accessories checked on vehicle reception.</p>
        </div>
        <button onClick={openNew} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={18} /> Add Accessory
        </button>
      </div>

      {msg && <div style={{ background: msg.startsWith('Error') ? '#fee2e2' : '#dcfce7', color: msg.startsWith('Error') ? '#b91c1c' : '#166534', padding: '8px 16px', borderRadius: 8, fontSize: '0.9rem' }}>{msg}</div>}

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Sort</th>
                <th>Accessory Title</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.AccessoryID}>
                  <td style={{ color: '#94a3b8', width: 60 }}>{item.SortOrder}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Package size={15} style={{ color: '#64748b' }} />
                      <strong>{item.Title}</strong>
                    </div>
                  </td>
                  <td>
                    <span style={{ background: item.IsActive ? '#dcfce7' : '#f1f5f9', color: item.IsActive ? '#166534' : '#94a3b8', borderRadius: 20, padding: '2px 10px', fontSize: '0.8rem', fontWeight: 600 }}>
                      {item.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(item)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}><Edit size={14} /></button>
                      {item.IsActive && (
                        <button onClick={() => handleDeactivate(item.AccessoryID)} style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No accessories found. Add some above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, width: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px 12px 0 0' }}>
              <h3>{editing ? 'Edit Accessory' : 'New Accessory'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label>Accessory Title *</label>
                <input required type="text" value={form.Title} onChange={e => setForm({ ...form, Title: e.target.value })} placeholder="e.g. Spare Tyre" />
              </div>
              <div className="form-group">
                <label>Sort Order</label>
                <input type="number" min="0" value={form.SortOrder} onChange={e => setForm({ ...form, SortOrder: parseInt(e.target.value) || 0 })} />
              </div>
              {editing && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={form.IsActive} onChange={e => setForm({ ...form, IsActive: e.target.checked })} />
                  Active
                </label>
              )}
              <button type="submit" disabled={saving} className="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {editing ? 'Update' : 'Add Accessory'}
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
