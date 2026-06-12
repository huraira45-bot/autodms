import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { RefreshCw, Search, Loader2, Save, CheckCircle, Clock, Wrench, ShieldCheck, Droplets, Truck } from 'lucide-react';

const API = '/api/workshop';

const WORKSHOP_STATUSES = [
  'Waiting For Service',
  'Being Serviced',
  'Final Inspection',
  'Car Wash',
  'Waiting For Delivery',
  'Delivered',
];

const STATUS_COLORS = {
  'Waiting For Service': { bg: '#fef9c3', border: '#fde68a', text: '#854d0e', icon: Clock },
  'Being Serviced':      { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', icon: Wrench },
  'Final Inspection':    { bg: '#f3e8ff', border: '#c4b5fd', text: '#6d28d9', icon: ShieldCheck },
  'Car Wash':            { bg: '#e0f2fe', border: '#7dd3fc', text: '#075985', icon: Droplets },
  'Waiting For Delivery':{ bg: '#dcfce7', border: '#86efac', text: '#166534', icon: CheckCircle },
  'Delivered':           { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569', icon: Truck },
};

const S = {
  page: { display: 'flex', height: 'calc(100vh - 40px)', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, background: '#e8edf2', gap: 0, overflow: 'hidden' },
  leftPanel: { width: 270, display: 'flex', flexDirection: 'column', background: '#d4dae5', borderRight: '2px solid #9aaac0', flexShrink: 0 },
  listHeader: { background: 'linear-gradient(to bottom,#4a7ebf,#1e4d8c)', color: '#fff', padding: '6px 10px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  searchBox: { padding: '6px 8px', borderBottom: '1px solid #9aaac0', background: '#c8d4e4' },
  listItem: (active) => ({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', cursor: 'pointer', borderBottom: '1px solid #c0cad8', background: active ? '#1e4d8c' : 'transparent', color: active ? '#fff' : '#1a1a1a' }),
  roNo: (active) => ({ fontWeight: 700, fontSize: 12, color: active ? '#fff' : '#b91c1c', fontFamily: 'Tahoma,Arial' }),
  regNo: { fontSize: 11, color: '#475569' },
  rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  titleBar: { background: 'linear-gradient(to bottom,#4a7ebf,#1e4d8c)', color: '#fff', padding: '4px 10px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  section: { background: '#f0f4f9', border: '1px solid #9aaac0', margin: '6px 8px 0', borderRadius: 2 },
  sectionHead: { background: '#c0cce0', borderBottom: '1px solid #9aaac0', padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#1a3a6a' },
  sectionBody: { padding: '6px 8px', display: 'grid', gap: 4 },
  label: { fontSize: 10, color: '#475569', fontWeight: 600 },
  roField: { border: '1px solid #8090b0', background: '#e8f0fe', padding: '2px 5px', fontSize: 11, fontWeight: 700, color: '#1a3a6a', borderRadius: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  input: { border: '1px solid #8090b0', padding: '2px 5px', fontSize: 11, background: '#fff', borderRadius: 2, width: '100%', boxSizing: 'border-box', fontFamily: 'Tahoma,Arial' },
  select: { border: '1px solid #8090b0', padding: '2px 4px', fontSize: 11, background: '#fff', borderRadius: 2, width: '100%', boxSizing: 'border-box', fontFamily: 'Tahoma,Arial' },
  btnPrimary: { background: 'linear-gradient(to bottom,#4a9f4a,#256025)', color: '#fff', border: '1px solid #2a6f2a', borderRadius: 3, padding: '3px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 },
  statusBadge: (status) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS['Waiting For Service'];
    return { background: c.bg, border: `1px solid ${c.border}`, color: c.text, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, display: 'inline-block' };
  },
};

function FieldPair({ label, value }) {
  return (
    <div>
      <div style={S.label}>{label}</div>
      <div style={S.roField}>{value || '—'}</div>
    </div>
  );
}

export default function JobController() {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState([]);
  const [bays, setBays] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [savingRow, setSavingRow] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');
  const [empSearch, setEmpSearch] = useState({});
  const [showEmpDD, setShowEmpDD] = useState({});
  const empDDRef = useRef({});

  const flash = (msg) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 2500); };

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try { const r = await axios.get(`${API}/job-controller`); setJobs(r.data); }
    catch (e) { console.error(e); }
    setLoadingJobs(false);
  }, []);

  useEffect(() => {
    loadJobs();
    axios.get(`${API}/bays`).then(r => setBays(r.data)).catch(() => {});
    axios.get('/api/employees').then(r => setAllEmployees(r.data.filter(e => e.IsTechnician))).catch(() => {});
  }, [loadJobs]);

  const selectJob = async (job) => {
    setSelected(job);
    setPendingStatus(job.WorkshopStatus || 'Waiting For Service');
    setLoadingDetail(true);
    try {
      const r = await axios.get(`${API}/job-controller/${job.JobCardId}/detail`);
      setDetails(r.data);
    } catch (e) { console.error(e); }
    setLoadingDetail(false);
  };

  const handleStatusSave = async () => {
    if (!selected) return;
    setStatusSaving(true);
    try {
      await axios.patch(`${API}/job-controller/${selected.JobCardId}/status`, { WorkshopStatus: pendingStatus });
      setSelected(p => ({ ...p, WorkshopStatus: pendingStatus }));
      setJobs(prev => prev.map(j => j.JobCardId === selected.JobCardId ? { ...j, WorkshopStatus: pendingStatus } : j));
      flash('Status saved.');
    } catch (e) { flash('Error: ' + (e.response?.data?.error || e.message)); }
    setStatusSaving(false);
  };

  const updateDetail = (idx, key, val) => {
    setDetails(p => { const u = [...p]; u[idx] = { ...u[idx], [key]: val }; return u; });
  };

  const saveRow = async (row, idx) => {
    setSavingRow(idx);
    try {
      await axios.patch(`${API}/job-controller/detail/${row.DetailId}/assign`, {
        BayNo: row.BayNo,
        PerformedByID: row.PerformedByID || null,
        PerformedByName: row.PerformedByName,
        JobStartTime: row.JobStartTime || null,
        JobEndTime: row.JobEndTime || null,
      });
      flash('Row saved.');
    } catch (e) { flash('Error: ' + (e.response?.data?.error || e.message)); }
    setSavingRow(null);
  };

  const searchEmp = (idx, val) => {
    setEmpSearch(p => ({ ...p, [idx]: val }));
    updateDetail(idx, 'PerformedByName', val);
    if (val.length < 2) { setShowEmpDD(p => ({ ...p, [idx]: false })); return; }
    const s = val.toLowerCase();
    const filtered = allEmployees.filter(e => e.EmployeeName?.toLowerCase().includes(s)).slice(0, 6);
    empDDRef.current[idx] = filtered;
    setShowEmpDD(p => ({ ...p, [idx]: filtered.length > 0 }));
  };

  const selectEmp = (idx, emp) => {
    updateDetail(idx, 'PerformedByName', emp.EmployeeName);
    updateDetail(idx, 'PerformedByID', emp.EmployeeID);
    setEmpSearch(p => ({ ...p, [idx]: emp.EmployeeName }));
    setShowEmpDD(p => ({ ...p, [idx]: false }));
  };

  const filtered = jobs.filter(j =>
    !search || j.JobCardNo?.toLowerCase().includes(search.toLowerCase()) ||
    j.VehicleRegNo?.toLowerCase().includes(search.toLowerCase()) ||
    j.jobCode?.toLowerCase().includes(search.toLowerCase())
  );

  const fmtDT = (val) => val ? new Date(val).toISOString().slice(0, 16) : '';

  const StatusIcon = selected ? (STATUS_COLORS[selected.WorkshopStatus]?.icon || Clock) : Clock;

  return (
    <div style={S.page}>
      {/* ── Left Panel ── */}
      <div style={S.leftPanel}>
        <div style={S.listHeader}>
          <span>Today's Jobs &nbsp;<span style={{ background: '#e2e8f0', color: '#1e3a6a', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{filtered.length}</span></span>
          <button onClick={loadJobs} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }} title="Refresh">
            <RefreshCw size={14} style={{ animation: loadingJobs ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
        <div style={S.searchBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #8090b0', borderRadius: 2, padding: '2px 6px' }}>
            <Search size={12} style={{ color: '#9aaac0', flexShrink: 0 }} />
            <input style={{ border: 'none', outline: 'none', flex: 1, fontSize: 11, fontFamily: 'Tahoma,Arial' }}
              placeholder="Search RO / Reg No..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingJobs && <div style={{ padding: 20, textAlign: 'center' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>}
          {!loadingJobs && filtered.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 11 }}>No jobs today.</div>}
          {filtered.map(job => {
            const active = selected?.JobCardId === job.JobCardId;
            const sc = STATUS_COLORS[job.WorkshopStatus] || STATUS_COLORS['Waiting For Service'];
            return (
              <div key={job.JobCardId} onClick={() => selectJob(job)} style={S.listItem(active)}>
                <div>
                  <div style={S.roNo(active)}>{job.JobCardNo || job.jobCode}</div>
                  <div style={{ fontSize: 10, color: active ? '#bfdbfe' : '#475569', marginTop: 1 }}>{job.VehicleRegNo || '—'}</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: active ? '#fff' : sc.text, background: active ? 'rgba(255,255,255,0.15)' : sc.bg, border: `1px solid ${active ? 'rgba(255,255,255,0.3)' : sc.border}`, borderRadius: 10, padding: '1px 6px', maxWidth: 90, textAlign: 'center', lineHeight: '14px' }}>
                  {job.WorkshopStatus || 'Waiting For Service'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div style={S.rightPanel}>
        <div style={S.titleBar}>
          <span>🔧 Job Controller — Repair Order Details</span>
          {selected && <span style={{ fontSize: 11, color: '#bfdbfe' }}>WO: {selected.JobCardNo}</span>}
        </div>

        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
            ← Select a job from the list to view details
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>

            {/* Customer Information */}
            <div style={S.section}>
              <div style={S.sectionHead}>Customer Information</div>
              <div style={{ ...S.sectionBody, gridTemplateColumns: 'repeat(4, 1fr)', padding: '6px 8px' }}>
                <FieldPair label="Customer Name" value={selected.CustomerName} />
                <FieldPair label="Mobile" value={selected.CustomerPhone} />
                <FieldPair label="Chassis Number" value={selected.ChasisNo} />
                <FieldPair label="Reg. #" value={selected.VehicleRegNo} />
                <div style={{ gridColumn: '1 / 3' }}><FieldPair label="Address" value={selected.CustomerAddress} /></div>
                <FieldPair label="Engine #" value={selected.EngineNo} />
                <FieldPair label="Model" value={selected.VehicleModel} />
                <FieldPair label="Year / Variant" value={selected.VehicleYear} />
                <FieldPair label="Odometer" value={selected.KiloMeter} />
                <FieldPair label="Promised Date" value={selected.PromisedDate ? new Date(selected.PromisedDate).toLocaleDateString() : null} />
              </div>
            </div>

            {/* Status Change Bar */}
            <div style={{ margin: '6px 8px 0', background: '#e8f0fb', border: '1px solid #9aaac0', borderRadius: 2, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusIcon size={14} style={{ color: STATUS_COLORS[selected.WorkshopStatus]?.text || '#854d0e' }} />
                <span style={S.statusBadge(selected.WorkshopStatus)}>{selected.WorkshopStatus || 'Waiting For Service'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a6a', whiteSpace: 'nowrap' }}>Change Status:</span>
                <select style={{ ...S.select, maxWidth: 200 }} value={pendingStatus} onChange={e => setPendingStatus(e.target.value)}>
                  {WORKSHOP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={handleStatusSave} disabled={statusSaving} style={S.btnPrimary}>
                  {statusSaving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                  Save Status
                </button>
              </div>
              <div style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                WO ID: <strong>{selected.JobCardId}</strong> &nbsp;|&nbsp; Job#: <strong>{selected.jobCode}</strong>
              </div>
            </div>

            {/* Status flash */}
            {statusMsg && (
              <div style={{ margin: '4px 8px 0', background: statusMsg.startsWith('Error') ? '#fee2e2' : '#dcfce7', color: statusMsg.startsWith('Error') ? '#b91c1c' : '#166534', padding: '3px 10px', fontSize: 11, borderRadius: 2 }}>
                {statusMsg}
              </div>
            )}

            {/* Labour Jobs Grid */}
            <div style={S.section}>
              <div style={S.sectionHead}>Jobs / Labour — Assign Bay &amp; Technician</div>
              {loadingDetail ? (
                <div style={{ padding: 20, textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
              ) : details.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>No labour items on this job card.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#dce6f4' }}>
                        {['Job Description', 'Price', 'Bay #', 'Performed By (Technician)', 'Job Start', 'Job End', ''].map(h => (
                          <th key={h} style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #9aaac0', fontWeight: 700, color: '#1a3a6a', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((row, idx) => (
                        <tr key={row.DetailId} style={{ background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                          {/* Description */}
                          <td style={{ padding: '4px 8px', border: '1px solid #e2e8f0', fontWeight: 600, minWidth: 200 }}>
                            {row.WorkDescription}
                          </td>
                          {/* Price */}
                          <td style={{ padding: '4px 8px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#1a3a6a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {parseFloat(row.Price || 0).toLocaleString()}
                          </td>
                          {/* Bay */}
                          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', minWidth: 110 }}>
                            <select style={S.select} value={row.BayNo || ''}
                              onChange={e => updateDetail(idx, 'BayNo', e.target.value)}>
                              <option value="">— Select —</option>
                              {bays.map(b => <option key={b.BayID} value={b.BayName}>{b.BayName}</option>)}
                            </select>
                          </td>
                          {/* Performed By */}
                          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', minWidth: 180, position: 'relative' }}>
                            <input style={S.input}
                              value={empSearch[idx] !== undefined ? empSearch[idx] : (row.PerformedByName || '')}
                              onChange={e => searchEmp(idx, e.target.value)}
                              onBlur={() => setTimeout(() => setShowEmpDD(p => ({ ...p, [idx]: false })), 150)}
                              placeholder="Search technician..." />
                            {showEmpDD[idx] && (empDDRef.current[idx] || []).length > 0 && (
                              <div style={{ position: 'absolute', left: 6, right: 6, top: '100%', background: '#fff', border: '1px solid #9aaac0', zIndex: 30, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', maxHeight: 120, overflowY: 'auto' }}>
                                {(empDDRef.current[idx] || []).map(emp => (
                                  <div key={emp.EmployeeID} onMouseDown={() => selectEmp(idx, emp)}
                                    style={{ padding: '3px 8px', cursor: 'pointer', fontSize: 11, borderBottom: '1px solid #f0f4f8' }}
                                    onMouseEnter={e => e.currentTarget.style.background='#e8f0fe'}
                                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                    {emp.EmployeeName}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          {/* Job Start */}
                          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', minWidth: 155 }}>
                            <input type="datetime-local" style={S.input}
                              value={fmtDT(row.JobStartTime)}
                              onChange={e => updateDetail(idx, 'JobStartTime', e.target.value)} />
                          </td>
                          {/* Job End */}
                          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', minWidth: 155 }}>
                            <input type="datetime-local" style={S.input}
                              value={fmtDT(row.JobEndTime)}
                              onChange={e => updateDetail(idx, 'JobEndTime', e.target.value)} />
                          </td>
                          {/* Save */}
                          <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                            <button onClick={() => saveRow(row, idx)} disabled={savingRow === idx} style={S.btnPrimary}>
                              {savingRow === idx ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={11} />}
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
