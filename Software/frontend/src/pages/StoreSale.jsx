import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, ShoppingCart, Percent, DollarSign, CheckCircle2, Circle, User, Truck, CreditCard } from 'lucide-react';

const API_BASE = '/api';

export default function StoreSale() {
  const [parties, setParties] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [parts, setParts] = useState([]);
  const [banks, setBanks] = useState([]);

  const [header, setHeader] = useState({
    SaleDate: new Date().toISOString().split('T')[0],
    PartyID: '',
    CustomerName: '',
    VehicleName: '',
    Variant: '',
    PaymentMode: 'Cash',
    PaymentBankID: '',
    NICNo: '',
    MobileNo: '',
    SODONO: '', // S/O, W/O, D/O
    Remarks: '',
    City: 'MULTAN',
    FBRInvoiceNo: '0000000000',
    WHID: ''
  });

  const [lineItems, setLineItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    ItemID: '', Qty: 1, SaleRate: 0, PurRate: 0, TaxPercent: 18, Discount: 0, 
    DiscType: 'Amount', IsGST: true, WHID: ''
  });

  const [receivedAmount, setReceivedAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [pRes, wRes, itRes, bRes] = await Promise.all([
        axios.get(`${API_BASE}/parties`),
        axios.get(`${API_BASE}/inventory-config/warehouses`),
        axios.get(`${API_BASE}/items`),
        axios.get(`${API_BASE}/accounts/banks`).catch(() => ({ data: [] }))
      ]);
      setParties(pRes.data);
      setWarehouses(wRes.data);
      setParts(itRes.data.filter(i => i.ItemType?.trim().toLowerCase() === 'part'));
      setBanks(bRes.data);
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
    setCurrentItem({ ...currentItem, ItemID: '', Qty: 1, SaleRate: 0, PurRate: 0, Discount: 0, DiscType: 'Amount' });
  };

  const totals = {
    bill: lineItems.reduce((sum, i) => sum + (i.Qty * i.SaleRate), 0),
    tax: lineItems.reduce((sum, i) => sum + i.TaxAmt, 0),
    discount: lineItems.reduce((sum, i) => sum + i.DiscAmt, 0),
    payable: lineItems.reduce((sum, i) => sum + i.NetAmt, 0)
  };

  const handleSave = async () => {
    if (lineItems.length === 0 || !header.CustomerName) {
      alert('Please enter customer name and add at least one item.');
      return;
    }
    if (header.PaymentMode === 'Credit' && !header.PartyID) {
      alert('Credit sale requires a named Party. Pick one from the Party dropdown above.');
      return;
    }
    if (header.PaymentMode === 'Bank Transfer' && !header.PaymentBankID) {
      alert('Bank Transfer requires a bank account.');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/sales/store-sale`, {
        ...header,
        TotalBillAmount: totals.bill,
        TotalTaxAmount: totals.tax,
        TotalDiscount: totals.discount,
        NetPayable: totals.payable,
        Items: lineItems
      });
      setSuccess(`Invoice ${res.data.InvoiceNo} Saved Successfully!`);
      setLineItems([]);
      setHeader({ ...header, CustomerName: '', VehicleName: '', Variant: '', NICNo: '', MobileNo: '', Remarks: '' });
    } catch (err) {
      alert('Error saving sale: ' + (err.response?.data?.details || err.response?.data?.error || err.message));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card-header">
        <div><h1 className="page-title">Store Sale (Spares)</h1><p className="page-subtitle">Counter sales for spare parts and accessories.</p></div>
        <button className="btn" onClick={handleSave} disabled={loading}><ShoppingCart size={18} /> {loading ? 'Processing...' : 'Finalize Sale'}</button>
      </div>

      {success && <div className="alert-success">{success}</div>}

      <div className="grid-3">
        {/* Card 1: Party/Customer */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--primary)' }}><User size={18} /><strong>Customer Info</strong></div>
          <div className="form-group">
            <label>Party Name</label>
            <select value={header.PartyID} onChange={e => setHeader({...header, PartyID: e.target.value})}>
              <option value="">Select Account...</option>
              {parties.map(p => <option key={p.PartyID} value={p.PartyID}>{p.PartyName}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Customer Name *</label><input type="text" value={header.CustomerName} onChange={e => setHeader({...header, CustomerName: e.target.value})} /></div>
          <div className="grid-2">
            <div className="form-group"><label>Vehicle</label><input type="text" value={header.VehicleName} onChange={e => setHeader({...header, VehicleName: e.target.value})} /></div>
            <div className="form-group"><label>Variant</label><input type="text" value={header.Variant} onChange={e => setHeader({...header, Variant: e.target.value})} /></div>
          </div>
        </div>

        {/* Card 2: Payment/KYC */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--primary)' }}><CreditCard size={18} /><strong>Payment & Details</strong></div>
          <div className="form-group">
            <label>Payment Mode</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Cash', 'POS', 'Cheque', 'Bank Transfer', 'Credit'].map(pm => (
                <button
                  key={pm}
                  type="button"
                  className={`toggle-btn ${header.PaymentMode === pm ? 'active' : ''}`}
                  onClick={() => setHeader({ ...header, PaymentMode: pm, PaymentBankID: pm === 'Bank Transfer' ? header.PaymentBankID : '' })}
                  style={{ flex: '1 1 auto', minWidth: 80, fontSize: '0.85rem' }}
                >
                  {pm === 'POS' ? 'POS' : pm}
                </button>
              ))}
            </div>
          </div>
          {header.PaymentMode === 'Bank Transfer' && (
            <div className="form-group">
              <label>Bank Account *</label>
              <select value={header.PaymentBankID} onChange={e => setHeader({...header, PaymentBankID: e.target.value})}>
                <option value="">Select Bank...</option>
                {banks.map(b => <option key={b.GLCAID} value={b.GLCAID}>{b.GLCode} — {b.GLTitle}</option>)}
              </select>
              {banks.length === 0 && (
                <small style={{ color: '#a16207' }}>No banks configured. Mark a leaf account as bank from Chart of Accounts.</small>
              )}
            </div>
          )}
          {header.PaymentMode === 'Credit' && !header.PartyID && (
            <small style={{ color: '#b45309', display: 'block', marginTop: -8, marginBottom: 8 }}>
              Pick a named Party above — Credit sale posts to that party's Trade Debtors balance.
            </small>
          )}
          <div className="grid-2">
            <div className="form-group"><label>NIC No</label><input type="text" value={header.NICNo} onChange={e => setHeader({...header, NICNo: e.target.value})} /></div>
            <div className="form-group"><label>Mobile #</label><input type="text" value={header.MobileNo} onChange={e => setHeader({...header, MobileNo: e.target.value})} /></div>
          </div>
          <div className="form-group"><label>Remarks</label><input type="text" value={header.Remarks} onChange={e => setHeader({...header, Remarks: e.target.value})} /></div>
        </div>

        {/* Card 3: System/Invoice */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--primary)' }}><Truck size={18} /><strong>Invoice Details</strong></div>
          <div className="grid-2">
            <div className="form-group"><label>Date</label><input type="date" value={header.SaleDate} onChange={e => setHeader({...header, SaleDate: e.target.value})} /></div>
            <div className="form-group"><label>City</label><input type="text" value={header.City} onChange={e => setHeader({...header, City: e.target.value})} /></div>
          </div>
          <div className="form-group"><label>FBR Invoice No</label><input type="text" value={header.FBRInvoiceNo} onChange={e => setHeader({...header, FBRInvoiceNo: e.target.value})} /></div>
          <div className="form-group"><label>Warehouse</label>
            <select value={header.WHID} onChange={e => setHeader({...header, WHID: e.target.value})}>
              {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Line Item Entry */}
      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '20px' }}>Part Selection</h2>
        <div className="item-entry-container">
          <div className="entry-row">
            <div className="form-group" style={{ flex: 3 }}>
              <label>Select Part</label>
              <select value={currentItem.ItemID} onChange={e => {
                const part = parts.find(p => p.ItemId == e.target.value);
                setCurrentItem({...currentItem, ItemID: e.target.value, SaleRate: part?.ItemSalesPrice || 0, PurRate: part?.ItemPurchasePrice || 0});
              }}>
                <option value="">Search Part...</option>
                {parts.map(p => <option key={p.ItemId} value={p.ItemId}>{p.ItenName}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}><label>Qty</label><input type="number" value={currentItem.Qty} onChange={e => setCurrentItem({...currentItem, Qty: e.target.value})} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Price</label><input type="number" value={currentItem.SaleRate} onChange={e => setCurrentItem({...currentItem, SaleRate: e.target.value})} /></div>
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
              <label>Discount</label>
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
                {currentItem.IsGST ? 'Apply GST' : 'Non-GST'}
              </button>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Issue From</label>
              <select value={currentItem.WHID} onChange={e => setCurrentItem({...currentItem, WHID: e.target.value})}>
                {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
              </select>
            </div>
            <button className="btn btn-add" style={{ flex: 1, alignSelf: 'flex-end', height: '42px' }} type="button" onClick={addLineItem}><Plus size={20} /> Add to Cart</button>
          </div>
        </div>

        <div className="table-wrapper" style={{ marginTop: '24px' }}>
          <table>
            <thead>
              <tr><th>Part Description</th><th>Qty</th><th>Rate</th><th>Tax</th><th>Disc.</th><th>Total</th><th></th></tr>
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

      {/* Summary Footer Bar */}
      <div className="card financials-bar" style={{ background: 'var(--primary)', color: 'white' }}>
        <div className="financial-item">
          <label style={{ color: 'rgba(255,255,255,0.7)' }}>Total Bill</label>
          <div className="value" style={{ color: 'white' }}>PKR {totals.bill.toLocaleString()}</div>
        </div>
        <div className="financial-item">
          <label style={{ color: 'rgba(255,255,255,0.7)' }}>Total Tax</label>
          <div className="value" style={{ color: 'white' }}>PKR {totals.tax.toLocaleString()}</div>
        </div>
        <div className="financial-item">
          <label style={{ color: 'rgba(255,255,255,0.7)' }}>Total Discount</label>
          <div className="value" style={{ color: 'white' }}>PKR {totals.discount.toLocaleString()}</div>
        </div>
        <div className="financial-item total">
          <label style={{ color: 'rgba(255,255,255,0.7)' }}>Payable Amount</label>
          <div className="value" style={{ color: '#fbbf24' }}>PKR {totals.payable.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
