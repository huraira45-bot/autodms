import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, ShoppingCart, Percent, DollarSign, CheckCircle2, Circle, User, Truck, CreditCard, Printer, FileText, Search } from 'lucide-react';
import CampaignBox from '../components/CampaignBox';
import { useFeedback } from '../context/FeedbackContext';
import { useCan } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';

const API_BASE = '/api';

export default function StoreSale() {
  const { notify, confirm } = useFeedback();
  const { canInsert, canEdit } = useCan('sales_store');
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
    NTNNo: '',
    MobileNo: '',
    DeliveryExpense: 0,
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

  // Prior sales list + edit state
  const [sales, setSales]       = useState([]);
  const [search, setSearch]     = useState('');
  const [showList, setShowList] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [isFinalizedEdit, setIsFinalizedEdit] = useState(false);
  const disabled = isFinalizedEdit;

  const fetchSales = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE}/sales/store-sale`, { params: search ? { search } : {} });
      setSales(r.data || []);
    } catch { /* silent */ }
  }, [search]);

  useEffect(() => { if (showList) fetchSales(); }, [showList, fetchSales]);

  const startNew = () => {
    setEditingId(null); setInvoiceNo(''); setIsFinalizedEdit(false);
    setHeader({
      SaleDate: new Date().toISOString().split('T')[0],
      PartyID: '', CustomerName: '', VehicleName: '', Variant: '',
      PaymentMode: 'Cash', PaymentBankID: '',
      NICNo: '', NTNNo: '', MobileNo: '', SODONO: '', Remarks: '',
      City: 'MULTAN', FBRInvoiceNo: '0000000000', WHID: '', DeliveryExpense: 0,
    });
    setLineItems([]); setReceivedAmount(0); setSuccess('');
  };

  const openSale = async (id) => {
    try {
      const r = await axios.get(`${API_BASE}/sales/store-sale/${id}`);
      const d = r.data;
      setEditingId(d.SaleID);
      setInvoiceNo(d.InvoiceNo || '');
      setIsFinalizedEdit(!!d.IsFinalized);
      setHeader({
        SaleDate:      d.SaleDate ? new Date(d.SaleDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        PartyID:       d.PartyID || '',
        CustomerName:  d.CustomerName || '',
        VehicleName:   d.VehicleName || '',
        Variant:       d.Variant || '',
        PaymentMode:   d.PaymentMode || 'Cash',
        PaymentBankID: d.PaymentBankID || '',
        NICNo:         d.NICNo || '',
        NTNNo:         d.NTNNo || '',
        MobileNo:      d.MobileNo || '',
        DeliveryExpense: Number(d.DeliveryExpense) || 0,
        SODONO:        d.SODONO || '',
        Remarks:       d.Remarks || '',
        City:          d.City || 'MULTAN',
        FBRInvoiceNo:  d.FBRInvoiceNo || '0000000000',
        WHID:          d.WHID || ''
      });
      setLineItems((d.Items || []).map(it => {
        const qty = Number(it.Quantity) || 0;
        const rate = Number(it.SaleRate) || 0;
        const taxAmt = Number(it.TaxAmount) || 0;
        const discAmt = Number(it.DiscountAmount) || 0;
        return {
          ItemID:   it.ItemID,
          ItenName: it.ItenName,
          Qty:      qty,
          SaleRate: rate,
          PurRate:  Number(it.PurchaseRate) || 0,
          TaxPercent: Number(it.TaxPercent) || 0,
          IsGST:    it.IsGST !== false,
          Discount: discAmt,
          DiscType: 'Amount',
          TaxAmt:   taxAmt,
          DiscAmt:  discAmt,
          NetAmt:   Number(it.NetAmount) || 0,
          WHID:     it.WHID || '',
        };
      }));
      setShowList(false);
      setSuccess('');
    } catch (err) {
      notify({ type: 'error', title: 'Open failed', message: err.response?.data?.error || err.message });
    }
  };
  // Track the SaleID + gross of the most-recently-saved sale so the user can
  // attach a campaign to it before starting a fresh sale.
  const [lastSale, setLastSale] = useState(null);  // { saleId, gross, invoiceNo }

  const fetchData = async () => {
    try {
      const [pRes, wRes, itRes, bRes] = await Promise.all([
        axios.get(`${API_BASE}/parties?business=SALES`),
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
    payable: lineItems.reduce((sum, i) => sum + i.NetAmt, 0) + (Number(header.DeliveryExpense) || 0)
  };

  const handleSave = async () => {
    if (disabled) return;
    if (lineItems.length === 0 || !header.CustomerName) {
      notify({ type: 'warning', title: 'Sale is incomplete', message: 'Enter customer name and add at least one item.' });
      return;
    }
    if (header.PaymentMode === 'Credit' && !header.PartyID) {
      notify({ type: 'warning', title: 'Party required', message: 'Credit sale requires a named party from the Party dropdown.' });
      return;
    }
    if (header.PaymentMode === 'Bank Transfer' && !header.PaymentBankID) {
      notify({ type: 'warning', title: 'Bank account required', message: 'Select a bank account for bank transfer payment.' });
      return;
    }
    const isEdit = !!editingId;
    if (!isEdit) {
      const ok = await confirm({
        title: 'Finalize this store sale?',
        message: 'This will save the invoice and post the sale transaction.',
        details: `Payment mode: ${header.PaymentMode}. Net payable: PKR ${Number(totals.payable || 0).toLocaleString('en-PK')}.`,
        confirmLabel: 'Finalize sale',
        tone: 'warning',
      });
      if (!ok) return;
    }
    setLoading(true);
    try {
      const payload = {
        ...header,
        TotalBillAmount: totals.bill,
        TotalTaxAmount: totals.tax,
        TotalDiscount: totals.discount,
        NetPayable: totals.payable,
        Items: lineItems,
      };
      if (isEdit) {
        await axios.put(`${API_BASE}/sales/store-sale/${editingId}`, payload);
        notify({ type: 'success', title: 'Sale updated', message: `${invoiceNo || `#${editingId}`} saved.` });
        setSuccess(`${invoiceNo || `Sale ${editingId}`} updated.`);
      } else {
        const res = await axios.post(`${API_BASE}/sales/store-sale`, payload);
        setSuccess(`Invoice ${res.data.InvoiceNo} Saved Successfully!`);
        notify({ type: 'success', title: 'Sale finalized', message: `Invoice ${res.data.InvoiceNo} was saved.` });
        setLastSale({ saleId: res.data.SaleID, invoiceNo: res.data.InvoiceNo,
                      voucherId: res.data.VoucherID,
                      gross: Number((totals.bill - totals.discount).toFixed(2)),
                      tax: Number(totals.tax.toFixed(2)),
                      payable: totals.payable });
        startNew();
      }
      fetchSales();
    } catch (err) {
      notify({ type: 'error', title: isEdit ? 'Update failed' : 'Sale failed', message: err.response?.data?.error || err.response?.data?.details || err.message });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card-header">
        <div>
          <h1 className="page-title">
            Store Sale (Spares)
            {editingId && (
              <>
                <span style={{ marginLeft: 10, fontSize: '0.7em', color: '#475569', fontFamily: 'monospace' }}>· {invoiceNo || `#${editingId}`}</span>
                {isFinalizedEdit && <span style={{ marginLeft: 10, background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: '0.6em', verticalAlign: 'middle' }}>FINALIZED</span>}
              </>
            )}
          </h1>
          <p className="page-subtitle">
            {editingId
              ? (isFinalizedEdit ? 'Read-only · open existing sale' : 'Editing existing sale — Save Changes to update')
              : 'Counter sales for spare parts and accessories.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={() => setShowList(v => !v)}>
            <FileText size={14} /> {showList ? 'Hide list' : 'Previous Sales'}
          </button>
          {canInsert && <button className="btn-sm" onClick={startNew}><Plus size={14} /> New</button>}
          <button className="btn" onClick={() => isFinalizedEdit && editingId && window.open(`/store-sale/${editingId}/print`, '_blank')} style={{ background: '#0f766e', opacity: (isFinalizedEdit && editingId) ? 1 : 0.4, cursor: (isFinalizedEdit && editingId) ? 'pointer' : 'not-allowed' }} disabled={!(isFinalizedEdit && editingId)} title={(isFinalizedEdit && editingId) ? 'Open sale invoice print view' : 'Open a finalized sale to print'}><Printer size={16} /> Print</button>
          {!disabled && (editingId ? canEdit : canInsert) && <button className="btn" onClick={handleSave} disabled={loading}><ShoppingCart size={18} /> {loading ? 'Processing...' : (editingId ? 'Save Changes' : 'Finalize Sale')}</button>}
        </div>
      </div>

      {success && <div className="alert-success">{success}</div>}

      {showList && (
        <div className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <Search size={16} color="#64748b" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by invoice #, customer or mobile…" style={{ flex: 1, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
            <button className="btn-sm" onClick={fetchSales}>Refresh</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>Invoice #</th>
                <th style={{ padding: 8 }}>Date</th>
                <th style={{ padding: 8 }}>Customer</th>
                <th style={{ padding: 8 }}>Payment</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Net Payable</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}></th>
              </tr></thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.SaleID} style={{ borderBottom: '1px solid #e2e8f0', background: editingId === s.SaleID ? '#fffbeb' : 'white' }}>
                    <td style={{ padding: 8, fontFamily: 'monospace' }}>{s.InvoiceNo}</td>
                    <td style={{ padding: 8 }}>{s.SaleDate ? new Date(s.SaleDate).toLocaleDateString() : ''}</td>
                    <td style={{ padding: 8 }}>{s.CustomerName || '—'}</td>
                    <td style={{ padding: 8 }}>{s.PaymentMode || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>PKR {Number(s.NetPayable || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ background: s.IsFinalized ? '#dcfce7' : '#fef3c7', color: s.IsFinalized ? '#166534' : '#92400e', padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>
                        {s.IsFinalized ? 'Finalized' : 'Draft'}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <button className="btn-sm" onClick={() => openSale(s.SaleID)}>Open</button>
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No sales found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaign attach panel — visible after a sale has been saved. Disappears
          once the user starts building a new sale (lineItems > 0). */}
      {lastSale && lineItems.length === 0 && (
          <div className="card" style={{ padding: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1 }}>
                      Last saved: <strong>Invoice {lastSale.invoiceNo}</strong> · PKR {Number(lastSale.payable).toLocaleString('en-PK')}.
                      You can apply a campaign to this sale before finalizing it.
                  </span>
                  {lastSale.voucherId && (
                      <a href={`/vouchers/jv?id=${lastSale.voucherId}&print=1`} target="_blank" rel="noreferrer"
                         style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                                  background: '#0f766e', color: 'white', borderRadius: 4, fontWeight: 600,
                                  fontSize: '0.78rem', textDecoration: 'none' }}>
                          <Printer size={12} /> Print Invoice
                      </a>
                  )}
                  <button onClick={() => setLastSale(null)}
                          style={{ background: 'transparent', border: 'none',
                                   color: '#94a3b8', cursor: 'pointer', fontSize: '0.78rem' }}>
                      Dismiss
                  </button>
              </div>
              <CampaignBox type="sale" id={lastSale.saleId}
                           grossAmount={lastSale.gross}
                           partsGross={lastSale.gross}
                           taxAmount={lastSale.tax} />
          </div>
      )}

      <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0 }}>
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
            <div className="form-group"><label>NTN No</label><input type="text" value={header.NTNNo} onChange={e => setHeader({...header, NTNNo: e.target.value})} placeholder="Tax #" /></div>
          </div>
          <div className="grid-2">
            <div className="form-group"><label>Mobile #</label><input type="text" value={header.MobileNo} onChange={e => setHeader({...header, MobileNo: e.target.value})} /></div>
            <div className="form-group"><label>Delivery Expense</label><input type="number" min="0" step="0.01" value={header.DeliveryExpense} onChange={e => setHeader({...header, DeliveryExpense: e.target.value})} /></div>
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
              <SearchableSelect
                value={currentItem.ItemID}
                onChange={(id) => {
                  const part = parts.find(p => p.ItemId == id);
                  setCurrentItem({...currentItem, ItemID: id, SaleRate: part?.ItemSalesPrice || 0, PurRate: part?.ItemPurchasePrice || 0});
                }}
                placeholder="Search part by code or name…"
                options={parts.map(p => ({ id: p.ItemId, label: p.ItenName, sub: `#${p.ItemNumber}${p.ManualNumber ? ' · ' + p.ManualNumber : ''}` }))}
              />
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
      </fieldset>
    </div>
  );
}
