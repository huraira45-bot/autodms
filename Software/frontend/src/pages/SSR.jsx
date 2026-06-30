import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Undo2, Percent, DollarSign, CheckCircle2, Circle, Search, Printer, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { useCan } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';

const API_BASE = '/api';

const blankHeader = () => ({
  ReturnDate: new Date().toISOString().split('T')[0],
  OriginalSaleID: '',
  PartyID: '',
  CustomerName: '',
  Remarks: '',
  WHID: '',
  RefundMode: 'Cash',
  RefundBankID: '',
});

export default function SSR() {
  const { notify, confirm } = useFeedback();
  const { canInsert, canEdit } = useCan('sales_ssr');
  const [parties, setParties] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [parts, setParts] = useState([]);
  const [sales, setSales] = useState([]);

  // Prior returns — for browsing/opening
  const [returns, setReturns]   = useState([]);
  const [search, setSearch]     = useState('');
  const [showList, setShowList] = useState(false);

  // Edit state — when set, we're viewing/editing an existing return
  const [editingId, setEditingId]       = useState(null);
  const [returnNo, setReturnNo]         = useState('');
  const [isFinalized, setIsFinalized]   = useState(false);
  const [finalizedBy, setFinalizedBy]   = useState('');
  const [finalizedAt, setFinalizedAt]   = useState(null);

  const [header, setHeader] = useState(blankHeader());

  const [lineItems, setLineItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    ItemID: '', Qty: 1, SaleRate: 0, TaxPercent: 18, Discount: 0,
    DiscType: 'Amount', IsGST: true, WHID: ''
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const disabled = isFinalized;   // finalized returns are read-only

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

  // Prior returns
  const fetchReturns = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE}/sales/ssr`, { params: search ? { search } : {} });
      setReturns(r.data || []);
    } catch (e) { /* silent — list just stays empty */ }
  }, [search]);

  useEffect(() => { if (showList) fetchReturns(); }, [showList, fetchReturns]);

  const startNew = () => {
    setEditingId(null);
    setReturnNo('');
    setIsFinalized(false);
    setFinalizedBy('');
    setFinalizedAt(null);
    setHeader(blankHeader());
    setLineItems([]);
    setSuccess('');
  };

  const openReturn = async (id) => {
    try {
      const r = await axios.get(`${API_BASE}/sales/ssr/${id}`);
      const d = r.data;
      setEditingId(d.ReturnID);
      setReturnNo(d.ReturnNo || '');
      setIsFinalized(!!d.IsFinalized);
      setFinalizedBy(d.FinalizedByName || '');
      setFinalizedAt(d.FinalizedAt);
      setHeader({
        ReturnDate:     d.ReturnDate ? new Date(d.ReturnDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        OriginalSaleID: d.OriginalSaleID || '',
        PartyID:        d.PartyID || '',
        CustomerName:   d.CustomerName || '',
        Remarks:        d.Remarks || '',
        WHID:           d.WHID || '',
        RefundMode:     d.RefundMode || 'Cash',
        RefundBankID:   d.RefundBankID || '',
      });
      setLineItems((d.Items || []).map(it => {
        const qty   = Number(it.Quantity) || 0;
        const rate  = Number(it.SaleRate) || 0;
        const taxAmt = Number(it.TaxAmount) || 0;
        const discAmt = Number(it.DiscountAmount) || 0;
        return {
          ItemID: it.ItemID,
          ItenName: it.ItenName,
          Qty: qty,
          SaleRate: rate,
          TaxPercent: Number(it.TaxPercent) || 0,
          IsGST: taxAmt > 0,
          Discount: discAmt,
          DiscType: 'Amount',
          TaxAmt: taxAmt,
          DiscAmt: discAmt,
          NetAmt: Number(it.NetAmount) || 0,
          WHID: it.WHID || '',
        };
      }));
      setShowList(false);
      setSuccess('');
    } catch (err) {
      notify({ type: 'error', title: 'Open failed', message: err.response?.data?.error || err.message });
    }
  };

  // First / Prev / Next / Last navigation across the loaded list
  const navTo = (delta) => {
    if (!returns.length) return;
    if (!editingId) { openReturn(returns[0].ReturnID); return; }
    const idx = returns.findIndex(r => r.ReturnID === editingId);
    let next;
    if (delta === 'first') next = 0;
    else if (delta === 'last') next = returns.length - 1;
    else next = Math.max(0, Math.min(returns.length - 1, idx + delta));
    if (next !== idx && returns[next]) openReturn(returns[next].ReturnID);
  };

  const addLineItem = () => {
    if (disabled) return;
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
    if (disabled) return;
    if (lineItems.length === 0 || !header.CustomerName) {
      notify({ type: 'warning', title: 'Return is incomplete', message: 'Provide customer name and add at least one item.' });
      return;
    }
    const isEdit = !!editingId;
    if (!isEdit) {
      const ok = await confirm({
        title: 'Finalize this sale return?',
        message: 'This will save the return voucher and restate stock for the returned parts.',
        details: `Net refund: PKR ${Number(totals.payable || 0).toLocaleString('en-PK')}.`,
        confirmLabel: 'Finalize return',
        tone: 'warning',
      });
      if (!ok) return;
    }
    setLoading(true);
    try {
      const payload = {
        ...header,
        TotalReturnAmount: totals.bill,
        TotalTaxReturn: totals.tax,
        TotalDiscReturn: totals.discount,
        NetRefund: totals.payable,
        Items: lineItems,
      };
      if (isEdit) {
        await axios.put(`${API_BASE}/sales/ssr/${editingId}`, payload);
        notify({ type: 'success', title: 'Return updated', message: `Return ${returnNo} was updated.` });
        setSuccess(`Return ${returnNo} updated.`);
      } else {
        const res = await axios.post(`${API_BASE}/sales/ssr`, payload);
        setSuccess(`Return Voucher ${res.data.ReturnNo} Saved Successfully!`);
        notify({ type: 'success', title: 'Return finalized', message: `Return voucher ${res.data.ReturnNo} was saved.` });
        startNew();
      }
      fetchReturns();
    } catch (err) {
      notify({ type: 'error', title: isEdit ? 'Update failed' : 'Return failed', message: err.response?.data?.error || err.response?.data?.details || err.message });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="print-only print-header">
        <h1>Store Sale Return (SSR)</h1>
        <div className="meta">
          <span>Date: {header.ReturnDate}  •  Customer: {header.CustomerName || '—'}</span>
          <span>Printed: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>
      <div className="card-header" style={{ borderLeftColor: '#f59e0b' }}>
        <div>
          <h1 className="page-title">
            Store Sale Return (SSR)
            {editingId && (
              <>
                <span style={{ marginLeft: 10, fontSize: '0.7em', color: '#475569', fontFamily: 'monospace' }}>· {returnNo || `#${editingId}`}</span>
                {isFinalized && <span style={{ marginLeft: 10, background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: '0.6em', verticalAlign: 'middle' }}>FINALIZED</span>}
              </>
            )}
          </h1>
          <p className="page-subtitle">
            {editingId
              ? (isFinalized ? `Read-only · Finalized by ${finalizedBy || '—'}${finalizedAt ? ' on ' + new Date(finalizedAt).toLocaleDateString() : ''}` : 'Editing existing return — Save to update')
              : 'Process part returns and stock restatement.'}
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={() => setShowList(v => !v)}>
            <FileText size={14} /> {showList ? 'Hide list' : 'Previous Returns'}
          </button>
          {editingId && <button className="btn-sm" onClick={() => navTo('first')}>« First</button>}
          {editingId && <button className="btn-sm" onClick={() => navTo(-1)}><ChevronLeft size={14} /> Prev</button>}
          {editingId && <button className="btn-sm" onClick={() => navTo(+1)}>Next <ChevronRight size={14} /></button>}
          {editingId && <button className="btn-sm" onClick={() => navTo('last')}>Last »</button>}
          {canInsert && <button className="btn-sm" onClick={startNew}><Plus size={14} /> New</button>}
          <button className="btn" onClick={() => isFinalized && editingId && window.open(`/ssr/${editingId}/print`, '_blank')} style={{ background: '#0f766e', opacity: (isFinalized && editingId) ? 1 : 0.4, cursor: (isFinalized && editingId) ? 'pointer' : 'not-allowed' }} disabled={!(isFinalized && editingId)} title={(isFinalized && editingId) ? 'Open return voucher print view' : 'Open a finalized return to print'}><Printer size={16} /> Print</button>
          {!disabled && (editingId ? canEdit : canInsert) && <button className="btn" style={{ background: '#f59e0b' }} onClick={handleSave} disabled={loading}>
            <Undo2 size={18} /> {loading ? 'Saving...' : (editingId ? 'Save Changes' : 'Finalize Return')}
          </button>}
        </div>
      </div>

      {success && <div className="alert-success">{success}</div>}

      {showList && (
        <div className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <Search size={16} color="#64748b" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by Return # or customer name…" style={{ flex: 1, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
            <button className="btn-sm" onClick={fetchReturns}>Refresh</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>Return #</th>
                <th style={{ padding: 8 }}>Date</th>
                <th style={{ padding: 8 }}>Customer</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Net Refund</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}></th>
              </tr></thead>
              <tbody>
                {returns.map(r => (
                  <tr key={r.ReturnID} style={{ borderBottom: '1px solid #e2e8f0', background: editingId === r.ReturnID ? '#fffbeb' : 'white' }}>
                    <td style={{ padding: 8, fontFamily: 'monospace' }}>{r.ReturnNo}</td>
                    <td style={{ padding: 8 }}>{r.ReturnDate ? new Date(r.ReturnDate).toLocaleDateString() : ''}</td>
                    <td style={{ padding: 8 }}>{r.CustomerName || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>PKR {Number(r.NetRefund || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ background: r.IsFinalized ? '#dcfce7' : '#fef3c7', color: r.IsFinalized ? '#166534' : '#92400e', padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>
                        {r.IsFinalized ? 'Finalized' : 'Draft'}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <button className="btn-sm" onClick={() => openReturn(r.ReturnID)}>Open</button>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No returns found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0 }}>
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
              <SearchableSelect
                value={currentItem.ItemID}
                onChange={(id) => {
                  const part = parts.find(p => p.ItemId == id);
                  setCurrentItem({...currentItem, ItemID: id, SaleRate: part?.ItemSalesPrice || 0});
                }}
                placeholder="Search part by code or name…"
                options={parts.map(p => {
                  const code = p.ItemNumber ?? p.ManualNumber ?? '';
                  const alt  = (p.ItemNumber && p.ManualNumber) ? ' · ' + p.ManualNumber : '';
                  return { id: p.ItemId, label: p.ItenName, sub: code ? `#${code}${alt}` : '' };
                })}
              />
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
      </fieldset>
    </div>
  );
}
