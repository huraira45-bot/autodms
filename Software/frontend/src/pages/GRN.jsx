import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Lock, Unlock, UserCircle, Search, Printer } from 'lucide-react';
import { useAuth, useCan } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import SearchableSelect from '../components/SearchableSelect';

const API_BASE = '/api';

// ── Per-line calculator. Single source of truth for the column math. ──
//   * ValueExclTax     = Qty × UnitRetail
//   * DiscountValue    = ValueExclTax × Discount %
//   * AddDiscountValue = (ValueExclTax − DiscountValue) × AddDiscount %
//   * SalesValueExcl   = ValueExclTax − DiscountValue − AddDiscountValue
//   * SalesTax         = ValueExclTax × TaxRate%   (on GROSS — owner decision)
//   * AIT              = user-entered per line
//   * ValueIncTax      = SalesValueExcl + SalesTax + AIT
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
function computeLine(raw) {
    const qty       = Number(raw.Qty || 0);
    const rate      = Number(raw.ItemRate || 0);
    const discPct   = Number(raw.DiscountPct || 0);
    const addDPct   = Number(raw.AdditionalDiscountPct || 0);
    const taxPct    = Number(raw.TaxRate || 0);
    const ait       = Number(raw.AITAmount || 0);

    const valueExcl       = r2(qty * rate);
    const discountValue   = r2(valueExcl * discPct / 100);
    const addDiscountVal  = r2((valueExcl - discountValue) * addDPct / 100);
    const salesValueExcl  = r2(valueExcl - discountValue - addDiscountVal);
    const salesTax        = r2(valueExcl * taxPct / 100);
    const valueIncTax     = r2(salesValueExcl + salesTax + ait);

    return {
        ...raw,
        DiscountAmount: discountValue,
        AdditionalDiscountAmount: addDiscountVal,
        SalesValueExclTax: salesValueExcl,
        TaxAmount: salesTax,
        AITAmount: ait,
        ValueExclTax: valueExcl,
        ValueIncTax: valueIncTax,
        NetAmount: valueIncTax,     // legacy column kept in sync
        StockRate: rate,
    };
}

