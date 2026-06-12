import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, RotateCcw, Lock, Unlock, UserCircle, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE = '/api';

export default function GRTN() {
  const { hasModule, user } = useAuth();
  const [parties, setParties] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [parts, setParts] = useState([]);
  const [grtns, setGrtns] = useState([]);
  const [unfinalizeModal, setUnfinalizeModal] = useState(null);
  const [unfinalizeReason, setUnfinalizeReason] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const [header, setHeader] = useState({
    ReturnDate: new Date().toISOString().split('T')[0],
    PartyID: '',
    WHID: '',
    Remarks: '',
    OriginalGRNID: ''
  });

  const [lineItems, setLineItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    ItemID: '', Qty: 1, Rate: 0, Tax: 0, Discount: 0
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [grtnSearch, setGrtnSearch] = useState('');
  const [debouncedGrtnSearch, setDebouncedGrtnSearch] = useState('');

  const fetchFormData = async () => {
    try {
      const [pRes, wRes, itRes] = await Promise.all([
        axios.get(`${API_BASE}/customers`),
        axios.get(`${API_BASE}/inventory-config/warehouses`),
        axios.get(`${API_BASE}/items`)
      ]);
      setParties(pRes.data);
      setWarehouses(wRes.data);
      setParts(itRes.data.filter(i => i.ItemType === 'Part'));
    } catch (err) { console.error(err); }
  };

  const fetchGRTNs = async (s = '') => {
    try {
      const url = s ? `${API_BASE}/procurement/grtn?search=${encodeURIComponent(s)}` : `${API_BASE}/procurement/grtn`;
      const res = await axios.get(url);
      setGrtns(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchFormData(); }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedGrtnSearch(grtnSearch), 300);
    return () => clearTimeout(t);
  }, [grtnSearch]);
  useEffect(() => { fetchGRTNs(debouncedGrtnSearch); }, [debouncedGrtnSearch]);

  const addLineItem = () => {
    if (!currentItem.ItemID || currentItem.Qty <= 0) return;
    const part = parts.find(p => p.ItemId == currentItem.ItemID);
    const newItem = {
      ...currentItem,
      ItenName: part?.ItenName,
      Total: (currentItem.Qty * currentItem.Rate) + Number(currentItem.Tax) - Number(currentItem.Discount)
    };
    setLineItems([...lineItems, newItem]);
    setCurrentItem({ ItemID: '', Qty: 1, Rate: 0, Tax: 0, Discount: 0 });
  };

  const removeLineItem = (index) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateGrandTotal = () => lineItems.reduce((sum, item) => sum + item.Total, 0);

  const handleFinalize = async (id) => {
    if (!window.confirm('Finalize this GRTN?')) return;
    try {
      await axios.post(`/api/finalize/GRTN/${id}`);
      fetchGRTNs(debouncedGrtnSearch);
    } catch (e) { setStatusMsg('Error: ' + (e.response?.data?.error || e.message)); setTimeout(() => setStatusMsg(''), 3000); }
  };

  const handleRequestUnfinalize = async () => {
    if (!unfinalizeReason.trim()) return;
    try {
      await axios.post(`/api/finalize/GRTN/${unfinalizeModal}/request-unfinalize`, { reason: unfinalizeReason });
      setUnfinalizeModal(null); setUnfinalizeReason('');
      setStatusMsg('Unfinalize request submitted');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (e) { setStatusMsg('Error: ' + (e.response?.data?.error || e.message)); setTimeout(() => setStatusMsg(''), 3000); }
  };

  const handleSave = async () => {
    if (lineItems.length === 0 || !header.PartyID || !header.WHID) {
      alert('Please fill header and add at least one item.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/procurement/grtn`, {
        ...header,
        Items: lineItems,
        NetAmount: calculateGrandTotal(),
        DiscountAmount: lineItems.reduce((sum, item) => sum + Number(item.Discount), 0)
      });
      setSuccess('GRTN Saved Successfully!');
      setLineItems([]);
      setHeader({ ...header, Remarks: '', OriginalGRNID: '' });
      fetchGRTNs(debouncedGrtnSearch);
    } catch (err) {
      alert('Error: ' + (err.response?.data?.details || err.message));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card-header">
        <div>
          <h1 className="page-title">Goods Return Note (GRTN)</h1>
          <p className="page-subtitle">Return parts to suppliers for credit or refund.</p>
        </div>
        <button className="btn" style={{ background: '#f59e0b' }} onClick={handleSave} disabled={loading}>
          <RotateCcw size={18} /> {loading ? 'Saving...' : 'Save Return'}
        </button>
      </div>

      {success && <div className="alert-success">{success}</div>}
      {statusMsg && <div style={{ background: statusMsg.startsWith('Error') ? '#fee2e2' : '#dcfce7', color: statusMsg.startsWith('Error') ? '#b91c1c' : '#166534', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{statusMsg}</div>}

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '16px' }}>Return Header</h2>
          <div className="grid-2">
            <div className="form-group">
              <label>Supplier / Party *</label>
              <select value={header.PartyID} onChange={e => setHeader({...header, PartyID: e.target.value})}>
                <option value="">Select Supplier...</option>
                {parties.map(p => <option key={p.PartyID} value={p.PartyID}>{p.PartyName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>From Store *</label>
              <select value={header.WHID} onChange={e => setHeader({...header, WHID: e.target.value})}>
                <option value="">Select Warehouse...</option>
                {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Return Date</label>
              <input type="date" value={header.ReturnDate} onChange={e => setHeader({...header, ReturnDate: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Orig. GRN ID (Ref)</label>
              <input type="number" placeholder="Optional" value={header.OriginalGRNID} onChange={e => setHeader({...header, OriginalGRNID: e.target.value})} />
            </div>
          </div>
        </div>

        <div className="card" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <h2 className="card-title">Return Summary</h2>
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>Items to Return:</span>
              <span style={{ fontWeight: '600' }}>{lineItems.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderTop: '2px solid #fde68a', marginTop: '16px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '700' }}>Return Total:</span>
              <span style={{ fontSize: '1.2rem', fontWeight: '700', color: '#d97706' }}>
                PKR {calculateGrandTotal().toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '16px' }}>Line Items</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: '12px', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Select Part</label>
            <select value={currentItem.ItemID} onChange={e => {
              const part = parts.find(p => p.ItemId == e.target.value);
              setCurrentItem({...currentItem, ItemID: e.target.value, Rate: part?.ItemPurchasePrice || 0});
            }}>
              <option value="">Search Part...</option>
              {parts.map(p => <option key={p.ItemId} value={p.ItemId}>{p.ItenName} ({p.ItemNumber})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Qty</label>
            <input type="number" value={currentItem.Qty} onChange={e => setCurrentItem({...currentItem, Qty: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Return Rate</label>
            <input type="number" value={currentItem.Rate} onChange={e => setCurrentItem({...currentItem, Rate: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tax Adj.</label>
            <input type="number" value={currentItem.Tax} onChange={e => setCurrentItem({...currentItem, Tax: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Disc. Adj.</label>
            <input type="number" value={currentItem.Discount} onChange={e => setCurrentItem({...currentItem, Discount: e.target.value})} />
          </div>
          <button className="btn" style={{ height: '42px', background: '#f59e0b' }} onClick={addLineItem}>
            <Plus size={20} />
          </button>
        </div>

        <div className="table-wrapper" style={{ marginTop: '24px' }}>
          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Tax</th>
                <th>Discount</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '500' }}>{item.ItenName}</td>
                  <td>{item.Qty}</td>
                  <td>{item.Rate}</td>
                  <td>{item.Tax}</td>
                  <td>{item.Discount}</td>
                  <td style={{ fontWeight: '600' }}>{item.Total.toLocaleString()}</td>
                  <td>
                    <button onClick={() => removeLineItem(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="card-title" style={{ margin: 0 }}>Recent Returns (GRTN)</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 8, height: 36, width: 300 }}>
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.85rem', background: 'transparent' }}
              placeholder="Search GRTN#, Supplier..."
              value={grtnSearch} onChange={e => setGrtnSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>GRTN Code</th><th>Date</th><th>Orig. GRN</th><th>Amount</th><th>Created By</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grtns.map(g => (
                <tr key={g.PurchaseReturnID}>
                  <td><span style={{ fontWeight: '600', color: '#d97706' }}>{g.PurchaseReturnNo}</span></td>
                  <td>{new Date(g.PurchaseReturnDate).toLocaleDateString()}</td>
                  <td>{g.OriginalGRNID || '-'}</td>
                  <td style={{ fontWeight: '600' }}>PKR {parseFloat(g.NetAmount || 0).toLocaleString()}</td>
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
                    {!g.IsFinalized && hasModule('finalize') && (user?.userId === g.CreatedBy || hasModule('admin_unfinalize')) && (
                      <button onClick={() => handleFinalize(g.PurchaseReturnID)}
                        style={{ padding: '4px 10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Lock size={12} /> Finalize
                      </button>
                    )}
                    {g.IsFinalized && (
                      <button onClick={() => { setUnfinalizeModal(g.PurchaseReturnID); setUnfinalizeReason(''); }}
                        style={{ padding: '4px 10px', background: 'transparent', color: '#d97706', border: '1px solid #d97706', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Unlock size={12} /> Request Unfinalize
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {unfinalizeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ marginBottom: 8 }}>Request Unfinalize — GRTN</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>This will go to Account Manager then Admin for final unfinalize.</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Reason *</label>
            <textarea className="form-input" rows={4} value={unfinalizeReason} onChange={e => setUnfinalizeReason(e.target.value)}
              style={{ width: '100%', resize: 'vertical', marginBottom: 16 }} placeholder="Explain why..." />
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
