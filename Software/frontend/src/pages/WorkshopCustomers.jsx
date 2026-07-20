import { useState, useEffect } from 'react';
import axios from 'axios';
import { UserPlus, Edit, Search, Save, X, Loader2, Car, Plus } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { ErpControlPanel } from '../components/erp';

const API = '/api/workshop';

export default function WorkshopCustomers() {
  const { notify } = useFeedback();
  const [customers, setCustomers] = useState([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editing, setEditing] = useState(null);
  // VehicleID being edited in-place, or null when adding a new vehicle.
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [form, setForm] = useState({ CustomerName: '', PhoneNo: '', Email: '', CNIC: '', Address: '', DOB: '' });
  const emptyVehicle = { RegistrationNo: '', ChasisNo: '', EngineNo: '', BrandName: '', VehicleModel: '', VehicleColor: '' };
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [saving, setSaving] = useState(false);
  
  // To hold vehicles for the currently editing customer
  const [customerVehicles, setCustomerVehicles] = useState([]);

  const fetchCustomers = async () => {
    setLoadingList(true);
    try {
      const res = await axios.get(`${API}/customers`, { params: { search } });
      // Server now returns { rows, total, limit } — array response is the
      // legacy shape (kept for any older callers that hit this endpoint).
      const payload = Array.isArray(res.data) ? { rows: res.data, total: res.data.length } : res.data;
      setCustomers(payload.rows || []);
      setTotalMatches(payload.total || 0);
    } catch (err) { console.error(err); }
    setLoadingList(false);
  };

  // Debounce the search so we don't hit the API on every keystroke — with
  // 8,000+ customers even the indexed LIKE scan isn't free.
  useEffect(() => {
    const t = setTimeout(fetchCustomers, 250);
    return () => clearTimeout(t);
  }, [search]);

  const openNew = () => {
    setEditing(null);
    setForm({ CustomerName: '', PhoneNo: '', Email: '', CNIC: '', Address: '', DOB: '' });
    setCustomerVehicles([]);
    setShowVehicleForm(false);
    setEditingVehicleId(null);
    setVehicleForm(emptyVehicle);
    setShowForm(true);
  };

  const openEdit = async (c) => {
    setEditing(c.ProfileID);
    setForm({
      CustomerName: c.CustomerName || '', PhoneNo: c.PhoneNo || '', Email: c.Email || '',
      CNIC: c.CNIC || '', Address: c.Address || '',
      DOB: c.DOB ? new Date(c.DOB).toISOString().slice(0, 10) : ''
    });
    setShowVehicleForm(false);
    setEditingVehicleId(null);
    setVehicleForm(emptyVehicle);
    setShowForm(true);
    // Fetch vehicles for this customer
    try {
      const res = await axios.get(`${API}/customers/${c.ProfileID}/vehicles`);
      setCustomerVehicles(res.data);
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) payload.ProfileID = editing;
      await axios.post(`${API}/customers`, payload);
      notify({ type: 'success', title: editing ? 'Customer updated' : 'Customer saved', message: form.CustomerName });
      setShowForm(false);
      fetchCustomers();
    } catch (err) {
      notify({ type: 'error', title: 'Could not save customer', message: err.response?.data?.error || err.message });
    }
    setSaving(false);
  };

  const handleSaveVehicle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const regNo = vehicleForm.RegistrationNo;
      if (editingVehicleId) {
        await axios.put(`${API}/customers/${editing}/vehicles/${editingVehicleId}`, vehicleForm);
      } else {
        await axios.post(`${API}/customers/${editing}/vehicles`, vehicleForm);
      }
      setShowVehicleForm(false);
      setEditingVehicleId(null);
      setVehicleForm(emptyVehicle);
      const res = await axios.get(`${API}/customers/${editing}/vehicles`);
      setCustomerVehicles(res.data);
      notify({ type: 'success', title: editingVehicleId ? 'Vehicle updated' : 'Vehicle added', message: regNo });
    } catch (err) {
      notify({ type: 'error', title: editingVehicleId ? 'Could not update vehicle' : 'Could not add vehicle', message: err.response?.data?.error || err.message });
    }
    setSaving(false);
  };

  const openEditVehicle = (v) => {
    setEditingVehicleId(v.VehicleID);
    setVehicleForm({
      RegistrationNo: v.RegistrationNo || '',
      ChasisNo:       v.ChasisNo       || '',
      EngineNo:       v.EngineNo       || '',
      BrandName:      v.BrandName      || '',
      VehicleModel:   v.VehicleModel   || '',
      VehicleColor:   v.VehicleColor   || '',
    });
    setShowVehicleForm(true);
  };

  const cancelVehicleForm = () => {
    setShowVehicleForm(false);
    setEditingVehicleId(null);
    setVehicleForm(emptyVehicle);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <ErpControlPanel
        title="Workshop Customers"
        subtitle="Manage customer profiles and their vehicles."
        actions={
          <button type="button" className="erp-btn erp-btn-primary" onClick={openNew}>
            <UserPlus size={14} /> New Customer
          </button>
        }
      />

      <div className="card" style={{padding:'16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',background:'#f8fafc',padding:'0 12px',border:'1px solid #e2e8f0',borderRadius:'8px',height:'40px',maxWidth:'400px'}}>
          <Search size={18} style={{color:'#94a3b8'}} />
          <input style={{border:'none',outline:'none',flex:1,fontSize:'0.9rem',background:'transparent'}} placeholder="Search by name, phone, or reg no..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div style={{
            padding: '6px 12px', fontSize: '0.78rem', color: '#475569',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
        }}>
            <span>
                {loadingList ? 'Loading…'
                 : totalMatches === 0 ? 'No customers match.'
                 : `Showing ${customers.length.toLocaleString()} of ${totalMatches.toLocaleString()} customers`}
            </span>
            {totalMatches > customers.length && (
                <span style={{ color: '#b45309' }}>Refine your search to narrow the list.</span>
            )}
        </div>
        <div className="table-wrapper"><table>
          <thead><tr><th>ID</th><th>Customer Name</th><th>Contact</th><th>CNIC / Email</th><th>Actions</th></tr></thead>
          <tbody>{customers.map(c => (
            <tr key={c.ProfileID}>
              <td>{c.ProfileID}</td>
              <td><strong>{c.CustomerName}</strong></td>
              <td>{c.PhoneNo}</td>
              <td><span style={{fontSize:'0.8rem',color:'#64748b'}}>{c.CNIC}<br/>{c.Email}</span></td>
              <td><button onClick={() => openEdit(c)} style={{background:'none',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'6px',cursor:'pointer'}}><Edit size={16} /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      {showForm && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div style={{background:'white',borderRadius:'12px',width:'600px',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <div style={{padding:'16px 20px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',borderRadius:'12px 12px 0 0'}}>
              <h3>{editing ? 'Edit Customer' : 'New Customer'}</h3>
              <button onClick={() => setShowForm(false)} style={{background:'none',border:'none',cursor:'pointer'}}><X size={20} /></button>
            </div>
            <div style={{padding:'20px'}}>
              <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                <div className="grid-2">
                  <div className="form-group"><label>Customer Name *</label><input required type="text" value={form.CustomerName} onChange={e => setForm({...form, CustomerName: e.target.value})} /></div>
                  <div className="form-group"><label>Phone Number *</label><input required type="text" value={form.PhoneNo} onChange={e => setForm({...form, PhoneNo: e.target.value})} /></div>
                </div>
                <div className="grid-2">
                  <div className="form-group"><label>CNIC</label><input type="text" value={form.CNIC} onChange={e => setForm({...form, CNIC: e.target.value})} /></div>
                  <div className="form-group"><label>Email</label><input type="email" value={form.Email} onChange={e => setForm({...form, Email: e.target.value})} /></div>
                </div>
                <div className="form-group"><label>Address</label><input type="text" value={form.Address} onChange={e => setForm({...form, Address: e.target.value})} /></div>
                <div className="form-group"><label>Date of Birth</label><input type="date" value={form.DOB} onChange={e => setForm({...form, DOB: e.target.value})} /></div>
                <button type="submit" disabled={saving} className="btn" style={{marginTop:'8px',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {editing ? 'Update Customer' : 'Save Customer'}
                </button>
              </form>

              {/* Vehicles Section (Only shown if editing an existing customer) */}
              {editing && (
                <div style={{marginTop:'30px',borderTop:'1px solid #e2e8f0',paddingTop:'20px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                    <h4 style={{display:'flex',alignItems:'center',gap:'8px',color:'var(--primary)'}}><Car size={18} /> Customer Vehicles</h4>
                    {!showVehicleForm && <button onClick={() => { setEditingVehicleId(null); setVehicleForm(emptyVehicle); setShowVehicleForm(true); }} className="btn" style={{padding:'6px 12px',fontSize:'0.85rem',display:'flex',alignItems:'center',gap:'4px'}}><Plus size={14} /> Add Vehicle</button>}
                  </div>

                  {showVehicleForm && (
                    <form onSubmit={handleSaveVehicle} style={{background:'#f8fafc',padding:'16px',borderRadius:'8px',border:'1px solid #e2e8f0',marginBottom:'16px'}}>
                      <div style={{fontSize:'0.85rem',fontWeight:600,color:'#334155',marginBottom:'10px'}}>
                        {editingVehicleId ? 'Edit Vehicle' : 'Add Vehicle'}
                      </div>
                      <div className="grid-2" style={{marginBottom:'12px'}}>
                        <div className="form-group"><label>Reg No *</label><input required type="text" value={vehicleForm.RegistrationNo} onChange={e => setVehicleForm({...vehicleForm, RegistrationNo: e.target.value})} /></div>
                        <div className="form-group"><label>Brand</label><input type="text" value={vehicleForm.BrandName} onChange={e => setVehicleForm({...vehicleForm, BrandName: e.target.value})} /></div>
                      </div>
                      <div className="grid-2" style={{marginBottom:'12px'}}>
                        <div className="form-group"><label>Model</label><input type="text" value={vehicleForm.VehicleModel} onChange={e => setVehicleForm({...vehicleForm, VehicleModel: e.target.value})} /></div>
                        <div className="form-group"><label>Chassis No</label><input type="text" value={vehicleForm.ChasisNo} onChange={e => setVehicleForm({...vehicleForm, ChasisNo: e.target.value})} /></div>
                      </div>
                      <div className="grid-2" style={{marginBottom:'12px'}}>
                        <div className="form-group"><label>Engine No</label><input type="text" value={vehicleForm.EngineNo} onChange={e => setVehicleForm({...vehicleForm, EngineNo: e.target.value})} /></div>
                        <div className="form-group"><label>Color</label><input type="text" value={vehicleForm.VehicleColor} onChange={e => setVehicleForm({...vehicleForm, VehicleColor: e.target.value})} placeholder="e.g. WHITE, GRAY, BLACK" /></div>
                      </div>
                      <div style={{display:'flex',gap:'8px'}}>
                        <button type="submit" disabled={saving} className="btn" style={{flex:1}}>{editingVehicleId ? 'Update Vehicle' : 'Save Vehicle'}</button>
                        <button type="button" onClick={cancelVehicleForm} className="btn" style={{background:'#e2e8f0',color:'#475569'}}>Cancel</button>
                      </div>
                    </form>
                  )}

                  {customerVehicles.length > 0 ? (
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                      <thead>
                        <tr style={{background:'#f1f5f9',color:'#64748b',textAlign:'left'}}>
                          <th style={{padding:'8px 12px'}}>Reg No</th><th style={{padding:'8px 12px'}}>Brand/Model</th><th style={{padding:'8px 12px'}}>Color</th><th style={{padding:'8px 12px'}}>Chassis/Engine</th><th style={{padding:'8px 12px',width:'1%'}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerVehicles.map(v => (
                          <tr key={v.VehicleID} style={{borderBottom:'1px solid #e2e8f0'}}>
                            <td style={{padding:'8px 12px',fontWeight:600}}>{v.RegistrationNo}</td>
                            <td style={{padding:'8px 12px'}}>{v.BrandName} {v.VehicleModel}</td>
                            <td style={{padding:'8px 12px'}}>{v.VehicleColor || '—'}</td>
                            <td style={{padding:'8px 12px'}}><span style={{color:'#64748b'}}>C: {v.ChasisNo}</span><br/><span style={{color:'#64748b'}}>E: {v.EngineNo}</span></td>
                            <td style={{padding:'8px 12px'}}>
                              <button type="button" onClick={() => openEditVehicle(v)} title="Edit vehicle" style={{background:'none',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'4px 6px',cursor:'pointer'}}>
                                <Edit size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{padding:'16px',textAlign:'center',color:'#94a3b8',background:'#f8fafc',borderRadius:'8px',border:'1px dashed #cbd5e1'}}>No vehicles added for this customer yet.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
