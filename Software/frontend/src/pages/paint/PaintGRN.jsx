/**
 * Paint GRN — compact desktop-ERP layout (owner ask 2026-07-05).
 *
 * BUSINESS LOGIC UNCHANGED:
 *  - Server-side moving-avg + finalize + unfinalize + posting.
 *  - Draft ↔ Posted ↔ Reversed state machine.
 *  - GST rolls into paint cost (single voucher Dr Paint Inv / Cr Supplier).
 *
 * Layout — sticky action bar, 2-row compact header grid, inline line-add
 * strip, scrollable line table with sticky headers, right-aligned totals.
 * No page-level horizontal scroll on 1366×768.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Plus, Save, Check, Trash2, Printer, X, Search,
    AlertTriangle, RefreshCcw, Lock, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import SearchableSelect from '../../components/SearchableSelect';

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const blankLine = (defaultUomId, defaultGstRate) => ({
    PaintItemID: '', PaintUOMID: defaultUomId || '',
    Quantity: 1, UnitRate: 0,
    DiscountPct: 0, DiscountAmt: 0,
    GSTOn: true, GSTRate: defaultGstRate || 0,
});

export default function PaintGRN() {
    const { hasModule } = useAuth();
    const { notify, confirm } = useFeedback();
    const canUnfinalize = hasModule('admin_unfinalize');
    const canEdit = hasModule('paint_lab_grn');

    const [list, setList]     = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [items, setItems]           = useState([]);
    const [uoms, setUoms]             = useState([]);
    const [itemUoms, setItemUoms]     = useState([]);   // per-item alt-UoM rows
    const [parties, setParties]       = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [gstRate, setGstRate]       = useState(0);

    const [id, setId]         = useState(null);
    const [form, setForm]     = useState(null);
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);

    const reloadList = async () => {
        const params = {};
        if (search) params.search = search;
        if (statusFilter) params.status = statusFilter;
        const r = await axios.get('/api/paint/grn', { params });
        setList(r.data || []);
    };

    useEffect(() => {
        (async () => {
            try {
                const [i, u, p, w, tr, iu] = await Promise.all([
                    axios.get('/api/paint/items'),
                    axios.get('/api/paint/uom'),
                    axios.get('/api/parties', { params: { business: 'PAINT_LAB' } }),
                    axios.get('/api/paint/warehouses'),
                    axios.get('/api/tax-rates').catch(() => ({ data: { current: [] } })),
                    axios.get('/api/paint/item-uoms').catch(() => ({ data: [] })),
                ]);
                setItems(i.data || []);
                setUoms(u.data || []);
                setParties(p.data || []);
                setWarehouses(w.data || []);
                setItemUoms(iu.data || []);
                const gst = (tr.data?.current || []).find(t => (t.TaxType || '').toUpperCase() === 'GST');
                setGstRate(gst ? Number(gst.Rate) : 0);
            } catch (err) {
                notify({ type: 'error', title: 'Setup load failed', message: err.response?.data?.error || err.message });
            }
            reloadList();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { reloadList().catch(() => {}); /* eslint-disable-next-line */ }, [search, statusFilter]);

    const openNew = () => {
        setId(null);
        setForm({
            GRNDate: today(),
            PartyID: '', SupplierBillNo: '',
            PaintWHID: warehouses[0]?.PaintWHID || '',
            Remarks: '', Status: 'Draft',
            Lines: [blankLine(null, gstRate)],
        });
        setDirty(false);
    };

    const openId = async (rowId) => {
        try {
            const r = await axios.get(`/api/paint/grn/${rowId}`);
            const data = r.data;
            setId(data.PaintGRNID);
            setForm({
                GRNNo: data.GRNNo,
                GRNDate: (data.GRNDate || '').slice(0, 10),
                PartyID: data.PartyID,
                SupplierBillNo: data.SupplierBillNo || '',
                PaintWHID: data.PaintWHID,
                Remarks: data.Remarks || '',
                Status: data.Status,
                VoucherNo: data.VoucherNo,
                Lines: (data.Lines || []).map(l => ({
                    PaintItemID: l.PaintItemID,
                    PaintUOMID:  l.PaintUOMID || '',
                    Quantity:    Number(l.Quantity),
                    UnitRate:    Number(l.UnitRate),
                    DiscountPct: Number(l.DiscountPct),
                    DiscountAmt: Number(l.DiscountAmt),
                    GSTOn:       !!l.GSTOn,
                    GSTRate:     Number(l.GSTRate),
                })),
            });
            setDirty(false);
        } catch (err) {
            notify({ type: 'error', title: 'Could not open', message: err.response?.data?.error || err.message });
        }
    };

    const closeForm = async () => {
        if (dirty && !(await confirm({ title: 'Discard changes?', message: 'You have unsaved changes.', confirmLabel: 'Discard', tone: 'warning' }))) return;
        setId(null); setForm(null); setDirty(false);
    };

    const patch = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
    const patchLine = (idx, patchObj) => {
        setForm(f => ({ ...f, Lines: f.Lines.map((l, i) => i === idx ? { ...l, ...patchObj } : l) }));
        setDirty(true);
    };
    const addLine    = () => { setForm(f => ({ ...f, Lines: [...f.Lines, blankLine(null, gstRate)] })); setDirty(true); };
    const removeLine = (idx) => { setForm(f => ({ ...f, Lines: f.Lines.filter((_, i) => i !== idx) })); setDirty(true); };

    const linesWithCalc = useMemo(() => (form?.Lines || []).map((l) => {
        const qty = Number(l.Quantity) || 0;
        const rate = Number(l.UnitRate) || 0;
        const gross = round2(qty * rate);
        const discAmt = l.DiscountAmt != null && l.DiscountAmt !== ''
            ? round2(Number(l.DiscountAmt))
            : round2(gross * (Number(l.DiscountPct) || 0) / 100);
        const gstOn = !!l.GSTOn;
        const gstBase = Math.max(0, gross - discAmt);
        const gstAmt = gstOn ? round2(gstBase * (Number(l.GSTRate) || 0) / 100) : 0;
        const total = round2(gstBase + gstAmt);
        return { ...l, _gross: gross, _discAmt: discAmt, _gstAmt: gstAmt, _total: total };
    }), [form]);

    const totals = useMemo(() => linesWithCalc.reduce((a, x) => ({
        SubTotal: a.SubTotal + x._gross,
        DiscountTotal: a.DiscountTotal + x._discAmt,
        GSTTotal: a.GSTTotal + x._gstAmt,
        GrandTotal: a.GrandTotal + x._total,
    }), { SubTotal: 0, DiscountTotal: 0, GSTTotal: 0, GrandTotal: 0 }), [linesWithCalc]);

    const isReadOnly = form && form.Status !== 'Draft';

    const buildPayload = () => ({
        GRNDate: form.GRNDate,
        PartyID: form.PartyID,
        SupplierBillNo: form.SupplierBillNo || null,
        PaintWHID: form.PaintWHID,
        Remarks: form.Remarks || null,
        Lines: form.Lines.map(l => ({
            PaintItemID: l.PaintItemID,
            PaintUOMID: l.PaintUOMID || null,
            Quantity: Number(l.Quantity) || 0,
            UnitRate: Number(l.UnitRate) || 0,
            DiscountPct: Number(l.DiscountPct) || 0,
            DiscountAmt: l.DiscountAmt === '' ? null : Number(l.DiscountAmt) || 0,
            GSTOn: !!l.GSTOn,
            GSTRate: Number(l.GSTRate) || 0,
        })),
    });

    const saveDraft = async () => {
        try {
            setSaving(true);
            if (id) {
                await axios.put(`/api/paint/grn/${id}`, buildPayload());
                notify({ type: 'success', title: 'Draft saved' });
            } else {
                const r = await axios.post('/api/paint/grn', buildPayload());
                setId(r.data.PaintGRNID);
                notify({ type: 'success', title: 'Draft created' });
                await openId(r.data.PaintGRNID);
            }
            setDirty(false);
            await reloadList();
        } catch (err) {
            notify({ type: 'error', title: 'Could not save', message: err.response?.data?.error || err.message });
        } finally { setSaving(false); }
    };

    const finalize = async () => {
        if (dirty) {
            if (!(await confirm({ title: 'Save + Finalize?', message: 'Save then finalize?', confirmLabel: 'Save + Finalize' }))) return;
            await saveDraft();
        } else if (!(await confirm({
            title: 'Finalize Paint GRN?',
            message: 'Adds stock (moving-avg updated), posts GL voucher, locks the record.',
            confirmLabel: 'Finalize',
        }))) return;
        try {
            setSaving(true);
            const r = await axios.post(`/api/paint/grn/${id}/finalize`);
            notify({ type: 'success', title: 'Finalized', message: r.data.VoucherNo ? `Voucher ${r.data.VoucherNo}` : '' });
            await openId(id);
            await reloadList();
        } catch (err) {
            notify({ type: 'error', title: 'Finalize failed', message: err.response?.data?.error || err.message });
        } finally { setSaving(false); }
    };

    const unfinalize = async () => {
        if (!(await confirm({
            title: 'Unfinalize Paint GRN?',
            message: 'Reverses the voucher and rolls back moving-avg using each line\'s original landed cost.',
            confirmLabel: 'Unfinalize', tone: 'warning',
        }))) return;
        try {
            setSaving(true);
            await axios.post(`/api/paint/grn/${id}/unfinalize`);
            notify({ type: 'success', title: 'Unfinalized' });
            await openId(id);
            await reloadList();
        } catch (err) {
            notify({ type: 'error', title: 'Unfinalize failed', message: err.response?.data?.error || err.message });
        } finally { setSaving(false); }
    };

    const remove = async () => {
        if (!(await confirm({ title: 'Delete draft?', message: 'This draft will be permanently deleted.', confirmLabel: 'Delete', tone: 'danger' }))) return;
        try {
            await axios.delete(`/api/paint/grn/${id}`);
            notify({ type: 'success', title: 'Draft deleted' });
            setId(null); setForm(null); setDirty(false);
            await reloadList();
        } catch (err) {
            notify({ type: 'error', title: 'Delete failed', message: err.response?.data?.error || err.message });
        }
    };

    const printGRN = () => id && window.open(`/paint/grn/${id}/print`, '_blank', 'noopener');

    const itemOpts = useMemo(() => items.map(i => ({
        id: i.PaintItemID, label: i.PaintName, sub: i.PaintCode,
        group: i.CategoryName || 'Uncategorised',
    })), [items]);
    const partyOpts = useMemo(() => parties.map(p => ({
        id: p.PartyID, label: p.PartyName, sub: p.PhoneOne || p.NTNNO,
    })), [parties]);
    const whOpts = useMemo(() => warehouses.map(w => ({
        id: w.PaintWHID, label: w.WHDesc, sub: w.WHCode,
    })), [warehouses]);
    const uomOpts = useMemo(() => uoms.map(u => ({ id: u.PaintUOMID, label: u.UOMName })), [uoms]);
    // Per-item allowed UoMs — falls back to the full list for legacy items
    // that don't yet have paint_ItemUOM rows (migration 069 grandfathers
    // existing items, but new fresh installs may not).
    const uomOptsForItem = React.useCallback((paintItemID) => {
        if (!paintItemID) return uomOpts;
        const allowed = itemUoms.filter(iu => Number(iu.PaintItemID) === Number(paintItemID));
        if (!allowed.length) return uomOpts;
        return allowed.map(iu => ({
            id: iu.PaintUOMID,
            label: iu.IsBase ? `${iu.UOMName} (base)` : iu.UOMName,
        }));
    }, [itemUoms, uomOpts]);

    return (
        <div className="paint-page">
            {/* Sticky action bar — always reachable */}
            <div className="paint-actionbar">
                {form && (
                    <button className="paint-icon-btn" onClick={closeForm} title="Back to list"><ChevronLeft size={13} /></button>
                )}
                <div className="title">
                    {form
                        ? <>Paint GRN {form.GRNNo || (id ? `#${id}` : '· New')}
                            <StatusPill status={form.Status} />
                            {form.VoucherNo && <span className="subtitle">· Voucher {form.VoucherNo}</span>}
                            {isReadOnly && <span className="subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} /> Read-only</span>}
                        </>
                        : <>Paint GRN <span className="subtitle">Receive paint from suppliers</span></>}
                </div>
                <div className="actions">
                    {!form && canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={13} /> New</button>}
                    {form && !isReadOnly && canEdit && (
                        <button className="btn btn-primary" onClick={saveDraft} disabled={saving || !dirty}><Save size={13} /> Save</button>
                    )}
                    {form?.Status === 'Draft' && id && canEdit && (
                        <button className="btn btn-primary" onClick={finalize} disabled={saving}><Check size={13} /> Finalize</button>
                    )}
                    {form?.Status === 'Posted' && canUnfinalize && (
                        <button className="btn btn-secondary" onClick={unfinalize} disabled={saving}><RefreshCcw size={13} /> Unfinalize</button>
                    )}
                    {form && id && <button className="btn" onClick={printGRN}><Printer size={13} /> Print</button>}
                    {form?.Status === 'Draft' && id && canEdit && (
                        <button className="btn btn-danger" onClick={remove} disabled={saving}><Trash2 size={13} /> Delete</button>
                    )}
                    {form && <button className="btn" onClick={closeForm}><X size={13} /> Close</button>}
                </div>
            </div>

            {/* LIST-ONLY VIEW */}
            {!form && (
                <>
                    <div className="paint-filterbar">
                        <div className="erp-search-input" style={{ height: 28, minWidth: 240 }}>
                            <Search size={12} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="GRN #, Bill #, Supplier…" />
                            {search && <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                        </div>
                        <label>
                            Status
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                <option value="">All</option>
                                <option value="Draft">Draft</option>
                                <option value="Posted">Posted</option>
                                <option value="Reversed">Reversed</option>
                            </select>
                        </label>
                        <div className="spacer" />
                        <span className="hint">{list.length} record{list.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="paint-table-wrap tall">
                        <table className="paint-table">
                            <thead>
                                <tr>
                                    <th>GRN #</th>
                                    <th>Date</th>
                                    <th>Supplier</th>
                                    <th>Bill #</th>
                                    <th>Warehouse</th>
                                    <th>Voucher</th>
                                    <th className="num">Grand Total</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(row => (
                                    <tr key={row.PaintGRNID} onClick={() => openId(row.PaintGRNID)} style={{ cursor: 'pointer' }}>
                                        <td className="mono"><strong>{row.GRNNo}</strong></td>
                                        <td>{(row.GRNDate || '').slice(0, 10)}</td>
                                        <td className="trunc">{row.PartyName}</td>
                                        <td className="trunc">{row.SupplierBillNo || ''}</td>
                                        <td className="trunc">{row.WHDesc}</td>
                                        <td className="mono">{row.VoucherID ? `#${row.VoucherID}` : ''}</td>
                                        <td className="num">{fmt(row.GrandTotal)}</td>
                                        <td><StatusPill status={row.Status} /></td>
                                    </tr>
                                ))}
                                {list.length === 0 && (
                                    <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                                        No Paint GRNs. Click New to record one.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* FORM VIEW */}
            {form && (
                <>
                    <div className="paint-card">
                        <div className="paint-card-title">Header</div>
                        <fieldset disabled={isReadOnly} style={{ border: 0, padding: 0, margin: 0 }}>
                            <div className="paint-form-grid">
                                <label>GRN Date *
                                    <input className="field" type="date" value={form.GRNDate}
                                        onChange={e => patch('GRNDate', e.target.value)} />
                                </label>
                                <label>Supplier *
                                    <SearchableSelect value={form.PartyID}
                                        onChange={v => patch('PartyID', v)}
                                        options={partyOpts}
                                        placeholder="Select supplier…"
                                        title="Pick supplier" />
                                </label>
                                <label>Warehouse *
                                    <SearchableSelect value={form.PaintWHID}
                                        onChange={v => patch('PaintWHID', v)}
                                        options={whOpts}
                                        placeholder="Select warehouse…"
                                        title="Pick warehouse" />
                                </label>
                                <label>Supplier Bill No
                                    <input className="field" value={form.SupplierBillNo || ''}
                                        onChange={e => patch('SupplierBillNo', e.target.value)}
                                        placeholder="e.g. INV-12345" />
                                </label>
                                <label className="span-2">Remarks
                                    <input className="field" value={form.Remarks || ''}
                                        onChange={e => patch('Remarks', e.target.value)} placeholder="Optional" />
                                </label>
                            </div>
                        </fieldset>
                    </div>

                    {parties.length === 0 && (
                        <div className="erp-alert warning" style={{ padding: '6px 10px', fontSize: 12 }}>
                            <AlertTriangle size={13} /> No suppliers mapped to PAINT_LAB.
                            Open <a href="/parties/business-access">Party Business Access</a> and grant it.
                        </div>
                    )}

                    <div className="paint-card">
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                            <div className="paint-card-title" style={{ marginBottom: 0, flex: 1 }}>Lines</div>
                            {!isReadOnly && <button className="btn" onClick={addLine}><Plus size={12} /> Add Line</button>}
                        </div>

                        <div className="paint-table-wrap">
                            <table className="paint-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}>#</th>
                                        <th>Paint Item *</th>
                                        <th style={{ width: 100 }}>UOM</th>
                                        <th className="num" style={{ width: 90 }}>Qty *</th>
                                        <th className="num" style={{ width: 90 }}>Rate *</th>
                                        <th className="num" style={{ width: 70 }}>Disc %</th>
                                        <th className="num" style={{ width: 80 }}>Disc Amt</th>
                                        <th style={{ width: 40, textAlign: 'center' }}>GST</th>
                                        <th className="num" style={{ width: 60 }}>GST %</th>
                                        <th className="num" style={{ width: 80 }}>GST Amt</th>
                                        <th className="num" style={{ width: 100 }}>Line Total</th>
                                        <th style={{ width: 30 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linesWithCalc.map((l, idx) => (
                                        <tr key={idx}>
                                            <td>{idx + 1}</td>
                                            <td style={{ minWidth: 220 }}>
                                                <SearchableSelect value={l.PaintItemID}
                                                    onChange={v => {
                                                        const it = items.find(x => x.PaintItemID === Number(v));
                                                        patchLine(idx, {
                                                            PaintItemID: v,
                                                            PaintUOMID: it?.PaintUOMID || l.PaintUOMID || '',
                                                            GSTOn: it ? !!it.GSTDefaultOn : l.GSTOn,
                                                            GSTRate: it && it.GSTDefaultOn ? gstRate : (l.GSTOn ? gstRate : 0),
                                                        });
                                                    }}
                                                    options={itemOpts}
                                                    placeholder="Pick paint…"
                                                    title="Pick paint item" />
                                            </td>
                                            <td>
                                                <SearchableSelect value={l.PaintUOMID || ''}
                                                    onChange={v => patchLine(idx, { PaintUOMID: v })}
                                                    options={uomOptsForItem(l.PaintItemID)} placeholder="UOM" title="Pick UOM" />
                                            </td>
                                            <td className="num">
                                                <input type="number" step="0.0001" value={l.Quantity} min={0}
                                                    onChange={e => patchLine(idx, { Quantity: e.target.value })} />
                                            </td>
                                            <td className="num">
                                                <input type="number" step="0.0001" value={l.UnitRate} min={0}
                                                    onChange={e => patchLine(idx, { UnitRate: e.target.value })} />
                                            </td>
                                            <td className="num">
                                                <input type="number" step="0.01" value={l.DiscountPct} min={0} max={100}
                                                    onChange={e => patchLine(idx, { DiscountPct: e.target.value, DiscountAmt: '' })} />
                                            </td>
                                            <td className="num">
                                                <input type="number" step="0.01" value={l.DiscountAmt}
                                                    onChange={e => patchLine(idx, { DiscountAmt: e.target.value })}
                                                    placeholder={fmt(l._discAmt)} />
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <input type="checkbox" checked={!!l.GSTOn}
                                                    onChange={e => patchLine(idx, { GSTOn: e.target.checked, GSTRate: e.target.checked ? gstRate : 0 })} />
                                            </td>
                                            <td className="num">
                                                <input type="number" step="0.01" value={l.GSTRate} min={0}
                                                    disabled={!l.GSTOn}
                                                    onChange={e => patchLine(idx, { GSTRate: e.target.value })} />
                                            </td>
                                            <td className="num">{fmt(l._gstAmt)}</td>
                                            <td className="num"><strong>{fmt(l._total)}</strong></td>
                                            <td>
                                                {!isReadOnly && (
                                                    <button className="row-btn" onClick={() => removeLine(idx)} title="Remove">
                                                        <Trash2 size={11} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {linesWithCalc.length === 0 && (
                                        <tr><td colSpan={12} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                                            No lines. Click Add Line to start.
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="paint-totals">
                        <div className="t"><span className="lbl">Sub Total</span><span className="val">{fmt(totals.SubTotal)}</span></div>
                        <div className="t"><span className="lbl">Discount</span><span className="val">{fmt(totals.DiscountTotal)}</span></div>
                        <div className="t"><span className="lbl">GST</span><span className="val">{fmt(totals.GSTTotal)}</span></div>
                        <div className="t emph"><span className="lbl">Grand Total</span><span className="val">{fmt(totals.GrandTotal)}</span></div>
                    </div>
                </>
            )}
        </div>
    );
}

function StatusPill({ status }) {
    const s = (status || '').toLowerCase();
    return <span className={`paint-status ${s}`}>{status}</span>;
}
