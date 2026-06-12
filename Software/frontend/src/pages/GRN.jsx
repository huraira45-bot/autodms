import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Upload, Percent, DollarSign, CheckCircle2, Circle, Lock, Unlock, UserCircle, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE = '/api';

export default function GRN() {
  const { hasModule, user } = useAuth();
  const [parties, setParties] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [parts, setParts] = useState([]);
  const [grns, setGrns] = useState([]);

  const [header, setHeader] = useState({
    PurchaseDate: new Date().toISOString().split('T')[0],
    SupplierBillNo: '',
    PartyID: '',
    WHID: '',
    Remarks: '',
    FreightAmount: 0,
    FreightTaxable: true,    // Decision #15 — defaults YES (FBR-correct)
  });

  const [billImage, setBillImage] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    ItemID: '', Qty: 1, Rate: 0, SalesRate: 0, TaxPercent: 0, Discount: 0,
    DiscType: 'Amount', IsGST: true, OtherExp: 0
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [unfinalizeModal, setUnfinalizeModal] = useState(null); // PurchaseID
  const [unfinalizeReason, setUnfinalizeReason] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [grnSearch, setGrnSearch] = useState('');
  const [debouncedGrnSearch, setDebouncedGrnSearch] = useState('');

  const fetchFormData = async () => {
    try {
      const [pRes, wRes, itRes] = await Promise.all([
        axios.get(`${API_BASE}/parties`),
        axios.get(`${API_BASE}/inventory-config/warehouses`),
        axios.get(`${API_BASE}/items`)
      ]);
      setParties(pRes.data);
      setWarehouses(wRes.data);
      setParts(itRes.data.filter(i => i.ItemType?.trim().toLowerCase() === 'part'));
    } catch (err) { console.error('Error fetching data:', err); }
  };

  const fetchGRNs = async (s = '') => {
    try {
      const url = s ? `${API_BASE}/procurement/grn?search=${encodeURIComponent(s)}` : `${API_BASE}/procurement/grn`;
      const res = await axios.get(url);
      setGrns(res.data);
    } catch (err) { console.error('Error fetching GRNs:', err); }
  };

  useEffect(() => { fetchFormData(); }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedGrnSearch(grnSearch), 300);
    return () => clearTimeout(t);
  }, [grnSearch]);
  useEffect(() => { fetchGRNs(debouncedGrnSearch); }, [debouncedGrnSearch]);

  const addLineItem = () => {
    if (!currentItem.ItemID || currentItem.Qty <= 0) return;
    const part = parts.find(p => p.ItemId == currentItem.ItemID);
    const subtotal = Number(currentItem.Qty) * Number(currentItem.Rate);
    const taxAmt = currentItem.IsGST ? (subtotal * (Number(currentItem.TaxPercent) / 100)) : 0;
    let discAmt = Number(currentItem.Discount);
    if (currentItem.DiscType === 'Percent') discAmt = subtotal * (Number(currentItem.Discount) / 100);
    const total = subtotal + taxAmt + Number(currentItem.OtherExp) - discAmt;
    setLineItems([...lineItems, { ...currentItem, ItenName: part?.ItenName, CalculatedTax: taxAmt, CalculatedDiscount: discAmt, Total: total }]);
    setCurrentItem({ ItemID: '', Qty: 1, Rate: 0, SalesRate: 0, TaxPercent: 0, Discount: 0, DiscType: 'Amount', IsGST: true, OtherExp: 0 });
  };

  const removeLineItem = (index) => setLineItems(lineItems.filter((_, i) => i !== index));
  const calculateGrandTotal = () => lineItems.reduce((sum, item) => sum + item.Total, 0);

  const handleSave = async () => {
    if (lineItems.length === 0 || !header.PartyID || !header.WHID) {
      alert('Please fill header and add at least one item.');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('PurchaseDate', header.PurchaseDate);
    formData.append('SupplierBillNo', header.SupplierBillNo);
    formData.append('PartyID', header.PartyID);
    formData.append('WHID', header.WHID);
    formData.append('Remarks', header.Remarks);
    formData.append('NetDiscount', lineItems.reduce((sum, item) => sum + item.CalculatedDiscount, 0));
    formData.append('FreightAmount', header.FreightAmount || 0);
    formData.append('FreightTaxable', header.FreightTaxable ? 'true' : 'false');
    formData.append('Items', JSON.stringify(lineItems.map(i => ({ ...i, Tax: i.CalculatedTax, Discount: i.CalculatedDiscount }))));
    if (billImage) formData.append('BillImage', billImage);
    try {
      await axios.post(`${API_BASE}/procurement/grn`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSuccess('GRN Saved Successfully!');
      setLineItems([]); setBillImage(null);
      setHeader({ ...header, SupplierBillNo: '', Remarks: '' });
      fetchGRNs(debouncedGrnSearch);
    } catch (err) {
      alert('Error: ' + (err.response?.data?.details || err.message));
    } finally { setLoading(false); }
  };

  const handleFinalize = async (id) => {
    if (!window.confirm('Finalize this GRN?')) return;
    try {
      await axios.post(`/api/finalize/GRN/${id}`);
      fetchGRNs(debouncedGrnSearch);
    } catch (e) { setErrMsg(e.response?.data?.error || 'Error'); setTimeout(() => setErrMsg(''), 3000); }
  };

  const handleRequestUnfinalize = async () => {
    if (!unfinalizeReason.trim()) return;
    try {
      await axios.post(`/api/finalize/GRN/${unfinalizeModal}/request-unfinalize`, { reason: unfinalizeReason });
      setUnfinalizeModal(null); setUnfinalizeReason('');
      setSuccess('Unfinalize request submitted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setErrMsg(e.response?.data?.error || 'Error'); setTimeout(() => setErrMsg(''), 3000); }
  };

  const canFinalizeRow = (row) => hasModule('finalize') && (user?.userId === row.CreatedBy || hasModule('admin_unfinalize'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card-header">
        <div><h1 className="page-title">Goods Receiving Note</h1><p className="page-subtitle">Procurement & Price Management.</p></div>
        <button className="btn" onClick={handleSave} disabled={loading}><Save size={18} /> {loading ? 'Saving...' : 'Save GRN'}</button>
      </div>

      {success && <div className="alert-success">{success}</div>}
      {errMsg && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div>}

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '16px' }}>Document Header</h2>
        <div className="grid-4">
          <div className="form-group">
            <label>Supplier *</label>
            <select value={header.PartyID} onChange={e => setHeader({ ...header, PartyID: e.target.value })}>
              <option value="">Select Supplier...</option>
              {parties.map(p => <option key={p.PartyID} value={p.PartyID}>{p.PartyName}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Store *</label>
            <select value={header.WHID} onChange={e => setHeader({ ...header, WHID: e.target.value })}>
              <option value="">Select Store...</option>
              {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Date</label><input type="date" value={header.PurchaseDate} onChange={e => setHeader({ ...header, PurchaseDate: e.target.value })} /></div>
          <div className="form-group"><label>Bill #</label><input type="text" value={header.SupplierBillNo} onChange={e => setHeader({ ...header, SupplierBillNo: e.target.value })} /></div>
          <div className="form-group">
            <label>Freight Amount</label>
            <input type="number" min="0" step="0.01" value={header.FreightAmount} onChange={e => setHeader({ ...header, FreightAmount: e.target.value })} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={header.FreightTaxable}
                onChange={e => setHeader({ ...header, FreightTaxable: e.target.checked })}
              />
              <span>Freight is taxable (GST applies)</span>
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '20px' }}>Line Item Entry</h2>
        <div className="item-entry-container">
          <div className="entry-row">
            <div className="form-group" style={{ flex: 3 }}>
              <label>Part / Description</label>
              <select value={currentItem.ItemID} onChange={e => {
                const part = parts.find(p => p.ItemId == e.target.value);
                setCurrentItem({ ...currentItem, ItemID: e.target.value, Rate: part?.ItemPurchasePrice || 0, SalesRate: part?.ItemSalesPrice || 0 });
              }}>
                <option value="">Search Part...</option>
                {parts.map(p => <option key={p.ItemId} value={p.ItemId}>{p.ItenName}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}><label>Qty</label><input type="number" value={currentItem.Qty} onChange={e => setCurrentItem({ ...currentItem, Qty: e.target.value })} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Pur. Rate</label><input type="number" value={currentItem.Rate} onChange={e => setCurrentItem({ ...currentItem, Rate: e.target.value })} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Sale Rate</label><input type="number" value={currentItem.SalesRate} onChange={e => setCurrentItem({ ...currentItem, SalesRate: e.target.value })} style={{ color: 'var(--primary)', fontWeight: '600' }} /></div>
          </div>
          <div className="entry-row" style={{ marginTop: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Tax (%)</label>
              <div className={`input-with-icon ${!currentItem.IsGST ? 'disabled' : ''}`}>
                <input type="number" disabled={!currentItem.IsGST} value={currentItem.TaxPercent} onChange={e => setCurrentItem({ ...currentItem, TaxPercent: e.target.value })} />
                <Percent size={14} />
              </div>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Discount</label>
              <div className="input-with-toggle">
                <input type="number" value={currentItem.Discount} onChange={e => setCurrentItem({ ...currentItem, Discount: e.target.value })} />
                <button type="button" onClick={() => setCurrentItem({ ...currentItem, DiscType: currentItem.DiscType === 'Amount' ? 'Percent' : 'Amount' })}>
                  {currentItem.DiscType === 'Amount' ? <DollarSign size={14} /> : <Percent size={14} />}
                </button>
              </div>
            </div>
            <div className="form-group" style={{ flex: 1 }}><label>Other Exp</label><input type="number" value={currentItem.OtherExp} onChange={e => setCurrentItem({ ...currentItem, OtherExp: e.target.value })} /></div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Tax Type</label>
              <button type="button" className={`toggle-btn ${currentItem.IsGST ? 'active' : ''}`} onClick={() => setCurrentItem({ ...currentItem, IsGST: !currentItem.IsGST })}>
                {currentItem.IsGST ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                {currentItem.IsGST ? 'GST' : 'Non-GST'}
              </button>
            </div>
            <button className="btn btn-add" style={{ flex: 1, alignSelf: 'flex-end', height: '42px' }} type="button" onClick={addLineItem}><Plus size={20} /> Add Part</button>
          </div>
        </div>
        <div className="table-wrapper" style={{ marginTop: '24px' }}>
          <table>
            <thead>
              <tr><th>Description</th><th>Type</th><th>Qty</th><th>Pur. Rate</th><th>Sale Rate</th><th>Tax (Amt)</th><th>Discount</th><th>Other Exp</th><th>Total</th><th></th></tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '500' }}>{item.ItenName}</td>
                  <td><span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: item.IsGST ? '#dcfce7' : '#f1f5f9', color: item.IsGST ? '#166534' : '#475569' }}>{item.IsGST ? 'GST' : 'Non-GST'}</span></td>
                  <td>{item.Qty}</td><td>{item.Rate}</td>
                  <td style={{ color: 'var(--primary)', fontWeight: '600' }}>{item.SalesRate}</td>
                  <td style={{ color: 'var(--danger)' }}>+{item.CalculatedTax.toFixed(2)}</td>
                  <td style={{ color: 'var(--success)' }}>-{item.CalculatedDiscount.toFixed(2)}</td>
                  <td style={{ color: 'var(--warning)' }}>+{item.OtherExp}</td>
                  <td style={{ fontWeight: '600' }}>{item.Total.toLocaleString()}</td>
                  <td><button onClick={() => removeLineItem(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card financials-bar">
        <div className="financial-item"><label>Total Tax</label><div className="value" style={{ color: 'var(--danger)' }}>PKR {lineItems.reduce((s, i) => s + i.CalculatedTax, 0).toLocaleString()}</div></div>
        <div className="financial-item"><label>Total Discount</label><div className="value" style={{ color: 'var(--success)' }}>PKR {lineItems.reduce((s, i) => s + i.CalculatedDiscount, 0).toLocaleString()}</div></div>
        <div className="financial-item"><label>Total Other Exp</label><div className="value" style={{ color: 'var(--warning)' }}>PKR {lineItems.reduce((s, i) => s + Number(i.OtherExp), 0).toLocaleString()}</div></div>
        <div className="financial-item total"><label>Net Payable Amount</label><div className="value">PKR {calculateGrandTotal().toLocaleString()}</div></div>
      </div>

      {/* Recent GRNs */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="card-title" style={{ margin: 0 }}>Recent GRNs</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 8, height: 36, width: 300 }}>
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.85rem', background: 'transparent' }}
              placeholder="Search GRN#, Bill#, Supplier..."
              value={grnSearch} onChange={e => setGrnSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>GRN Code</th><th>Date</th><th>Bill #</th><th>Created By</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {grns.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No GRNs found.</td></tr>
                : grns.map(g => (
                  <tr key={g.PurchaseID}>
                    <td><strong style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{g.PurchaseCode}</strong></td>
                    <td>{new Date(g.PurchaseDate).toLocaleDateString()}</td>
                    <td>{g.SupplierBillNo || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {g.CreatedByName ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserCircle size={13} />{g.CreatedByName}</span> : '—'}
                    </td>
                    <td>
                      {g.IsFinalized
                        ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> Finalized</span>
                        : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#166534' }}>Active</span>
                      }
                    </td>
                    <td>
                      {!g.IsFinalized && canFinalizeRow(g) && (
                        <button onClick={() => handleFinalize(g.PurchaseID)}
                          style={{ padding: '4px 10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Lock size={12} /> Finalize
                        </button>
                      )}
                      {g.IsFinalized && (
                        <button onClick={() => { setUnfinalizeModal(g.PurchaseID); setUnfinalizeReason(''); }}
                          style={{ padding: '4px 10px', background: 'transparent', color: '#d97706', border: '1px solid #d97706', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Unlock size={12} /> Request Unfinalize
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Unfinalize Request Modal */}
      {unfinalizeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ marginBottom: 8 }}>Request Unfinalize — GRN</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>This request will go to the Account Manager, then Admin for final unfinalize.</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Reason *</label>
            <textarea className="form-input" rows={4} value={unfinalizeReason} onChange={e => setUnfinalizeReason(e.target.value)}
              style={{ width: '100%', resize: 'vertical', marginBottom: 16 }} placeholder="Explain why this GRN needs to be unfinalized..." />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleRequestUnfinalize}>Submit Request</button>
              <button className="btn-secondary" onClick={() => setUnfinalizeModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
