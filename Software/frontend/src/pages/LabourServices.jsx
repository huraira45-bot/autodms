import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Wrench, Plus, Edit, X, Search, ChevronDown, ChevronRight, Building2 } from 'lucide-react';

const API_BASE = '/api';

export default function LabourServices() {
  const [items, setItems] = useState([]);
  const [jobTypes, setJobTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ItenName: '', ItemSalesPrice: '', JobTypeID: '', ItemType: 'Service', UOMId: 1 });
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [itemRes, jtRes] = await Promise.all([
        axios.get(`${API_BASE}/items`),
        axios.get(`${API_BASE}/workshop/job-types`)
      ]);
      setItems(itemRes.data.filter(i => i.ItemType === 'Service'));
      setJobTypes(jtRes.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i => (i.ItenName || '').toLowerCase().includes(q));
  }, [items, search]);

  // Group by job type (business unit)
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(item => {
      const key = item.JobTypeID || 0;
      const label = item.JobTypeCode ? `${item.JobTypeCode} — ${item.JobTypeName}` : (item.JobTypeName || 'Unassigned');
      if (!map[key]) map[key] = { JobTypeID: key, label, items: [] };
      map[key].items.push(item);
    });
    return Object.values(map).sort((a, b) => {
      if (!a.JobTypeID) return 1;
      if (!b.JobTypeID) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [filtered]);

  const toggleSection = (key) => setCollapsed(c => ({ ...c, [key]: !c[key] }));

  const jobTypeLabel = (jt) => jt.CardCode ? `${jt.CardCode} — ${jt.Title}` : jt.Title;

  const openNew = () => {
    setEditing(null);
    setForm({ ItenName: '', ItemSalesPrice: '', JobTypeID: '', ItemType: 'Service', UOMId: 1 });
    setShowForm(true);
    setSuccess('');
  };

  const openEdit = (item) => {
    setEditing(item.ItemId);
    setForm({
      ItenName: item.ItenName,
      ItemSalesPrice: item.ItemSalesPrice || '',
      JobTypeID: item.JobTypeID || '',
      ItemType: 'Service',
      UOMId: item.UOMId || 1
    });
    setShowForm(true);
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`${API_BASE}/items/${editing}`, form);
      } else {
        await axios.post(`${API_BASE}/items`, form);
      }
      setSuccess(editing ? 'Service updated!' : 'Service added!');
      setShowForm(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { alert('Error: ' + (err.response?.data?.details || err.response?.data?.error || err.message)); }
  };

  const totalServices = filtered.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card-header">
        <div>
          <h1 className="page-title">Labour & Services</h1>
          <p className="page-subtitle">Standard labour operations and rates, grouped by business unit.</p>
        </div>
        <button className="btn" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Add Service
        </button>
      </div>

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px 16px', borderRadius: '8px', color: '#166534', fontWeight: 500 }}>
          {success}
        </div>
      )}

      {/* Search */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search services..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.9rem' }}
        />
        <span style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap' }}>
          {totalServices} service{totalServices !== 1 ? 's' : ''} · {grouped.length} unit{grouped.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grouped sections */}
      {grouped.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
          <Wrench size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {search ? 'No services match your search.' : 'No services defined yet.'}
          </div>
          {!search && <div style={{ fontSize: 13 }}>Click "Add Service" to get started.</div>}
        </div>
      ) : (
        grouped.map(group => {
          const isCollapsed = collapsed[group.JobTypeID];
          return (
            <div key={group.JobTypeID} className="card" style={{ overflow: 'hidden' }}>
              {/* Section header */}
              <div
                onClick={() => toggleSection(group.JobTypeID)}
                style={{
                  padding: '14px 20px', background: group.JobTypeID ? '#f0f9ff' : '#f8fafc',
                  borderBottom: isCollapsed ? 'none' : '1px solid #e2e8f0',
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                {isCollapsed ? <ChevronRight size={16} style={{ color: '#64748b' }} /> : <ChevronDown size={16} style={{ color: '#64748b' }} />}
                <Building2 size={16} style={{ color: group.JobTypeID ? '#0284c7' : '#94a3b8' }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: group.JobTypeID ? '#0c4a6e' : '#64748b', flex: 1 }}>
                  {group.label}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                  background: group.JobTypeID ? '#e0f2fe' : '#f1f5f9',
                  color: group.JobTypeID ? '#0284c7' : '#64748b'
                }}>
                  {group.items.length} service{group.items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Rows */}
              {!isCollapsed && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ padding: '8px 20px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 600 }}>Service / Labour Description</th>
                      <th style={{ padding: '8px 20px', textAlign: 'right', fontSize: 12, color: '#64748b', fontWeight: 600, width: 180 }}>Standard Rate (PKR)</th>
                      <th style={{ padding: '8px 16px', width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item, idx) => (
                      <tr
                        key={item.ItemId}
                        style={{ borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', background: 'white' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        <td style={{ padding: '11px 20px', fontWeight: 500, color: '#1e293b' }}>{item.ItenName}</td>
                        <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>
                          {parseFloat(item.ItemSalesPrice || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => openEdit(item)}
                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#64748b' }}
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '480px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '16px 20px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px 12px 0 0' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wrench size={18} /> {editing ? 'Edit Service' : 'Add New Service'}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label>Business Type *</label>
                <select
                  required
                  value={form.JobTypeID}
                  onChange={e => setForm({ ...form, JobTypeID: e.target.value })}
                >
                  <option value="" disabled>Select business type...</option>
                  {jobTypes.map(jt => (
                    <option key={jt.JobCardTypeId} value={jt.JobCardTypeId}>
                      {jt.CardCode} — {jt.Title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Service / Labour Description *</label>
                <input
                  required
                  type="text"
                  value={form.ItenName}
                  onChange={e => setForm({ ...form, ItenName: e.target.value })}
                  placeholder="e.g. Oil & Filter Change, Brake Pad Replacement"
                />
              </div>
              <div className="form-group">
                <label>Standard Rate (PKR) *</label>
                <input
                  required
                  type="number"
                  value={form.ItemSalesPrice}
                  onChange={e => setForm({ ...form, ItemSalesPrice: e.target.value })}
                  placeholder="e.g. 2500"
                />
              </div>
              <button type="submit" className="btn" style={{ width: '100%', marginTop: '4px' }}>
                {editing ? 'Update Service' : 'Save Service'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
