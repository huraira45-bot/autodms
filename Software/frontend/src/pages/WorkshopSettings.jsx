import { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, Plus, Edit, Trash2, X, Briefcase, Tags, Loader2, Hash, LayoutGrid } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import SearchableSelect from '../components/SearchableSelect';

const API = '/api/workshop';

export default function WorkshopSettings() {
  const { notify, confirm } = useFeedback();
  const [jobTypes, setJobTypes] = useState([]);
  const [orderTypes, setOrderTypes] = useState([]);
  const [roCounters, setRoCounters] = useState([]);
  const [docCounters, setDocCounters] = useState([]);
  const [bays, setBays] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editingCounter, setEditingCounter] = useState(null);
  const [counterVal, setCounterVal] = useState('');
  const [loading, setLoading] = useState(true);

  // Bay Modal State
  const [showBayModal, setShowBayModal] = useState(false);
  const [bayForm, setBayForm] = useState({ BayID: '', BayName: '' });

  // Job Type Modal State
  const [showJTModal, setShowJTModal] = useState(false);
  const [jtForm, setJtForm] = useState({ JobCardTypeId: '', CardCode: '', Title: '' });

  // Order Type Modal State
  const [showOTModal, setShowOTModal] = useState(false);
  const [otForm, setOtForm] = useState({ OrderTypeId: '', OrderTypeName: '' });

  const showError = (title, err) => {
    notify({ type: 'error', title, message: err.response?.data?.error || err.response?.data?.details || err.message });
  };

  const fetchData = async () => {
    try {
      const [jtRes, otRes, roRes, docRes, bayRes, empRes] = await Promise.all([
        axios.get(`${API}/job-types`),
        axios.get(`${API}/order-types`),
        axios.get(`${API}/ro-counters`),
        axios.get(`${API}/doc-counters`),
        axios.get(`${API}/bays/all`),
        axios.get('/api/employees').catch(() => ({ data: [] }))
      ]);
      setJobTypes(jtRes.data);
      setOrderTypes(otRes.data);
      setRoCounters(roRes.data);
      setDocCounters(docRes.data);
      setBays(bayRes.data);
      setEmployees(empRes.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- Handlers for Business (Job) Types ---
  const saveJT = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/job-types`, jtForm);
      setShowJTModal(false);
      notify({ type: 'success', title: 'Business type saved', message: jtForm.Title || jtForm.CardCode });
      fetchData();
    } catch (err) { showError('Could not save business type', err); }
  };

  const deleteJT = async (id) => {
    const ok = await confirm({
      title: 'Delete business type?',
      message: 'This removes the business type if it is not already used by job cards.',
      confirmLabel: 'Delete',
      tone: 'danger'
    });
    if(!ok) return;
    try {
      await axios.delete(`${API}/job-types/${id}`);
      notify({ type: 'success', title: 'Business type deleted' });
      fetchData();
    } catch (err) { showError('Could not delete business type', err); }
  };

  // --- Handlers for Order Types ---
  const saveOT = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/order-types`, otForm);
      setShowOTModal(false);
      notify({ type: 'success', title: 'Order type saved', message: otForm.OrderTypeName });
      fetchData();
    } catch (err) { showError('Could not save order type', err); }
  };

  const deleteOT = async (id) => {
    const ok = await confirm({
      title: 'Delete order type?',
      message: 'This removes the order type if it is not already used by workshop records.',
      confirmLabel: 'Delete',
      tone: 'danger'
    });
    if(!ok) return;
    try {
      await axios.delete(`${API}/order-types/${id}`);
      notify({ type: 'success', title: 'Order type deleted' });
      fetchData();
    } catch (err) { showError('Could not delete order type', err); }
  };

  const saveCounter = async (type, code) => {
    try {
      const url = type === 'ro'
        ? `${API}/ro-counters/${code}`
        : `${API}/doc-counters/${code}`;
      await axios.put(url, { CurrentCounter: parseInt(counterVal) });
      setEditingCounter(null);
      notify({ type: 'success', title: 'Counter updated', message: `${code} next number was changed.` });
      fetchData();
    } catch (err) { showError('Could not update counter', err); }
  };

  // --- Handlers for Bays ---
  const saveBay = async (e) => {
    e.preventDefault();
    try {
      if (bayForm.BayID) {
        await axios.put(`${API}/bays/${bayForm.BayID}`, bayForm);
      } else {
        await axios.post(`${API}/bays`, bayForm);
      }
      setShowBayModal(false);
      notify({ type: 'success', title: 'Bay saved', message: bayForm.BayName });
      fetchData();
    } catch (err) { showError('Could not save bay', err); }
  };

  const deactivateBay = async (id) => {
    const ok = await confirm({
      title: 'Deactivate bay?',
      message: 'The bay will no longer appear in Job Controller assignment lists.',
      confirmLabel: 'Deactivate',
      tone: 'warning'
    });
    if (!ok) return;
    try {
      await axios.delete(`${API}/bays/${id}`);
      notify({ type: 'success', title: 'Bay deactivated' });
      fetchData();
    } catch (err) { showError('Could not deactivate bay', err); }
  };

  if (loading) return <div className="loading-state"><Loader2 className="animate-spin" /> Loading workshop settings...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <div className="card-header">
        <div>
          <h1 className="page-title">Workshop Master Settings</h1>
          <p className="page-subtitle">Configure Business Types and Order Types used in Job Cards.</p>
        </div>
        <Settings size={28} style={{color:'#cbd5e1'}} />
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
        {/* Business Types Panel */}
        <div className="card">
          <div style={{padding:'16px',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h3 style={{display:'flex',alignItems:'center',gap:'8px',margin:0,color:'var(--primary)'}}><Briefcase size={18} /> Business Types (Job Types)</h3>
            <button onClick={() => { setJtForm({JobCardTypeId:'',CardCode:'',Title:''}); setShowJTModal(true); }} className="btn" style={{padding:'6px 12px',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:'4px'}}><Plus size={14}/> Add New</button>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f8fafc',textAlign:'left',fontSize:'0.85rem',color:'#64748b'}}>
                <th style={{padding:'10px 16px'}}>Code</th>
                <th style={{padding:'10px 16px'}}>Title</th>
                <th style={{padding:'10px 16px'}}>L0 Manager (CRO)</th>
                <th style={{padding:'10px 16px'}}>GL Mapping</th>
                <th style={{padding:'10px 16px',width:'80px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobTypes.map(j => (
                <tr key={j.JobCardTypeId} style={{borderBottom:'1px solid #e2e8f0'}}>
                  <td style={{padding:'10px 16px',fontWeight:600}}>{j.CardCode}</td>
                  <td style={{padding:'10px 16px'}}>{j.Title}</td>
                  <td style={{padding:'8px 16px'}}>
                    <JobTypeManagerPicker jt={j} employees={employees} onSaved={fetchData} notify={notify} />
                  </td>
                  <td style={{padding:'8px 16px'}}>
                    <JobTypeGLPicker jt={j} onSaved={fetchData} notify={notify} />
                  </td>
                  <td style={{padding:'10px 16px',display:'flex',gap:'8px'}}>
                    <button onClick={() => { setJtForm(j); setShowJTModal(true); }} style={{background:'none',border:'none',color:'#3b82f6',cursor:'pointer'}}><Edit size={16}/></button>
                    <button onClick={() => deleteJT(j.JobCardTypeId)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer'}}><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
              {jobTypes.length === 0 && <tr><td colSpan="5" style={{padding:'20px',textAlign:'center',color:'#94a3b8'}}>No Business Types found.</td></tr>}
            </tbody>
          </table>
          <div style={{padding:'10px 16px',fontSize:'0.75rem',color:'#64748b',background:'#f8fafc',borderTop:'1px solid #e2e8f0'}}>
            The L0 Manager is notified for every CRO complaint filed against a JC of this business type.
          </div>
        </div>

        {/* Order Types Panel */}
        <div className="card">
          <div style={{padding:'16px',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h3 style={{display:'flex',alignItems:'center',gap:'8px',margin:0,color:'var(--primary)'}}><Tags size={18} /> Order Types</h3>
            <button onClick={() => { setOtForm({OrderTypeId:'',OrderTypeName:''}); setShowOTModal(true); }} className="btn" style={{padding:'6px 12px',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:'4px'}}><Plus size={14}/> Add New</button>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'#f8fafc',textAlign:'left',fontSize:'0.85rem',color:'#64748b'}}><th style={{padding:'10px 16px'}}>Order Type Name</th><th style={{padding:'10px 16px',width:'80px'}}>Actions</th></tr></thead>
            <tbody>
              {orderTypes.map(o => (
                <tr key={o.OrderTypeId} style={{borderBottom:'1px solid #e2e8f0'}}>
                  <td style={{padding:'10px 16px',fontWeight:600}}>{o.OrderTypeName}</td>
                  <td style={{padding:'10px 16px',display:'flex',gap:'8px'}}>
                    <button onClick={() => { setOtForm(o); setShowOTModal(true); }} style={{background:'none',border:'none',color:'#3b82f6',cursor:'pointer'}}><Edit size={16}/></button>
                    <button onClick={() => deleteOT(o.OrderTypeId)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer'}}><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
              {orderTypes.length === 0 && <tr><td colSpan="2" style={{padding:'20px',textAlign:'center',color:'#94a3b8'}}>No Order Types found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bays Panel */}
      <div className="card">
        <div style={{padding:'16px',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{display:'flex',alignItems:'center',gap:'8px',margin:0,color:'var(--primary)'}}><LayoutGrid size={18} /> Workshop Bays</h3>
          <button onClick={() => { setBayForm({ BayID: '', BayName: '' }); setShowBayModal(true); }} className="btn" style={{padding:'6px 12px',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:'4px'}}><Plus size={14}/> Add Bay</button>
        </div>
        <div style={{padding:'16px',display:'flex',flexWrap:'wrap',gap:'10px'}}>
          {bays.map(b => (
            <div key={b.BayID} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 14px',borderRadius:'8px',border:'1px solid #e2e8f0',background: b.IsActive ? '#f0fdf4' : '#f8fafc',minWidth:'160px'}}>
              <span style={{fontWeight:600,color: b.IsActive ? '#16a34a' : '#94a3b8',flex:1}}>{b.BayName}</span>
              {!b.IsActive && <span style={{fontSize:10,color:'#94a3b8',border:'1px solid #e2e8f0',borderRadius:4,padding:'1px 5px'}}>Inactive</span>}
              <button onClick={() => { setBayForm({ BayID: b.BayID, BayName: b.BayName }); setShowBayModal(true); }} style={{background:'none',border:'none',color:'#3b82f6',cursor:'pointer',padding:2}}><Edit size={14}/></button>
              {b.IsActive && <button onClick={() => deactivateBay(b.BayID)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',padding:2}} title="Deactivate"><Trash2 size={14}/></button>}
            </div>
          ))}
          {bays.length === 0 && <span style={{color:'#94a3b8',fontSize:14}}>No bays found.</span>}
        </div>
      </div>

      {/* RO & Doc Counters */}
      <div className="card">
        <div style={{padding:'16px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:'8px'}}>
          <Hash size={18} style={{color:'var(--primary)'}} />
          <h3 style={{margin:0,color:'var(--primary)'}}>RO / Document Counters</h3>
          <span style={{fontSize:12,color:'#94a3b8',marginLeft:4}}>— Admin: set the starting number for each series</span>
        </div>
        <div style={{padding:'16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'#64748b',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Job Card (RO) Counters</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#f8fafc'}}>
                <th style={{padding:'8px 12px',textAlign:'left',color:'#64748b'}}>Code</th>
                <th style={{padding:'8px 12px',textAlign:'left',color:'#64748b'}}>Title</th>
                <th style={{padding:'8px 12px',textAlign:'right',color:'#64748b'}}>Next No.</th>
                <th style={{padding:'8px 12px',width:80}}></th>
              </tr></thead>
              <tbody>{roCounters.map(r => (
                <tr key={r.CardCode} style={{borderBottom:'1px solid #f1f5f9'}}>
                  <td style={{padding:'8px 12px',fontWeight:700,fontFamily:'monospace',color:'var(--primary)'}}>{r.CardCode}</td>
                  <td style={{padding:'8px 12px'}}>{r.Title || '—'}</td>
                  <td style={{padding:'8px 12px',textAlign:'right'}}>
                    {editingCounter === `ro_${r.CardCode}` ? (
                      <input type="number" value={counterVal} onChange={e=>setCounterVal(e.target.value)}
                        style={{width:80,padding:'4px 8px',border:'1px solid #3b82f6',borderRadius:4,textAlign:'right',fontWeight:700}} autoFocus />
                    ) : (
                      <span style={{fontWeight:700,fontFamily:'monospace'}}>{r.CardCode}-{String(r.CurrentCounter+1).padStart(4,'0')}</span>
                    )}
                  </td>
                  <td style={{padding:'8px 12px',textAlign:'right'}}>
                    {editingCounter === `ro_${r.CardCode}` ? (
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button onClick={() => saveCounter('ro', r.CardCode)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:4,padding:'4px 8px',cursor:'pointer',fontSize:11,fontWeight:600}}>Save</button>
                        <button onClick={() => setEditingCounter(null)} style={{background:'#e2e8f0',color:'#475569',border:'none',borderRadius:4,padding:'4px 8px',cursor:'pointer',fontSize:11}}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingCounter(`ro_${r.CardCode}`); setCounterVal(r.CurrentCounter); }}
                        style={{background:'none',border:'1px solid #e2e8f0',borderRadius:4,padding:'4px 8px',cursor:'pointer',color:'#3b82f6',fontSize:11,fontWeight:600}}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'#64748b',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>GRN / GRTN Counters</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#f8fafc'}}>
                <th style={{padding:'8px 12px',textAlign:'left',color:'#64748b'}}>Series</th>
                <th style={{padding:'8px 12px',textAlign:'right',color:'#64748b'}}>Next No.</th>
                <th style={{padding:'8px 12px',width:80}}></th>
              </tr></thead>
              <tbody>{docCounters.map(d => (
                <tr key={d.DocType} style={{borderBottom:'1px solid #f1f5f9'}}>
                  <td style={{padding:'8px 12px',fontWeight:700,fontFamily:'monospace',color:'#d97706'}}>{d.DocType}</td>
                  <td style={{padding:'8px 12px',textAlign:'right'}}>
                    {editingCounter === `doc_${d.DocType}` ? (
                      <input type="number" value={counterVal} onChange={e=>setCounterVal(e.target.value)}
                        style={{width:80,padding:'4px 8px',border:'1px solid #3b82f6',borderRadius:4,textAlign:'right',fontWeight:700}} autoFocus />
                    ) : (
                      <span style={{fontWeight:700,fontFamily:'monospace'}}>{d.DocType}-{String(d.CurrentCounter+1).padStart(4,'0')}</span>
                    )}
                  </td>
                  <td style={{padding:'8px 12px',textAlign:'right'}}>
                    {editingCounter === `doc_${d.DocType}` ? (
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button onClick={() => saveCounter('doc', d.DocType)} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:4,padding:'4px 8px',cursor:'pointer',fontSize:11,fontWeight:600}}>Save</button>
                        <button onClick={() => setEditingCounter(null)} style={{background:'#e2e8f0',color:'#475569',border:'none',borderRadius:4,padding:'4px 8px',cursor:'pointer',fontSize:11}}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingCounter(`doc_${d.DocType}`); setCounterVal(d.CurrentCounter); }}
                        style={{background:'none',border:'1px solid #e2e8f0',borderRadius:4,padding:'4px 8px',cursor:'pointer',color:'#3b82f6',fontSize:11,fontWeight:600}}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>

      {/* JT Modal */}
      {showJTModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{width:'400px'}}>
            <div className="modal-header"><h3>{jtForm.JobCardTypeId ? 'Edit' : 'Add'} Business Type</h3><button onClick={()=>setShowJTModal(false)}><X size={20}/></button></div>
            <form onSubmit={saveJT} style={{padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
              <div className="form-group"><label>Code Prefix (e.g. GR) *</label><input required type="text" value={jtForm.CardCode} onChange={e=>setJtForm({...jtForm, CardCode: e.target.value.toUpperCase()})} /></div>
              <div className="form-group"><label>Title (e.g. General Repair) *</label><input required type="text" value={jtForm.Title} onChange={e=>setJtForm({...jtForm, Title: e.target.value})} /></div>
              <button type="submit" className="btn" style={{width:'100%',marginTop:'8px'}}>Save</button>
            </form>
          </div>
        </div>
      )}

      {/* Bay Modal */}
      {showBayModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{width:'360px'}}>
            <div className="modal-header"><h3>{bayForm.BayID ? 'Edit' : 'Add'} Bay</h3><button onClick={()=>setShowBayModal(false)}><X size={20}/></button></div>
            <form onSubmit={saveBay} style={{padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
              <div className="form-group"><label>Bay Name *</label><input required type="text" value={bayForm.BayName} onChange={e=>setBayForm({...bayForm, BayName: e.target.value})} placeholder="e.g. Bay 1" /></div>
              <button type="submit" className="btn" style={{width:'100%',marginTop:'8px'}}>Save</button>
            </form>
          </div>
        </div>
      )}

      {/* OT Modal */}
      {showOTModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{width:'400px'}}>
            <div className="modal-header"><h3>{otForm.OrderTypeId ? 'Edit' : 'Add'} Order Type</h3><button onClick={()=>setShowOTModal(false)}><X size={20}/></button></div>
            <form onSubmit={saveOT} style={{padding:'20px',display:'flex',flexDirection:'column',gap:'16px'}}>
              <div className="form-group"><label>Order Type Name *</label><input required type="text" value={otForm.OrderTypeName} onChange={e=>setOtForm({...otForm, OrderTypeName: e.target.value})} /></div>
              <button type="submit" className="btn" style={{width:'100%',marginTop:'8px'}}>Save</button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
        .modal-content { background:white; border-radius:12px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); }
        .modal-header { padding:16px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; border-radius:12px 12px 0 0; }
        .modal-header h3 { margin:0; }
        .modal-header button { background:none; border:none; cursor:pointer; color:#64748b; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

// Inline manager picker for each JC business type. Auto-saves on change.
function JobTypeGLPicker({ jt, onSaved, notify }) {
  // SearchableSelect is imported at the top of the file (see imports)
  const [open, setOpen] = useState(false);
  const [incomeAccts, setIncomeAccts] = useState([]);
  const [arAccts, setArAccts] = useState([]);
  const [form, setForm] = useState({
    JobRevenueAccount: jt.JobRevenueAccount || '',
    PartsRevenueAccount: jt.PartsRevenueAccount || '',
    ReceivableAccount: jt.ReceivableAccount || '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Income accounts: L3 groups + L4 leaves under '4' so the user can pick
    // department-level (e.g. 401002 Income - Service Department) or a specific
    // sub-account if they've created one.
    // Absolute paths — the `API` const above is workshop-scoped (/api/workshop),
    // so we don't use it here.
    Promise.all([
      axios.get(`/api/accounts/coa?parentCode=4`).catch(() => ({ data: [] })),
      axios.get(`/api/parties/coa-pickable`).catch(() => ({ data: { groups: {} } })),
    ]).then(([inc, ar]) => {
      // Only show actual postable accounts (level >= 3). Skip the root (level 1).
      const filtered = (inc.data || []).filter(a => a.GLLevel >= 3);
      setIncomeAccts(filtered);
      // Receivables: 102xxx pickables only
      const flat = [];
      Object.entries(ar.data?.groups || {}).forEach(([parent, accts]) => {
        if (parent.startsWith('102')) accts.forEach(a => flat.push({ ...a, _group: parent }));
      });
      setArAccts(flat);
    });
  }, [open]);

  // Refresh form when jt changes (after a successful save the parent re-fetches)
  useEffect(() => {
    setForm({
      JobRevenueAccount: jt.JobRevenueAccount || '',
      PartsRevenueAccount: jt.PartsRevenueAccount || '',
      ReceivableAccount: jt.ReceivableAccount || '',
    });
  }, [jt.JobRevenueAccount, jt.PartsRevenueAccount, jt.ReceivableAccount]);

  const save = async () => {
    setBusy(true);
    try {
      await axios.patch(`/api/workshop/job-types/${jt.JobCardTypeId}/gl`, form);
      notify?.({ type: 'success', title: 'GL mapping saved', message: `${jt.CardCode} now posts to your selected accounts.` });
      setOpen(false);
      onSaved();
    } catch (err) {
      notify?.({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
    }
    setBusy(false);
  };

  const hasMapping = jt.JobRevenueAccount || jt.PartsRevenueAccount || jt.ReceivableAccount;
  const summary = (
    <div style={{ fontSize: '0.72rem', color: '#475569' }}>
      {jt.JobRevenueCode && <div>Labour Rev: <code>{jt.JobRevenueCode}</code></div>}
      {jt.PartsRevenueCode && <div>Parts Rev: <code>{jt.PartsRevenueCode}</code></div>}
      {jt.ReceivableCode && <div>Receivable: <code>{jt.ReceivableCode}</code></div>}
      {!hasMapping && <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>(using system defaults)</span>}
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {summary}
        <button onClick={() => setOpen(true)}
          style={{ background: hasMapping ? '#dcfce7' : '#fef3c7',
                   border: '1px solid ' + (hasMapping ? '#86efac' : '#fde68a'),
                   color: hasMapping ? '#15803d' : '#92400e',
                   padding: '4px 10px', borderRadius: 4, fontSize: '0.78rem',
                   fontWeight: 600, cursor: 'pointer' }}>
          {hasMapping ? 'Edit' : 'Configure'}
        </button>
      </div>

      {open && (
        <div onClick={() => setOpen(false)}
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: 'white', borderRadius: 8, padding: 20, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>GL Mapping — {jt.CardCode} ({jt.Title})</h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
              When a Job Card of this business unit is finalized, revenue + receivable lines
              post to the accounts you pick here. Leave blank to fall back to the system defaults.
            </p>

            <div style={{ marginTop: 16 }}>
              <label style={lblStyle}>Labour / Service Revenue (Income, 4xxx)</label>
              <SearchableSelect
                value={form.JobRevenueAccount}
                onChange={v => setForm(f => ({ ...f, JobRevenueAccount: v }))}
                options={incomeAccts.map(a => ({ id: a.GLCAID, label: a.GLTitle, sub: a.GLCode, group: a.isParent ? 'Group accounts' : 'Detail accounts' }))}
                placeholder="Use system default" />
              </div>
            <div style={{ marginTop: 12 }}>
              <label style={lblStyle}>Parts Revenue (when parts issued via JC)</label>
              <SearchableSelect
                value={form.PartsRevenueAccount}
                onChange={v => setForm(f => ({ ...f, PartsRevenueAccount: v }))}
                options={incomeAccts.map(a => ({ id: a.GLCAID, label: a.GLTitle, sub: a.GLCode, group: a.isParent ? 'Group accounts' : 'Detail accounts' }))}
                placeholder="Use system default" />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={lblStyle}>Receivable A/C (for walk-in customers on this business unit)</label>
              <SearchableSelect
                value={form.ReceivableAccount}
                onChange={v => setForm(f => ({ ...f, ReceivableAccount: v }))}
                options={arAccts.map(a => ({ id: a.GLCAID, label: a.GLTitle, sub: a.GLCode, group: a._group }))}
                placeholder="Use system default (General Customer A/C)" />
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                Named-party JCs always post to the party's own GL; this only applies when there's no party.
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setOpen(false)} className="btn-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="btn">
                {busy ? 'Saving...' : 'Save GL mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const lblStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 4 };
const selStyle = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' };

function JobTypeManagerPicker({ jt, employees, onSaved, notify }) {
  const [value, setValue] = useState(jt.ManagerEmployeeID || '');
  const [busy, setBusy] = useState(false);

  const handleChange = async (e) => {
    const newVal = e.target.value;
    setValue(newVal);
    setBusy(true);
    try {
      await axios.patch(`${API}/job-types/${jt.JobCardTypeId}/manager`, {
        ManagerEmployeeID: newVal || null
      });
      onSaved();
    } catch (err) {
      notify?.({ type: 'error', title: 'Could not assign manager', message: err.response?.data?.error || err.message });
      setValue(jt.ManagerEmployeeID || '');
    }
    setBusy(false);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={busy}
      style={{
        padding: '6px 8px',
        border: '1px solid ' + (value ? '#10b981' : '#fca5a5'),
        borderRadius: 4,
        fontSize: '0.85rem',
        minWidth: 220,
        background: value ? '#f0fdf4' : '#fef2f2',
        cursor: busy ? 'wait' : 'pointer'
      }}
    >
      <option value="">— Not assigned —</option>
      {employees.map(e => (
        <option key={e.EmployeeID} value={e.EmployeeID}>
          {e.EmployeeName}{e.DepartmentName ? ` (${e.DepartmentName})` : ''}
        </option>
      ))}
    </select>
  );
}
