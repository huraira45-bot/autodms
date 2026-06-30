import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, Save, X, Loader2, Package } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { EmptyState, StatusPill } from '../components/UXPrimitives';

const API = '/api/accessories';

const emptyForm = { Title: '', SortOrder: 0, IsActive: true };

export default function Accessories() {
  const { notify, confirm } = useFeedback();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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
      notify({ type: 'success', title: editing ? 'Accessory updated' : 'Accessory added', message: form.Title });
      setShowForm(false);
      load();
    } catch (err) {
      notify({ type: 'error', title: 'Could not save accessory', message: err.response?.data?.error || err.message });
    }
    setSaving(false);
  };

  const handleDeactivate = async (id) => {
    const ok = await confirm({
      title: 'Deactivate accessory?',
      message: 'This accessory will no longer be available for new vehicle reception checks.',
      confirmLabel: 'Deactivate',
      tone: 'warning'
    });
    if (!ok) return;
    try {
      await axios.delete(`${API}/master/${id}`);
      notify({ type: 'success', title: 'Accessory deactivated' });
      load();
    } catch (err) {
      notify({ type: 'error', title: 'Could not deactivate accessory', message: err.response?.data?.error || err.message });
    }
  };

  if (loading) return <div className="loading-state"><Loader2 size={28} className="animate-spin" /> Loading accessories...</div>;

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
                    <StatusPill tone={item.IsActive ? 'green' : 'slate'}>{item.IsActive ? 'Active' : 'Inactive'}</StatusPill>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(item)} className="btn-icon" title="Edit accessory"><Edit size={14} /></button>
                      {item.IsActive && (
                        <button onClick={() => handleDeactivate(item.AccessoryID)} className="btn-icon" title="Deactivate accessory" style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="table-empty-row">
                    <EmptyState
                      icon={Package}
                      title="No accessories found"
                      message="Add accessories that should be checked during vehicle reception."
                      action={<button className="btn-sm" onClick={openNew}><Plus size={14} /> Add Accessory</button>}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ width: 400 }}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Accessory' : 'New Accessory'}</h3>
              <button onClick={() => setShowForm(false)}><X size={20} /></button>
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
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editing ? 'Update' : 'Add Accessory'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
