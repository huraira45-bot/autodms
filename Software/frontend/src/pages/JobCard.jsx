import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Wrench, Car, User, Calendar, Clock, Plus, Trash2, Save, 
  Search, FileText, CheckCircle2, AlertCircle, Fuel, Loader2, Database
} from 'lucide-react';

const API_BASE = '/api';

export default function JobCard() {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [items, setItems] = useState([]);
  
  const [formData, setFormData] = useState({
    JobCardNo: `JC-${Date.now().toString().slice(-6)}`,
    RegNo: '',
    ChassisNo: '',
    EngineNo: '',
    ModelName: '',
    Odometer: '',
    FuelLevel: '1/2',
    PromisedDate: '',
    CustomerName: '',
    CustomerPhone: '',
    AdvisorName: '',
    Remarks: ''
  });

  const [labourItems, setLabourItems] = useState([]);
  const [partItems, setPartItems] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, itemRes] = await Promise.all([
          axios.get(`${API_BASE}/employees`),
          axios.get(`${API_BASE}/items`)
        ]);
        setEmployees(empRes.data);
        setItems(itemRes.data);
      } catch (err) { console.error(err); }
    };
    fetchData();
  }, []);

  const addLabour = () => setLabourItems([...labourItems, { WorkDescription: '', LabourAmount: 0 }]);
  const addPart = () => setPartItems([...partItems, { PartID: '', Qty: 1, UnitPrice: 0, TotalAmount: 0 }]);

  const updateLabour = (index, field, value) => {
    const newItems = [...labourItems];
    newItems[index][field] = value;
    setLabourItems(newItems);
  };

  const updatePart = (index, field, value) => {
    const newItems = [...partItems];
    newItems[index][field] = value;
    if (field === 'PartID') {
      const selectedPart = items.find(i => i.ItemId === parseInt(value));
      if (selectedPart) {
        newItems[index].UnitPrice = selectedPart.ItemSalesPrice || 0;
      }
    }
    newItems[index].TotalAmount = newItems[index].Qty * newItems[index].UnitPrice;
    setPartItems(newItems);
  };

  const totalLabour = labourItems.reduce((sum, item) => sum + parseFloat(item.LabourAmount || 0), 0);
  const totalParts = partItems.reduce((sum, item) => sum + parseFloat(item.TotalAmount || 0), 0);
  const netAmount = totalLabour + totalParts;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        TotalLabour: totalLabour,
        TotalParts: totalParts,
        TotalTax: 0,
        NetAmount: netAmount,
        LabourItems: labourItems,
        PartItems: partItems
      };
      await axios.post(`${API_BASE}/workshop/job-card`, payload);
      alert('Job Card Saved Successfully!');
      window.location.reload();
    } catch (err) {
      alert('Error saving job card: ' + (err.response?.data?.details || err.message));
    }
    setLoading(false);
  };

  return (
    <div className="job-card-container">
      <div className="card-header">
        <div>
          <h1 className="page-title">Workshop Job Card</h1>
          <p className="page-subtitle">Vehicle Repair & Maintenance Tracking</p>
        </div>
        <div className="jc-number-badge">
          <FileText size={18} />
          <span>{formData.JobCardNo}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid-3 mb-6">
          {/* Section 1: Vehicle Info */}
          <div className="card section-card">
            <div className="section-header"><Car size={18} /> Vehicle Information</div>
            <div className="form-grid-stack">
              <div className="form-group"><label>Registration No</label><input type="text" value={formData.RegNo} onChange={e => setFormData({...formData, RegNo: e.target.value})} placeholder="LES-2024" required /></div>
              <div className="grid-2">
                <div className="form-group"><label>Model</label><input type="text" value={formData.ModelName} onChange={e => setFormData({...formData, ModelName: e.target.value})} placeholder="Alsvin / Oshan" /></div>
                <div className="form-group"><label>Fuel Level</label>
                  <select value={formData.FuelLevel} onChange={e => setFormData({...formData, FuelLevel: e.target.value})}>
                    <option>Empty</option><option>1/4</option><option>1/2</option><option>3/4</option><option>Full</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Chassis No</label><input type="text" value={formData.ChassisNo} onChange={e => setFormData({...formData, ChassisNo: e.target.value})} /></div>
              <div className="form-group"><label>Odometer Reading</label><input type="number" value={formData.Odometer} onChange={e => setFormData({...formData, Odometer: e.target.value})} /></div>
            </div>
          </div>

          {/* Section 2: Customer Info */}
          <div className="card section-card">
            <div className="section-header"><User size={18} /> Customer Details</div>
            <div className="form-grid-stack">
              <div className="form-group"><label>Customer Name</label><input type="text" value={formData.CustomerName} onChange={e => setFormData({...formData, CustomerName: e.target.value})} required /></div>
              <div className="form-group"><label>Phone Number</label><input type="text" value={formData.CustomerPhone} onChange={e => setFormData({...formData, CustomerPhone: e.target.value})} required /></div>
              <div className="form-group"><label>Service Advisor</label>
                <select value={formData.AdvisorName} onChange={e => setFormData({...formData, AdvisorName: e.target.value})} required>
                  <option value="">Select Advisor...</option>
                  {employees.map(emp => <option key={emp.EmployeeID} value={emp.EmployeeName}>{emp.EmployeeName}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Schedule & Remarks */}
          <div className="card section-card">
            <div className="section-header"><Calendar size={18} /> Scheduling</div>
            <div className="form-grid-stack">
              <div className="form-group"><label>Promised Date & Time</label><input type="datetime-local" value={formData.PromisedDate} onChange={e => setFormData({...formData, PromisedDate: e.target.value})} required /></div>
              <div className="form-group"><label>General Remarks / Complaints</label><textarea rows="4" value={formData.Remarks} onChange={e => setFormData({...formData, Remarks: e.target.value})} placeholder="Describe issues reported by customer..."></textarea></div>
            </div>
          </div>
        </div>

        {/* Labours Table */}
        <div className="card mb-6">
          <div className="table-header">
            <div style={{display:'flex', alignItems:'center', gap:'8px'}}><Wrench size={18} /> <strong>Labour / Services</strong></div>
            <button type="button" className="btn-small" onClick={addLabour}><Plus size={14} /> Add Labour</button>
          </div>
          <table className="jc-table">
            <thead>
              <tr>
                <th width="70%">Work Description</th>
                <th width="20%">Amount</th>
                <th width="10%">Action</th>
              </tr>
            </thead>
            <tbody>
              {labourItems.map((item, idx) => (
                <tr key={idx}>
                  <td><input type="text" value={item.WorkDescription} onChange={e => updateLabour(idx, 'WorkDescription', e.target.value)} placeholder="e.g. Oil Filter Replacement" /></td>
                  <td><input type="number" value={item.LabourAmount} onChange={e => updateLabour(idx, 'LabourAmount', e.target.value)} /></td>
                  <td className="text-center"><button type="button" className="text-red" onClick={() => setLabourItems(labourItems.filter((_, i) => i !== idx))}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Parts Table */}
        <div className="card mb-6">
          <div className="table-header">
            <div style={{display:'flex', alignItems:'center', gap:'8px'}}><Database size={18} /> <strong>Parts Requirement</strong></div>
            <button type="button" className="btn-small" onClick={addPart}><Plus size={14} /> Add Part</button>
          </div>
          <table className="jc-table">
            <thead>
              <tr>
                <th width="50%">Select Part</th>
                <th width="15%">Qty</th>
                <th width="15%">Price</th>
                <th width="15%">Total</th>
                <th width="5%"></th>
              </tr>
            </thead>
            <tbody>
              {partItems.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <select value={item.PartID} onChange={e => updatePart(idx, 'PartID', e.target.value)}>
                      <option value="">Select Part...</option>
                      {items.map(i => <option key={i.ItemId} value={i.ItemId}>{i.ItenName} ({i.ItemNumber})</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={item.Qty} onChange={e => updatePart(idx, 'Qty', e.target.value)} /></td>
                  <td><input type="number" value={item.UnitPrice} onChange={e => updatePart(idx, 'UnitPrice', e.target.value)} /></td>
                  <td className="font-bold">{(item.TotalAmount || 0).toLocaleString()}</td>
                  <td><button type="button" className="text-red" onClick={() => setPartItems(partItems.filter((_, i) => i !== idx))}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="jc-footer card">
          <div className="jc-summary">
            <div className="summary-row"><span>Total Labour:</span> <span>{totalLabour.toLocaleString()}</span></div>
            <div className="summary-row"><span>Total Parts:</span> <span>{totalParts.toLocaleString()}</span></div>
            <div className="summary-row total"><span>Net Amount:</span> <span>{netAmount.toLocaleString()}</span></div>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
            Save Workshop Job Card
          </button>
        </div>
      </form>

      <style>{`
        .job-card-container { max-width: 1200px; margin: 0 auto; }
        .section-card { height: 100%; }
        .section-header { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--primary); margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
        .form-grid-stack { display: flex; flexDirection: column; gap: 12px; }
        .jc-number-badge { display: flex; align-items: center; gap: 8px; background: #f1f5f9; padding: 8px 16px; border-radius: 99px; font-weight: 600; color: #475569; }
        .table-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .jc-table { width: 100%; border-collapse: collapse; }
        .jc-table th { text-align: left; padding: 12px 16px; font-size: 0.8rem; text-transform: uppercase; color: #64748b; background: #f1f5f9; }
        .jc-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
        .jc-table input, .jc-table select { width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; font-size: 0.9rem; }
        .jc-footer { display: flex; justify-content: space-between; align-items: flex-end; padding: 24px; background: #1e293b; color: white; border-radius: 12px; }
        .jc-summary { display: flex; flex-direction: column; gap: 8px; min-width: 250px; }
        .summary-row { display: flex; justify-content: space-between; font-size: 1.1rem; color: #94a3b8; }
        .summary-row.total { font-size: 1.5rem; font-weight: 700; color: white; border-top: 1px solid #334155; padding-top: 8px; margin-top: 8px; }
        .btn-primary { display: flex; align-items: center; gap: 10px; background: var(--primary); color: white; padding: 14px 28px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; height: 56px; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.4); }
        .btn-small { display: flex; align-items: center; gap: 4px; background: white; border: 1px solid var(--primary); color: var(--primary); padding: 4px 12px; border-radius: 4px; font-size: 0.85rem; cursor: pointer; }
        .text-red { color: #ef4444; background: none; border: none; cursor: pointer; }
      `}</style>
    </div>
  );
}