const emptyEntry = {
    ItemID: '', ItenName: '', Qty: 1, ItemRate: 0,
    DiscountPct: 0, AdditionalDiscountPct: 0,
    TaxRate: 18, AITAmount: 0,
};

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GRN() {
    const { hasModule, user } = useAuth();
    const { canInsert, canEdit } = useCan('procurement_grn');
    const { notify, confirm } = useFeedback();

    const [parties, setParties]       = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [parts, setParts]           = useState([]);
    const [grns, setGrns]             = useState([]);

    const [header, setHeader] = useState({
        PurchaseDate: new Date().toISOString().split('T')[0],
        SupplierBillNo: '', PartyID: '', WHID: '', NTN: '', Remarks: '',
    });

    const [billImage, setBillImage] = useState(null);
    const [lineItems, setLineItems] = useState([]);
    const [currentItem, setCurrentItem] = useState(emptyEntry);

    const [loading, setLoading]   = useState(false);
    const [success, setSuccess]   = useState('');
    const [errMsg, setErrMsg]     = useState('');

    // Edit / list state
    const [editingId, setEditingId]     = useState(null);
    const [grnNo, setGrnNo]             = useState('');
    const [isFinalizedEdit, setIsFinalizedEdit] = useState(false);
    const disabled = isFinalizedEdit;
    const [unfinalizeModal, setUnfinalizeModal] = useState(null);
    const [unfinalizeReason, setUnfinalizeReason] = useState('');
    const [grnSearch, setGrnSearch] = useState('');
    const [debouncedGrnSearch, setDebouncedGrnSearch] = useState('');

    // ── Loaders ─────────────────────────────────────────────────────
    const fetchFormData = async () => {
        const empty = { data: [] };
        const [pRes, wRes, itRes] = await Promise.all([
            axios.get(`${API_BASE}/parties?business=PROCUREMENT`).catch(() => empty),
            axios.get(`${API_BASE}/inventory-config/warehouses`).catch(() => empty),
            axios.get(`${API_BASE}/items`).catch(() => empty),
        ]);
        setParties(pRes.data || []);
        setWarehouses(wRes.data || []);
        setParts((itRes.data || []).filter(i => i.ItemType?.trim().toLowerCase() === 'part'));
    };

    const fetchGRNs = async (s = '') => {
        try {
            const url = s ? `${API_BASE}/procurement/grn?search=${encodeURIComponent(s)}` : `${API_BASE}/procurement/grn`;
            const res = await axios.get(url);
            setGrns(res.data || []);
        } catch (err) { /* silent */ }
    };

    useEffect(() => { fetchFormData(); }, []);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedGrnSearch(grnSearch), 300);
        return () => clearTimeout(t);
    }, [grnSearch]);
    useEffect(() => { fetchGRNs(debouncedGrnSearch); }, [debouncedGrnSearch]);

    // When supplier changes, pull NTN from party master into the header.
    // Party API returns the column as NTNNO; fall back to other shapes too.
    useEffect(() => {
        if (!header.PartyID) return;
        const p = parties.find(x => String(x.PartyID) === String(header.PartyID));
        const ntn = p?.NTNNO || p?.NTN || p?.PartyNTN;
        if (ntn) setHeader(h => ({ ...h, NTN: ntn }));
    }, [header.PartyID, parties]);

    // ── Reset / open ────────────────────────────────────────────────
    const startNew = () => {
        setEditingId(null); setGrnNo(''); setIsFinalizedEdit(false);
        setHeader({
            PurchaseDate: new Date().toISOString().split('T')[0],
            SupplierBillNo: '', PartyID: '', WHID: '', NTN: '', Remarks: '',
        });
        setLineItems([]); setBillImage(null); setSuccess('');
        setCurrentItem(emptyEntry);
    };

    const openGRN = async (id) => {
        try {
            const r = await axios.get(`${API_BASE}/procurement/grn/${id}`);
            const d = r.data;
            setEditingId(d.PurchaseID);
            setGrnNo(d.PurchaseCode || d.PurchaseVoucherNo || '');
            setIsFinalizedEdit(!!d.IsFinalized);
            setHeader({
                PurchaseDate:    d.PurchaseDate ? new Date(d.PurchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                SupplierBillNo: d.FBRInvoiceNumber || d.SupplierBillNo || '',
                PartyID:        d.PartyID || '',
                WHID:           d.WHID || '',
                NTN:            d.PartyNTN || d.NTN || '',
                Remarks:        d.Remarks || '',
            });
            setLineItems((d.Items || []).map(it => computeLine({
                ItemID:                it.ItemId,
                ItenName:              it.ItenName,
                Qty:                   Number(it.Quantity) || 0,
                ItemRate:              Number(it.ItemRate) || 0,
                DiscountPct:           Number(it.DiscountPercentage) || 0,
                AdditionalDiscountPct: Number(it.AdditionalDiscountPct) || 0,
                TaxRate:               Number(it.TaxRate) || 0,
                AITAmount:             Number(it.AITAmount) || 0,
            })));
            setSuccess('');
        } catch (err) {
            notify({ type: 'error', title: 'Open failed', message: err.response?.data?.error || err.message });
        }
    };

    // ── Add / remove line ──────────────────────────────────────────
    const addLineItem = () => {
        if (!currentItem.ItemID || Number(currentItem.Qty) <= 0) {
            notify({ type: 'warning', title: 'Add a part', message: 'Pick a part and a quantity greater than zero.' });
            return;
        }
        const part = parts.find(p => p.ItemId == currentItem.ItemID);
        const line = computeLine({ ...currentItem, ItenName: part?.ItenName, ItemNumber: part?.ItemNumber });
        setLineItems([...lineItems, line]);
        setCurrentItem(emptyEntry);
    };

    const removeLineItem = (idx) => setLineItems(lineItems.filter((_, i) => i !== idx));

    // ── Totals row ─────────────────────────────────────────────────
    const totals = lineItems.reduce((acc, l) => ({
        qty:               acc.qty + Number(l.Qty || 0),
        valueExcl:         acc.valueExcl + Number(l.ValueExclTax || 0),
        discount:          acc.discount + Number(l.DiscountAmount || 0),
        addDiscount:       acc.addDiscount + Number(l.AdditionalDiscountAmount || 0),
        salesValueExcl:    acc.salesValueExcl + Number(l.SalesValueExclTax || 0),
        salesTax:          acc.salesTax + Number(l.TaxAmount || 0),
        ait:               acc.ait + Number(l.AITAmount || 0),
        valueIncTax:       acc.valueIncTax + Number(l.ValueIncTax || 0),
    }), { qty: 0, valueExcl: 0, discount: 0, addDiscount: 0, salesValueExcl: 0, salesTax: 0, ait: 0, valueIncTax: 0 });

    // ── Save ───────────────────────────────────────────────────────
    const handleSave = async () => {
        if (disabled) return;
        if (lineItems.length === 0 || !header.PartyID || !header.WHID) {
            notify({
                type: 'warning',
                title: 'GRN is incomplete',
                message: 'Select supplier, store, and add at least one item before saving.',
            });
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('PurchaseDate', header.PurchaseDate);
        formData.append('SupplierBillNo', header.SupplierBillNo);
        formData.append('PartyID', header.PartyID);
        formData.append('WHID', header.WHID);
        formData.append('NTN', header.NTN || '');
        formData.append('Remarks', header.Remarks || '');
        formData.append('Items', JSON.stringify(lineItems.map(l => ({
            ItemId:                   l.ItemID,
            Quantity:                 l.Qty,
            ItemRate:                 l.ItemRate,
            DiscountPercentage:       l.DiscountPct,
            DiscountAmount:           l.DiscountAmount,
            AdditionalDiscountPct:    l.AdditionalDiscountPct,
            AdditionalDiscountAmount: l.AdditionalDiscountAmount,
            TaxRate:                  l.TaxRate,
            TaxAmount:                l.TaxAmount,
            AITAmount:                l.AITAmount,
            NetAmount:                l.ValueIncTax,
            StockRate:                l.ItemRate,
        }))));
        if (billImage) formData.append('BillImage', billImage);

        const isEdit = !!editingId;
        try {
            if (isEdit) {
                await axios.put(`${API_BASE}/procurement/grn/${editingId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                notify({ type: 'success', title: 'GRN updated', message: `${grnNo || `#${editingId}`} saved.` });
                setSuccess(`${grnNo || `GRN ${editingId}`} updated.`);
            } else {
                await axios.post(`${API_BASE}/procurement/grn`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                notify({ type: 'success', title: 'GRN saved', message: 'Receiving document was saved successfully.' });
                setSuccess('GRN Saved Successfully!');
                setLineItems([]); setBillImage(null);
                setHeader(h => ({ ...h, SupplierBillNo: '', Remarks: '' }));
            }
            fetchGRNs(debouncedGrnSearch);
        } catch (err) {
            notify({ type: 'error', title: 'GRN save failed', message: err.response?.data?.details || err.response?.data?.error || err.message });
        } finally {
            setLoading(false);
        }
    };

    // ── Finalize / unfinalize ──────────────────────────────────────
    const handleFinalize = async (id) => {
        const ok = await confirm({
            title: 'Finalize this GRN?',
            message: 'This will lock the receiving document and post the related inventory + accounting entries.',
            details: 'After finalization, changes require the unfinalize approval workflow.',
            confirmLabel: 'Finalize GRN',
            tone: 'warning',
        });
        if (!ok) return;
        try {
            await axios.post(`/api/finalize/GRN/${id}`);
            notify({ type: 'success', title: 'GRN finalized', message: 'Receiving document was posted and locked.' });
            fetchGRNs(debouncedGrnSearch);
        } catch (e) {
            const text = e.response?.data?.error || 'Error';
            setErrMsg(text);
            notify({ type: 'error', title: 'Finalize failed', message: text });
            setTimeout(() => setErrMsg(''), 3000);
        }
    };

    const handleRequestUnfinalize = async () => {
        if (!unfinalizeReason.trim()) {
            notify({ type: 'warning', title: 'Reason required', message: 'Explain why this GRN needs to be unfinalized.' });
            return;
        }
        try {
            await axios.post(`/api/finalize/GRN/${unfinalizeModal}/request-unfinalize`, { reason: unfinalizeReason });
            setUnfinalizeModal(null); setUnfinalizeReason('');
            notify({ type: 'success', title: 'Request submitted', message: 'GRN unfinalize request was sent for approval.' });
        } catch (e) {
            notify({ type: 'error', title: 'Request failed', message: e.response?.data?.error || 'Error' });
        }
    };

    const canFinalizeRow = (row) => hasModule('finalize') && (user?.userId === row.CreatedBy || hasModule('admin_unfinalize'));

    // ── Render ─────────────────────────────────────────────────────
    const th = { padding: '6px 5px', fontSize: 10, fontWeight: 700, color: '#475569', background: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' };
    const thL = { ...th, textAlign: 'left' };
    const td = { padding: '5px 5px', fontSize: 11, textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontVariantNumeric: 'tabular-nums' };
    const tdL = { ...td, textAlign: 'left' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">
                        Goods Receiving Note (Sales Tax Invoice)
                        {editingId && (
                            <>
                                <span style={{ marginLeft: 10, fontSize: '0.7em', color: '#475569', fontFamily: 'monospace' }}>· {grnNo || `#${editingId}`}</span>
                                {isFinalizedEdit && <span style={{ marginLeft: 10, background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: '0.6em', verticalAlign: 'middle' }}>FINALIZED</span>}
                            </>
                        )}
                    </h1>
                    <p className="page-subtitle">{editingId ? (isFinalizedEdit ? 'Read-only · finalized GRN' : 'Editing existing GRN') : 'New supplier invoice — enter line-by-line.'}</p>
                </div>
                <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {editingId && canInsert && <button className="btn-sm" onClick={startNew}><Plus size={14} /> New</button>}
                    <button className="btn" onClick={() => isFinalizedEdit && editingId && window.open(`/grn/${editingId}/print`, '_blank')}
                        style={{ background: '#0f766e', opacity: (isFinalizedEdit && editingId) ? 1 : 0.4, cursor: (isFinalizedEdit && editingId) ? 'pointer' : 'not-allowed' }}
                        disabled={!(isFinalizedEdit && editingId)}><Printer size={16} /> Print</button>
                    {!disabled && (editingId ? canEdit : canInsert) && (
                        <button className="btn" onClick={handleSave} disabled={loading}>
                            <Save size={18} /> {loading ? 'Saving…' : (editingId ? 'Save Changes' : 'Save GRN')}
                        </button>
                    )}
                </div>
            </div>

            {success && <div className="alert-success">{success}</div>}
            {errMsg && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>{errMsg}</div>}

            <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0 }}>
                {/* Header */}
                <div className="card">
                    <h2 className="card-title" style={{ marginBottom: 14 }}>Document Header</h2>
                    <div className="grid-4">
                        <div className="form-group">
                            <label>Supplier *</label>
                            <SearchableSelect
                                value={header.PartyID}
                                onChange={id => setHeader({ ...header, PartyID: id })}
                                placeholder="Search supplier…"
                                options={parties.map(p => ({ id: p.PartyID, label: p.PartyName, sub: p.NTNNO || p.NTN || '' }))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Store / Warehouse *</label>
                            <select value={header.WHID} onChange={e => setHeader({ ...header, WHID: e.target.value })}>
                                <option value="">Select store…</option>
                                {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Invoice Date</label>
                            <input type="date" value={header.PurchaseDate} onChange={e => setHeader({ ...header, PurchaseDate: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Invoice No</label>
                            <input value={header.SupplierBillNo} onChange={e => setHeader({ ...header, SupplierBillNo: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>NTN (supplier)</label>
                            <input value={header.NTN} onChange={e => setHeader({ ...header, NTN: e.target.value })} placeholder="from party master if set" />
                        </div>
                        <div className="form-group" style={{ gridColumn: 'span 3' }}>
                            <label>Remarks</label>
                            <input value={header.Remarks} onChange={e => setHeader({ ...header, Remarks: e.target.value })} placeholder="optional" />
                        </div>
                    </div>
                </div>

                {/* Line entry */}
                <div className="card" style={{ marginTop: 12 }}>
                    <h2 className="card-title" style={{ marginBottom: 14 }}>Add Line</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,2.6fr) 70px 110px 90px 90px 80px 100px 90px', gap: 8, alignItems: 'end' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Part / Description</label>
                            <SearchableSelect
                                value={currentItem.ItemID}
                                onChange={id => {
                                    const part = parts.find(p => p.ItemId == id);
                                    setCurrentItem({
                                        ...currentItem,
                                        ItemID: id,
                                        ItemRate: part?.ItemPurchasePrice || 0,
                                    });
                                }}
                                placeholder="Search part by code or name…"
                                options={parts.map(p => ({ id: p.ItemId, label: p.ItenName, sub: `#${p.ItemNumber}${p.ManualNumber ? ' · ' + p.ManualNumber : ''}` }))}
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Qty</label>
                            <input type="number" value={currentItem.Qty} onChange={e => setCurrentItem({ ...currentItem, Qty: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Unit Retail</label>
                            <input type="number" step="0.01" value={currentItem.ItemRate} onChange={e => setCurrentItem({ ...currentItem, ItemRate: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Disc %</label>
                            <input type="number" step="0.01" value={currentItem.DiscountPct} onChange={e => setCurrentItem({ ...currentItem, DiscountPct: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>Add Disc %</label>
                            <input type="number" step="0.01" value={currentItem.AdditionalDiscountPct} onChange={e => setCurrentItem({ ...currentItem, AdditionalDiscountPct: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>GST %</label>
                            <input type="number" step="0.01" value={currentItem.TaxRate} onChange={e => setCurrentItem({ ...currentItem, TaxRate: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>AIT (Rs)</label>
                            <input type="number" step="0.01" value={currentItem.AITAmount} onChange={e => setCurrentItem({ ...currentItem, AITAmount: e.target.value })} />
                        </div>
                        <button className="btn" type="button" onClick={addLineItem} style={{ height: 38 }}><Plus size={16} /> Add</button>
                    </div>
                </div>

                {/* Line table — matches the Master Motors invoice column layout */}
                <div className="card data-card" style={{ marginTop: 12, padding: 0 }}>
                    <div className="table-wrapper">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={th}>S#</th>
                                    <th style={thL}>Part #</th>
                                    <th style={thL}>Description</th>
                                    <th style={th}>Qty</th>
                                    <th style={th}>Unit Retail<br/>Excl Tax</th>
                                    <th style={th}>Value<br/>Excl Tax</th>
                                    <th style={th}>Disc %</th>
                                    <th style={th}>Disc Value</th>
                                    <th style={th}>Add Disc %</th>
                                    <th style={th}>Add Disc Value</th>
                                    <th style={th}>Sales Value<br/>Excl Tax</th>
                                    <th style={th}>Sales Tax</th>
                                    <th style={th}>AIT</th>
                                    <th style={th}>Sales Tax<br/>+ AIT</th>
                                    <th style={th}>Value Inc<br/>Sales Tax</th>
                                    <th style={{ ...th, width: 30 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lineItems.length === 0 && (
                                    <tr><td colSpan={16} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No lines yet — add one above.</td></tr>
                                )}
                                {lineItems.map((l, idx) => (
                                    <tr key={idx}>
                                        <td style={td}>{idx + 1}</td>
                                        <td style={{ ...tdL, fontFamily: 'monospace', color: '#64748b' }}>{l.ItemNumber || '—'}</td>
                                        <td style={tdL}>{l.ItenName}</td>
                                        <td style={td}>{l.Qty}</td>
                                        <td style={td}>{fmt(l.ItemRate)}</td>
                                        <td style={td}>{fmt(l.ValueExclTax)}</td>
                                        <td style={td}>{Number(l.DiscountPct || 0)}</td>
                                        <td style={td}>{fmt(l.DiscountAmount)}</td>
                                        <td style={td}>{Number(l.AdditionalDiscountPct || 0)}</td>
                                        <td style={td}>{fmt(l.AdditionalDiscountAmount)}</td>
                                        <td style={{ ...td, fontWeight: 600 }}>{fmt(l.SalesValueExclTax)}</td>
                                        <td style={td}>{fmt(l.TaxAmount)}</td>
                                        <td style={td}>{fmt(l.AITAmount)}</td>
                                        <td style={td}>{fmt(Number(l.TaxAmount) + Number(l.AITAmount))}</td>
                                        <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{fmt(l.ValueIncTax)}</td>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            {!disabled && (
                                                <button onClick={() => removeLineItem(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {lineItems.length > 0 && (
                                <tfoot>
                                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                        <td colSpan={3} style={{ ...tdL, fontWeight: 700 }}>Total ({lineItems.length} {lineItems.length === 1 ? 'line' : 'lines'})</td>
                                        <td style={td}>{totals.qty}</td>
                                        <td style={td}>—</td>
                                        <td style={td}>{fmt(totals.valueExcl)}</td>
                                        <td style={td}>—</td>
                                        <td style={td}>{fmt(totals.discount)}</td>
                                        <td style={td}>—</td>
                                        <td style={td}>{fmt(totals.addDiscount)}</td>
                                        <td style={td}>{fmt(totals.salesValueExcl)}</td>
                                        <td style={td}>{fmt(totals.salesTax)}</td>
                                        <td style={td}>{fmt(totals.ait)}</td>
                                        <td style={td}>{fmt(totals.salesTax + totals.ait)}</td>
                                        <td style={{ ...td, fontWeight: 800, color: '#0f172a' }}>{fmt(totals.valueIncTax)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </fieldset>

            {/* Recent GRNs */}
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h2 className="card-title" style={{ margin: 0 }}>Recent GRNs</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 8, height: 36, width: 300 }}>
                        <Search size={15} style={{ color: '#94a3b8' }} />
                        <input style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.85rem', background: 'transparent' }}
                            placeholder="Search GRN#, Bill#, Supplier…"
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
                                                : <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#166534' }}>Active</span>}
                                        </td>
                                        <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <button onClick={() => openGRN(g.PurchaseID)}
                                                style={{ padding: '4px 10px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Open</button>
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
                                ))}
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
                            style={{ width: '100%', resize: 'vertical', marginBottom: 16 }} placeholder="Explain why this GRN needs to be unfinalized…" />
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
