import React,{useEffect,useState} from 'react';
import axios from 'axios';
import {useAuth} from '../../context/AuthContext';
import {ErpControlPanel} from '../../components/erp';
export default function BookingMonthLocks(){
 const {user}=useAuth();
 const [year,setYear]=useState(new Date().getFullYear());
 const [data,setData]=useState({months:[],history:[]});
 const [selected,setSelected]=useState(null),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const isAdmin=Number(user?.groupId)===1;
 const load=async()=>{setBusy(true);setError('');try{setData((await axios.get('/api/sales/booking-month-locks',{params:{year}})).data);}catch(e){setError(e.response?.data?.error||e.message);}finally{setBusy(false);}};
 useEffect(()=>{setSelected(null);if(isAdmin)load();},[year,isAdmin]);
 const save=async()=>{setBusy(true);setError('');setMessage('');try{
  await axios.put('/api/sales/booking-month-locks/'+selected.Month,{Locked:!selected.IsLocked,ExpectedRevisionID:selected.RevisionID||null,Reason:reason});
  setMessage(selected.Month+' '+(selected.IsLocked?'unlocked':'locked')+'.');setSelected(null);setReason('');await load();
 }catch(e){setError(e.response?.data?.error||e.message);setBusy(false);}};
 if(!isAdmin)return <div className="card">Only the main Administrator can manage booking month locks.</div>;
 return <div style={{display:'grid',gap:16}}>
  <ErpControlPanel title="Booking Month Locks" subtitle="Main Administrator controls for vehicle sales booking months." actions={<button className="erp-btn" onClick={load} disabled={busy}>Refresh</button>}/>
  <div className="card"><p>Locked months block new bookings dated in that month, moving booking dates into or out of the month, payment void requests and deletion of uploaded documents. Admin must unlock the month before those actions.</p><p>New document uploads, vehicle allocation, Pay to Master, payments, delivery and automatic voucher processing continue as usual. A separate permanent booking lock still applies where one has been installed.</p>
   <label>Year <input type="number" min="1753" max="9998" value={year} onChange={e=>setYear(Number(e.target.value))} disabled={busy}/></label>
  </div>
  {error&&<div role="alert" className="card" style={{color:'#b91c1c'}}>{error}</div>}
  {message&&<div role="status" className="card" style={{color:'#166534'}}>{message}</div>}
  <div className="card" style={{overflowX:'auto'}}><table className="erp-table" style={{width:'100%'}}><thead><tr><th>Booking month</th><th>Status</th><th>Changed by</th><th>Reason</th><th>Action</th></tr></thead><tbody>
   {data.months.map(m=><tr key={m.Month}><td>{new Date(m.Month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</td><td><strong style={{color:m.IsLocked?'#b91c1c':'#166534'}}>{m.IsLocked?'Locked':'Unlocked'}</strong></td><td>{m.UpdatedByName||'-'}</td><td>{m.Reason||'-'}</td><td><button className="erp-btn erp-btn-sm" disabled={busy} onClick={()=>{setSelected(m);setReason('');setError('');}}>{m.IsLocked?'Unlock':'Lock'} month</button></td></tr>)}
  </tbody></table></div>
  {selected&&<div className="card"><h3>{selected.IsLocked?'Unlock':'Lock'} {selected.Month}</h3><label>Reason <input aria-label="Lock change reason" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} disabled={busy} style={{width:'100%',padding:8}}/></label><div style={{display:'flex',gap:8,marginTop:12}}><button className="erp-btn erp-btn-primary" disabled={busy||reason.trim().length<5} onClick={save}>{busy?'Saving...':'Confirm '+(selected.IsLocked?'unlock':'lock')}</button><button className="erp-btn" disabled={busy} onClick={()=>setSelected(null)}>Cancel</button></div></div>}
  <div className="card" style={{overflowX:'auto'}}><h3>Lock / unlock history</h3><table className="erp-table" style={{width:'100%'}}><thead><tr><th>Month</th><th>Action</th><th>When</th><th>Who</th><th>Reason</th></tr></thead><tbody>{data.history.map((h,i)=><tr key={i}><td>{h.Month}</td><td>{h.IsLocked?'Locked':'Unlocked'}</td><td>{new Date(h.AtUtc).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})}</td><td>{h.ActorName}</td><td>{h.Reason}</td></tr>)}</tbody></table></div>
 </div>;
}
