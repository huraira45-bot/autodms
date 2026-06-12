import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { ExternalLink, Search, Plus, Trash2, Save, Loader2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Edit2, Lock } from 'lucide-react';

const API = '/api/workshop';

export default function SubletRepair() {
  const [allSublets, setAllSublets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ Remarks: '', InvoiceAmount: 0, PayableAmount: 0, SubletJobDate: new Date().toISOString().slice(0, 10), JobCardId: '' });

  // Job card search for "Add New" modal
  const [jobSearch, setJobSearch] = useState('');
  const [jobResults, setJobResults] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/sublets`);
      setAllSublets(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Client-side filter
  const filtered = useMemo(() => {
    if (!search.trim()) return allSublets;
    const q = search.toLowerCase();
    return allSublets.filter(s =>
      (s.Remarks || '').toLowerCase().includes(q) ||
      (s.VehicleRegNo || '').toLowerCase().includes(q) ||
      String(s.JobCardNo || '').includes(q) ||
      (s.CustomerName || '').toLowerCase().includes(q)
    );
  }, [allSublets, search]);

  // Reset cursor to 0 (most recent) when filter changes
  useEffect(() => { setCursor(0); }, [search]);

  const current = filtered[cursor] || null;
  const total = filtered.length;

  const goFirst = () => setCursor(0);
  const goPrev = () => setCursor(c => Math.max(0, c - 1));
  const goNext = () => setCursor(c => Math.min(total - 1, c + 1));
  const goLast = () => setCursor(total - 1);

  // Job card search for modal
  const searchJobs = async (val) => {
    setJobSearch(val);
    if (val.length < 2) { setJobResults([]); return; }
    try { const res = await axios.get(`${API}/job-cards?search=${val}`); setJobResults(res.data); } catch { setJobResults([]); }
  };

  const pickJob = (job) => {
    setSelectedJob(job);
    setForm(f => ({ ...f, JobCardId: job.JobCardId }));
    setJobSearch(job.JobCardNo + ' — ' + (job.VehicleRegNo || ''));
    setJobResults([]);
  };

  const openNew = () => {
    setEditing(null);
    setSelectedJob(null);
    setJobSearch('');
    setJobResults([]);
    setForm({ Remarks: '', InvoiceAmount: 0, PayableAmount: 0, SubletJobDate: new Date().toISOString().slice(0, 10), JobCardId: '' });
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s.SubletJobDetailID);
    setSelectedJob({ JobCardId: s.JobCardId, JobCardNo: s.JobCardNo, VehicleRegNo: s.VehicleRegNo, CustomerName: s.CustomerName });
    setJobSearch(`JC-${s.JobCardNo} — ${s.VehicleRegNo || ''}`);
    setJobResults([]);
    setForm({
      Remarks: s.Remarks || '',
      InvoiceAmount: s.InvoiceAmount || 0,
      PayableAmount: s.PayableAmount || 0,
      SubletJobDate: s.SubletJobDate ? new Date(s.SubletJobDate).toISOString().slice(0, 10) : '',
      JobCardId: s.JobCardId
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.JobCardId) { alert('Please select a Job Card.'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/sublets`, { ...form, SubletJobDetailID: editing });
      setShowForm(false);
      await loadAll();
      setCursor(0); // jump to most recent after save
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this sublet entry?')) return;
    try {
      await axios.delete(`${API}/sublets/${id}`);
      await loadAll();
      setCursor(c => Math.min(c, filtered.length - 2));
    } catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card-header">
        <div>
          <h1 className="page-title">Sublet Repairs</h1>
          <p className="page-subtitle">Outsourced repair work sent to external vendors.</p>
        </div>
        <button onClick={openNew} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Sublet
        </button>
      </div>

      {/* Search */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by description, registration no, job card no, customer..."
            style={{ width: '100%', padding: '10px 14px 10px 38px', border: '2px solid var(--primary)', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={16} />
            </button>
          )}
        </div>
        {search && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{total} result{total !== 1 ? 's' : ''} found</div>}
      </div>

      {/* Detail Card + Navigation */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><Loader2 className="animate-spin" /></div>
      ) : total === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
          <ExternalLink size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{search ? 'No results match your search.' : 'No sublet entries yet.'}</div>
          {!search && <div style={{ fontSize: 13 }}>Click "Add Sublet" to create the first entry.</div>}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Navigation bar */}
          <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <NavBtn onClick={goFirst} disabled={cursor === 0} title="First"><ChevronsLeft size={16} /></NavBtn>
              <NavBtn onClick={goPrev} disabled={cursor === 0} title="Previous"><ChevronLeft size={16} /></NavBtn>
              <span style={{ margin: '0 12px', fontSize: 13, color: '#475569', fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
                {cursor + 1} / {total}
              </span>
              <NavBtn onClick={goNext} disabled={cursor >= total - 1} title="Next"><ChevronRight size={16} /></NavBtn>
              <NavBtn onClick={goLast} disabled={cursor >= total - 1} title="Last"><ChevronsRight size={16} /></NavBtn>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {current.IsFinalized ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                  <Lock size={13} /> Finalized — read only
                </span>
              ) : (
                <>
                  <button onClick={() => openEdit(current)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>
                    <Edit2 size={14} /> Edit
                  </button>
                  <button onClick={() => handleDelete(current.SubletJobDetailID)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'white', border: '1px solid #fee2e2', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#ef4444', fontWeight: 600 }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Record detail */}
          <div style={{ padding: '24px 28px' }}>
            {/* Job card info banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '12px 16px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 20 }}>
              <div><span style={{ fontSize: 11, color: '#92400e', display: 'block' }}>JOB CARD</span><strong style={{ fontFamily: 'monospace', color: '#92400e' }}>JC-{current.JobCardNo || current.JobCardId}</strong></div>
              <div style={{ width: 1, height: 32, background: '#fde68a' }} />
              <div><span style={{ fontSize: 11, color: '#92400e', display: 'block' }}>CUSTOMER</span><strong>{current.CustomerName || '—'}</strong></div>
              <div style={{ width: 1, height: 32, background: '#fde68a' }} />
              <div><span style={{ fontSize: 11, color: '#92400e', display: 'block' }}>REG NO</span><strong style={{ fontFamily: 'monospace' }}>{current.VehicleRegNo || '—'}</strong></div>
              <div style={{ width: 1, height: 32, background: '#fde68a' }} />
              <div><span style={{ fontSize: 11, color: '#92400e', display: 'block' }}>DATE</span><strong>{current.SubletJobDate ? new Date(current.SubletJobDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</strong></div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Work Description</div>
              <div style={{ fontSize: 15, color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{current.Remarks || '—'}</div>
            </div>

            {/* Amounts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 420 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 18px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Invoice Amount</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>PKR {parseFloat(current.InvoiceAmount || 0).toLocaleString()}</div>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 18px' }}>
                <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Payable Amount</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#166534' }}>PKR {parseFloat(current.PayableAmount || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '520px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '16px 20px', background: '#fefce8', borderBottom: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px 12px 0 0' }}>
              <h3 style={{ margin: 0 }}>{editing ? 'Edit Sublet Entry' : 'New Sublet Repair'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Job card picker */}
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Job Card *</label>
                <input
                  type="text"
                  value={jobSearch}
                  onChange={e => { setSelectedJob(null); setForm(f => ({ ...f, JobCardId: '' })); searchJobs(e.target.value); }}
                  placeholder="Search job card by no, reg, customer..."
                  readOnly={!!editing}
                  style={{ width: '100%', background: editing ? '#f8fafc' : undefined }}
                />
                {jobResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 200, overflow: 'auto', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {jobResults.map(j => (
                      <div key={j.JobCardId} onMouseDown={() => pickJob(j)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>JC-{j.JobCardNo}</strong> — {j.CustomerName || 'N/A'}</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{j.VehicleRegNo}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedJob && (
                  <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                    ✓ {selectedJob.CustomerName} — {selectedJob.VehicleRegNo}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Work Description / Vendor Details *</label>
                <textarea rows="3" required value={form.Remarks} onChange={e => setForm({ ...form, Remarks: e.target.value })} placeholder="e.g. Windscreen replacement - ABC Auto Glass" style={{ width: '100%', resize: 'vertical' }} />
              </div>

              <div className="grid-2">
                <div className="form-group"><label>Invoice Amount (PKR)</label><input type="number" value={form.InvoiceAmount} onChange={e => setForm({ ...form, InvoiceAmount: e.target.value })} /></div>
                <div className="form-group"><label>Payable Amount (PKR)</label><input type="number" value={form.PayableAmount} onChange={e => setForm({ ...form, PayableAmount: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Date</label><input type="date" value={form.SubletJobDate} onChange={e => setForm({ ...form, SubletJobDate: e.target.value })} /></div>

              <button type="submit" className="btn" disabled={saving} style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {editing ? 'Update' : 'Add Sublet'}
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

function NavBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid #e2e8f0', borderRadius: 6, background: disabled ? '#f8fafc' : 'white',
        color: disabled ? '#cbd5e1' : '#374151', cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s'
      }}
    >
      {children}
    </button>
  );
}
