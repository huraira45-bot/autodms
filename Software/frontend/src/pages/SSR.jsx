import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Undo2, Percent, DollarSign, CheckCircle2, Circle, Search } from 'lucide-react';

const API_BASE = '/api';

export default function SSR() {
  const [parties, setParties] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [parts, setParts] = useState([]);
  const [sales, setSales] = useState([]);
  
  const [header, setHeader] = useState({
    ReturnDate: new Date().toISOString().split('T')[0],
    OriginalSaleID: '',
    PartyID: '',
    CustomerName: '',
    Remarks: '',
    WHID: ''
  });

  const [lineItems, setLineItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    ItemID: '', Qty: 1, SaleRate: 0, TaxPercent: 18, Discount: 0, 
    DiscType: 'Amount', IsGST: true, WHID: ''
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [pRes, wRes, itRes, sRes] = await Promise.all([
        axios.get(`${API_BASE}/parties`),
        axios.get(`${API_BASE}/inventory-config/warehouses`),
        axios.get(`${API_BASE}/items`),
        axios.get(`${API_BASE}/sales/store-sale`)
      ]);
      setParties(pRes.data);
      setWarehouses(wRes.data);
      setParts(itRes.data.filter(i => i.ItemType?.trim().toLowerCase() === 'part'));
      setSales(sRes.data);
      if (wRes.data.length > 0) {
        setHeader(h => ({ ...h, WHID: wRes.data[0].WHID }));
        setCurrentItem(c => ({ ...c, WHID: wRes.data[0].WHID }));
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchData(); }, []);

  const addLineItem = () => {
    if (!currentItem.ItemID || currentItem.Qty <= 0) return;
    const part = parts.find(p => p.ItemId == currentItem.ItemID);
    
    const subtotal = Number(currentItem.Qty) * Number(currentItem.SaleRate);
    const taxAmt = currentItem.IsGST ? (subtotal * (Number(currentItem.TaxPercent) / 100)) : 0;
    
    let discAmt = Number(currentItem.Discount);
    if (currentItem.DiscType === 'Percent') {
      discAmt = subtotal * (Number(currentItem.Discount) / 100);
    }

    const netAmt = subtotal + taxAmt - discAmt;

    const newItem = {
      ...currentItem,
      ItenName: part?.ItenName,
      TaxAmt: taxAmt,
      DiscAmt: discAmt,
      NetAmt: netAmt
    };
    
    setLineItems([...lineItems, newItem]);
    setCurrentItem({ ...currentItem, ItemID: '', Qty: 1, SaleRate: 0, Discount: 0, DiscType: 'Amount' });
  };

  const totals = {
    bill: lineItems.reduce((sum, i) => sum + (i.Qty * i.SaleRate), 0),
    tax: lineItems.reduce((sum, i) => sum + i.TaxAmt, 0),
    discount: lineItems.reduce((sum, i) => sum + i.DiscAmt, 0),
    payable: lineItems.reduce((sum, i) => sum + i.NetAmt, 0)
  };

  const handleSave = async () => {
    if (lineItems.length === 0 || !header.CustomerName) {
      alert('Please provide customer name and items.');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/sales/ssr`, {
        ...header,
        TotalReturnAmount: totals.bill,
        TotalTaxReturn: totals.tax,
        TotalDiscReturn: totals.discount,
        NetRefund: totals.payable,
        Items: lineItems
      });
      setSuccess(`Return Voucher ${res.data.ReturnNo} Saved Successfully!`);
      setLineItems([]);
      setHeader({ ...header, CustomerName: '', Remarks: '', OriginalSaleID: '' });
    } catch (err) {
      alert('Error: ' + (err.response?.data?.details || err.message));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card-header" style={{ borderLeftColor: '#f59e0b' }}>
        <div><h1 className="page-title">Store Sale Return (SSR)</h1><p className="page-subtitle">Process part returns and stock restatement.</p></div>
        <button className="btn" style={{ background: '#f59e0b' }} onClick={handleSave} disabled={loading}><Undo2 size={18} /> {loading ? 'Saving...' : 'Finalize Return'}</button>
      </div>

      {success && <div className="alert-success">{success}</div>}

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Return Metadata</h2>
          <div className="grid-2">
            <div className="form-group"><label>Return Date</label><input type="date" value={header.ReturnDate} onChange={e => setHeader({...header, ReturnDate: e.target.value})} /></div>
            <div className="form-group">
              <label>Link Original Invoice</label>
              <select value={header.OriginalSaleID} onChange={e => {
                const sale = sales.find(s => s.SaleID == e.target.value);
                setHeader({...header, OriginalSaleID: e.target.value, PartyID: sale?.PartyID || '', CustomerName: sale?.CustomerName || ''});
              }}>
                <option value="">No Link (Manual Return)</option>
                {sales.map(s => <option key={s.SaleID} value={s.SaleID}>{s.InvoiceNo} - {s.CustomerName}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Customer Name *</label><input type="text" value={header.CustomerName} onChange={e => setHeader({...header, CustomerName: e.target.value})} /></div>
          <div className="form-group"><label>Reason / Remarks</label><input type="text" value={header.Remarks} onChange={e => setHeader({...header, Remarks: e.target.value})} placeholder="Why is the part being returned?" /></div>
        </div>

        <div className="card" style={{ background: '#fffbeb' }}>
          <h2 className="card-title">Return Summary</h2>
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}><span>Base Return:</span><span>PKR {totals.bill.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}><span>Tax Refund:</span><span>PKR {totals.tax.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #fed7aa', marginBottom: '8px' }}><span>Discount Reversed:</span><span>- PKR {totals.discount.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '700' }}>Net Refund:</span>
              <span style={{ fontSize: '1.2rem', fontWeight: '700', color: '#d97706' }}>PKR {totals.payable.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '20px' }}>Part Selection</h2>
        <div className="item-entry-container">
          <div className="entry-row">
            <div className="form-group" style={{ flex: 3 }}>
              <label>Select Part to Return</label>
              <select value={currentItem.ItemID} onChange={e => {
                const part = parts.find(p => p.ItemId == e.target.value);
                setCurrentItem({...currentItem, ItemID: e.target.value, SaleRate: part?.ItemSalesPrice || 0});
              }}>
                <option value="">Search Part...</option>
                {parts.map(p => <option key={p.ItemId} value={p.ItemId}>{p.ItenName}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}><label>Qty</label><input type="number" value={currentItem.Qty} onChange={e => setCurrentItem({...currentItem, Qty: e.target.value})} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Original Rate</label><input type="number" value={currentItem.SaleRate} onChange={e => setCurrentItem({...currentItem, SaleRate: e.target.value})} /></div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Tax (%)</label>
              <div className={`input-with-icon ${!currentItem.IsGST ? 'disabled' : ''}`}>
                <input type="number" disabled={!currentItem.IsGST} value={currentItem.TaxPercent} onChange={e => setCurrentItem({...currentItem, TaxPercent: e.target.value})} />
                <Percent size={14} />
              </div>
            </div>
          </div>
          <div className="entry-row" style={{ marginTop: '12px' }}>
            <div className="form-group" style={{ flex: 1.5 }}>
              <label>Disc. to Reverse</label>
              <div className="input-with-toggle">
                <input type="number" value={currentItem.Discount} onChange={e => setCurrentItem({...currentItem, Discount: e.target.value})} />
                <button type="button" onClick={() => setCurrentItem({...currentItem, DiscType: currentItem.DiscType === 'Amount' ? 'Percent' : 'Amount'})}>
                  {currentItem.DiscType === 'Amount' ? <DollarSign size={14} /> : <Percent size={14} />}
                </button>
              </div>
            </div>
            <div className="form-group" style={{ flex: 1.5 }}>
              <label>Tax Type</label>
              <button type="button" className={`toggle-btn ${currentItem.IsGST ? 'active' : ''}`} onClick={() => setCurrentItem({...currentItem, IsGST: !currentItem.IsGST})}>
                {currentItem.IsGST ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                {currentItem.IsGST ? 'GST Applied' : 'Non-GST'}
              </button>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Restock Into</label>
              <select value={currentItem.WHID} onChange={e => setCurrentItem({...currentItem, WHID: e.target.value})}>
                {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
              </select>
            </div>
            <button className="btn btn-add" style={{ flex: 1, alignSelf: 'flex-end', height: '42px', background: '#f59e0b' }} type="button" onClick={addLineItem}><Plus size={20} /> Add to Return</button>
          </div>
        </div>

        <div className="table-wrapper" style={{ marginTop: '24px' }}>
          <table>
            <thead>
              <tr><th>Part Description</th><th>Qty</th><th>Rate</th><th>Tax</th><th>Disc.</th><th>Total Refund</th><th></th></tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '500' }}>{item.ItenName}</td>
                  <td>{item.Qty}</td><td>{item.SaleRate.toLocaleString()}</td>
                  <td style={{ color: 'var(--danger)' }}>+{item.TaxAmt.toFixed(2)}</td>
                  <td style={{ color: 'var(--success)' }}>-{item.DiscAmt.toFixed(2)}</td>
                  <td style={{ fontWeight: '600' }}>{item.NetAmt.toLocaleString()}</td>
                  <td><button onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
