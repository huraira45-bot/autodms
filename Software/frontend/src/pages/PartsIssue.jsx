import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Search, Plus, Trash2, Save, Loader2 } from 'lucide-react';

const API = '/api';

export default function PartsIssue() {
  const [jobCards, setJobCards] = useState([]);
  const [items, setItems] = useState([]);
  const [issuedParts, setIssuedParts] = useState([]);
  const [jobSearch, setJobSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    const fetchItems = async () => {
      try { const res = await axios.get(`${API}/items`); setItems(res.data); } catch (err) { console.error(err); }
    };
    fetchItems();
  }, []);

  const searchJobs = async (val) => {
    setJobSearch(val);
    if (val.length < 2) { setJobCards([]); return; }
    try {
      const res = await axios.get(`${API}/workshop/job-cards?search=${val}`);
      setJobCards(res.data);
    } catch (err) { console.error(err); }
  };

  const selectJob = async (job) => {
    setSelectedJob(job);
    setJobSearch('');
    setJobCards([]);
    // Fetch already issued parts for this job
    try {
      const res = await axios.get(`${API}/workshop/parts-issue?jobCardId=${job.JobCardId}`);
      setIssuedParts(res.data);
    } catch (err) { console.error(err); }
  };

  const addItem = () => setNewItems([...newItems, { ItemId: '', Quantity: 1, Rate: 0 }]);
  
  const updateItem = (i, field, val) => {
    const n = [...newItems];
    n[i][field] = val;
    if (field === 'ItemId') {
      const found = items.find(it => it.ItemId === parseInt(val));
      if (found) n[i].Rate = found.ItemSalesPrice || 0;
    }
    setNewItems(n);
  };

  const removeItem = (i) => setNewItems(newItems.filter((_, idx) => idx !== i));
  
  const totalNew = newItems.reduce((s, i) => s + (parseFloat(i.Quantity||0) * parseFloat(i.Rate||0)), 0);
  const totalIssued = issuedParts.reduce((s, i) => s + (parseFloat(i.IssueQuantity||0) * parseFloat(i.ItemRate||0)), 0);

  const handleIssue = async () => {
    if (!selectedJob) { alert('Select a job card first.'); return; }
    if (newItems.length === 0) { alert('Add at least one part.'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/workshop/parts-issue`, {
        JobCardId: selectedJob.JobCardId,
        JobCardNo: selectedJob.JobCardNo?.toString() || '',
        Items: newItems,
        Remarks: remarks
      });
      alert('Parts issued successfully!');
      setNewItems([]);
      setRemarks('');
      selectJob(selectedJob); // Refresh issued list
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
    setSaving(false);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <div className="card-header">
        <div><h1 className="page-title">Parts Issue to Job Card</h1><p className="page-subtitle">Parts department: Issue spare parts against workshop job cards.</p></div>
      </div>

      {/* Job Card Search */}
      <div className="card" style={{padding:'20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',fontWeight:600,color:'var(--primary)',marginBottom:'12px'}}><Search size={18} /> Find Job Card</div>
        <div style={{position:'relative'}}>
          <input type="text" value={jobSearch} onChange={e => searchJobs(e.target.value)} placeholder="Search by Job No, Customer, Reg No..." style={{width:'100%',padding:'10px 14px',border:'2px solid var(--primary)',borderRadius:'8px',fontSize:'0.95rem'}} />
          {jobCards.length > 0 && (
            <div style={{position:'absolute',top:'100%',left:0,right:0,background:'white',border:'1px solid #e2e8f0',borderRadius:'8px',maxHeight:'250px',overflow:'auto',zIndex:10,boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
              {jobCards.map(j => (
                <div key={j.JobCardId} onClick={() => selectJob(j)} style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div><strong>JC-{j.JobCardNo}</strong> — {j.CustomerName || 'N/A'}</div>
                  <div style={{textAlign:'right'}}><span style={{fontFamily:'monospace',fontWeight:600,color:'var(--primary)'}}>{j.VehicleRegNo}</span><br/><span style={{fontSize:'0.8rem',color:'#64748b'}}>{j.JobStatusText}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedJob && (
          <div style={{marginTop:'16px',background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'16px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'12px'}}>
            <div><span style={{fontSize:'0.8rem',color:'#64748b'}}>Job Card</span><br/><strong>JC-{selectedJob.JobCardNo}</strong></div>
            <div><span style={{fontSize:'0.8rem',color:'#64748b'}}>Customer</span><br/><strong>{selectedJob.CustomerName||'—'}</strong></div>
            <div><span style={{fontSize:'0.8rem',color:'#64748b'}}>Vehicle</span><br/><strong>{selectedJob.VehicleRegNo}</strong></div>
            <div><span style={{fontSize:'0.8rem',color:'#64748b'}}>Status</span><br/><strong>{selectedJob.JobStatusText}</strong></div>
          </div>
        )}
      </div>

      {selectedJob && (
        <>
          {/* Already Issued Parts */}
          {issuedParts.length > 0 && (
            <div className="card">
              <div style={{padding:'16px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',fontWeight:600}}>Previously Issued Parts</div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9'}}>Part Name</th>
                  <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9'}}>Qty</th>
                  <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9'}}>Rate</th>
                  <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9'}}>Total</th>
                </tr></thead>
                <tbody>{issuedParts.map(p => (
                  <tr key={p.StockIssueDetailID}>
                    <td style={{padding:'10px 16px',borderBottom:'1px solid #e2e8f0'}}><strong>{p.ItemName}</strong> <span style={{fontSize:'0.8rem',color:'#64748b'}}>({p.ItemNumber})</span></td>
                    <td style={{padding:'10px 16px',borderBottom:'1px solid #e2e8f0'}}>{p.IssueQuantity}</td>
                    <td style={{padding:'10px 16px',borderBottom:'1px solid #e2e8f0'}}>{parseFloat(p.ItemRate||0).toLocaleString()}</td>
                    <td style={{padding:'10px 16px',borderBottom:'1px solid #e2e8f0',fontWeight:600}}>{(parseFloat(p.IssueQuantity||0) * parseFloat(p.ItemRate||0)).toLocaleString()}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr><td colSpan="3" style={{padding:'12px 16px',fontWeight:700,textAlign:'right'}}>Total Issued:</td><td style={{padding:'12px 16px',fontWeight:700,fontSize:'1.1rem'}}>PKR {totalIssued.toLocaleString()}</td></tr></tfoot>
              </table>
            </div>
          )}

          {/* New Issue */}
          <div className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}><Package size={18} /> <strong>Issue New Parts</strong></div>
              <button type="button" onClick={addItem} style={{display:'flex',alignItems:'center',gap:'4px',background:'white',border:'1px solid var(--primary)',color:'var(--primary)',padding:'6px 14px',borderRadius:'6px',fontSize:'0.85rem',cursor:'pointer'}}><Plus size={14} /> Add Part</button>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9',width:'45%'}}>Select Part</th>
                <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9',width:'15%'}}>Qty</th>
                <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9',width:'15%'}}>Rate</th>
                <th style={{textAlign:'left',padding:'10px 16px',fontSize:'0.8rem',color:'#64748b',background:'#f1f5f9',width:'15%'}}>Total</th>
                <th style={{padding:'10px',background:'#f1f5f9',width:'10%'}}></th>
              </tr></thead>
              <tbody>
                {newItems.map((item, i) => (
                  <tr key={i}>
                    <td style={{padding:'8px 12px',borderBottom:'1px solid #e2e8f0'}}>
                      <select value={item.ItemId} onChange={e => updateItem(i,'ItemId',e.target.value)} style={{width:'100%',padding:'8px',border:'1px solid #cbd5e1',borderRadius:'4px'}}>
                        <option value="">Select Part...</option>
                        {items.map(it => <option key={it.ItemId} value={it.ItemId}>{it.ItenName} ({it.ItemNumber})</option>)}
                      </select>
                    </td>
                    <td style={{padding:'8px 12px',borderBottom:'1px solid #e2e8f0'}}><input type="number" value={item.Quantity} onChange={e => updateItem(i,'Quantity',e.target.value)} style={{width:'100%',padding:'8px',border:'1px solid #cbd5e1',borderRadius:'4px'}} /></td>
                    <td style={{padding:'8px 12px',borderBottom:'1px solid #e2e8f0'}}><input type="number" value={item.Rate} onChange={e => updateItem(i,'Rate',e.target.value)} style={{width:'100%',padding:'8px',border:'1px solid #cbd5e1',borderRadius:'4px'}} /></td>
                    <td style={{padding:'8px 12px',borderBottom:'1px solid #e2e8f0',fontWeight:600}}>{(parseFloat(item.Quantity||0) * parseFloat(item.Rate||0)).toLocaleString()}</td>
                    <td style={{padding:'8px',borderBottom:'1px solid #e2e8f0',textAlign:'center'}}><button onClick={() => removeItem(i)} style={{color:'#ef4444',background:'none',border:'none',cursor:'pointer'}}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
                {newItems.length === 0 && <tr><td colSpan="5" style={{padding:'20px',textAlign:'center',color:'#94a3b8'}}>Click "Add Part" to start issuing parts.</td></tr>}
              </tbody>
            </table>

            {newItems.length > 0 && (
              <div style={{padding:'16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid #e2e8f0'}}>
                <div style={{flex:1,marginRight:'20px'}}>
                  <input type="text" placeholder="Remarks (optional)" value={remarks} onChange={e => setRemarks(e.target.value)} style={{width:'100%',padding:'10px',border:'1px solid #cbd5e1',borderRadius:'6px'}} />
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'20px'}}>
                  <div style={{textAlign:'right'}}><span style={{fontSize:'0.85rem',color:'#64748b'}}>Total</span><br/><strong style={{fontSize:'1.3rem'}}>PKR {totalNew.toLocaleString()}</strong></div>
                  <button onClick={handleIssue} disabled={saving} className="btn" style={{background:'var(--primary)',color:'white',padding:'12px 24px',display:'flex',alignItems:'center',gap:'8px'}}>
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Issue Parts
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
