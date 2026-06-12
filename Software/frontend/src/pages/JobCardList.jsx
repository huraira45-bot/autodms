import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Eye, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = '/api/workshop';

const STATUS_COLORS = { 0:'#f59e0b', 1:'#3b82f6', 2:'#10b981', 3:'#8b5cf6', 4:'#64748b' };
const STATUS_LABELS = { 0:'Open', 1:'In Progress', 2:'Ready', 3:'Invoiced', 4:'Closed' };
const TYPE_STYLES = { 'WR':{bg:'#fef3c7',color:'#92400e'}, 'BP':{bg:'#dbeafe',color:'#1e40af'}, 'GR':{bg:'#d1fae5',color:'#065f46'} };

export default function JobCardList() {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchJobs = async () => {
    try {
      let url = `${API}/job-cards?search=${debouncedSearch}`;
      if (statusFilter !== '') url += `&status=${statusFilter}`;
      const res = await axios.get(url);
      setJobs(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchJobs(); }, [debouncedSearch, statusFilter]);

  const updateStatus = async (id, status) => {
    try {
      await axios.patch(`${API}/job-cards/${id}/status`, { status });
      fetchJobs();
    } catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <div className="card-header">
        <div><h1 className="page-title">Workshop Job Cards</h1><p className="page-subtitle">Search, filter, and track all repair jobs.</p></div>
      </div>

      {/* Search & Filter Bar */}
      <div className="card" style={{padding:'16px',display:'flex',gap:'12px',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',background:'#f8fafc',padding:'0 12px',border:'1px solid #e2e8f0',borderRadius:'8px',height:'40px',flex:1}}>
          <Search size={18} style={{color:'#94a3b8'}} />
          <input style={{border:'none',outline:'none',flex:1,fontSize:'0.9rem',background:'transparent'}} placeholder="Search by RO#, Job No, Customer, Reg No... (e.g. 0042 or WR-0042)" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={{height:'40px',padding:'0 12px',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'0.9rem',minWidth:'160px'}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="0">Open</option>
          <option value="1">In Progress</option>
          <option value="2">Ready</option>
          <option value="3">Invoiced</option>
          <option value="4">Closed</option>
        </select>
      </div>

      {/* Results Table */}
      <div className="card">
        <div className="table-wrapper"><table>
          <thead><tr><th>RO #</th><th>Job #</th><th>Type</th><th>Customer</th><th>Cust. Type</th><th>Vehicle</th><th>Payment</th><th>Status</th><th>Date</th><th>Created By</th><th>Actions</th></tr></thead>
          <tbody>{jobs.length === 0 ? (
            <tr><td colSpan="10" style={{textAlign:'center',padding:'40px',color:'#94a3b8'}}>No job cards found. Use "Create Job Card" from the sidebar to create one.</td></tr>
          ) : jobs.map(j => {
            const ts = TYPE_STYLES[j.JobTypeCode] || TYPE_STYLES['GR'];
            return (
            <tr key={j.JobCardId}>
              <td><strong style={{fontFamily:'monospace',color:'var(--primary)'}}>{j.JobCardNo}</strong></td>
              <td><strong style={{fontFamily:'monospace'}}>{j.jobCode||'—'}</strong></td>
              <td><span style={{padding:'2px 8px',borderRadius:'99px',fontSize:'0.75rem',fontWeight:600,background:ts.bg,color:ts.color}}>{j.JobTypeName||'N/A'}</span></td>
              <td>{j.CustomerName||'—'}<br/><span style={{fontSize:'0.8rem',color:'#64748b'}}>{j.CustomerPhone}</span></td>
              <td><span style={{fontSize:'0.8rem',fontWeight:500}}>{j.CustomerType||'Walk-in'}</span></td>
              <td><span style={{fontFamily:'monospace',fontWeight:600}}>{j.VehicleRegNo}</span></td>
              <td><span style={{fontSize:'0.8rem',fontWeight:600,color:j.PaymentType==='Credit'?'#dc2626':j.PaymentType==='POS'?'#2563eb':'#16a34a'}}>{j.PaymentType||'Cash'}</span></td>
              <td>
                <select value={j.JobStatus} onChange={e => !j.IsFinalized && updateStatus(j.JobCardId, parseInt(e.target.value))}
                  disabled={!!j.IsFinalized}
                  style={{padding:'4px 8px',borderRadius:'6px',border:`2px solid ${STATUS_COLORS[j.JobStatus]}`,fontWeight:600,fontSize:'0.8rem',color:STATUS_COLORS[j.JobStatus],background:'white',cursor:j.IsFinalized?'default':'pointer',opacity:j.IsFinalized?0.7:1}}>
                  {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td style={{fontSize:'0.85rem'}}>{j.CreatedAt ? new Date(j.CreatedAt).toLocaleDateString() : '—'}</td>
              <td style={{fontSize:'0.8rem',color:'#64748b'}}>{j.CreatedByName || '—'}</td>
              <td>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  {j.IsFinalized && <span title="Finalized" style={{color:'#d97706'}}><Lock size={14}/></span>}
                  <button onClick={() => navigate(`/workshop/jobs/${j.JobCardId}`)} title="View / Edit" style={{background:'none',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'6px',cursor:'pointer',color:'#64748b'}}><Eye size={16} /></button>
                </div>
              </td>
            </tr>
          );})}</tbody>
        </table></div>
      </div>
    </div>
  );
}
