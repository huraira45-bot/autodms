/**
 * Paint GRN — receive paint from a supplier. Owner ask 2026-07-04.
 *
 * Two-pane layout: draft/posted list on the left; open form on the right.
 * Draft rows are freely editable and deletable. Posted rows are read-only
 * unless an admin unfinalizes them (which reverses the GL voucher and rolls
 * back the moving-average cost impact using each line's original landed
 * unit cost).
 *
 * Moving-average math lives server-side (paintGRNController.finalize). This
 * screen only builds the payload and shows the results.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, Save, Check, Trash2, Printer, X, Search, AlertTriangle, RefreshCcw, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { ErpControlPanel, ErpStatusPill, ErpEmptyState, ErpField } from '../../components/erp';
import SearchableSelect from '../../components/SearchableSelect';

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Blank form + blank line templates — a fresh Draft always starts here.
const blankLine = (defaultUomId, defaultGstRate) => ({
    PaintItemID: '',
    PaintUOMID: defaultUomId || '',
    Quantity: 1,
    UnitRate: 0,
    DiscountPct: 0,
    DiscountAmt: 0,
    GSTOn: true,
    GSTRate: defaultGstRate || 0,
});

export default function PaintGRN() {
    const { hasModule } = useAuth();
    const { notify, confirm } = useFeedback();
    const canUnfinalize = hasModule('admin_unfinalize');
    const canEdit = hasModule('paint_lab_grn');

    const [list, setList]     = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Master pickers
    const [items, setItems]           = useState([]);
    const [uoms, setUoms]             = useState([]);
    const [parties, setParties]       = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [gstRate, setGstRate]       = useState(0);

    // Open form state
    const [id, setId]         = useState(null);
    const [form, setForm]     = useState(null);
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);

    // ── Initial loads ──
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
                const [i, u, p, w, tr] = await Promise.all([
                    axios.get('/api/paint/items'),
                    axios.get('/api/paint/uom'),
                    axios.get('/api/parties', { params: { business: 'PAINT_LAB' } }),
                    axios.get('/api/paint/warehouses'),
                    axios.get('/api/tax-rates').catch(() => ({ data: { current: [] } })),
                ]);
                setItems(i.data || []);
                setUoms(u.data || []);
                setParties(p.data || []);
                setWarehouses(w.data || []);
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

    // ── Open / new form actions ──
    const openNew = () => {
        setId(null);
        setForm({
            GRNDate: today(),
            PartyID: '',
            SupplierBillNo: '',
            PaintWHID: warehouses[0]?.PaintWHID || '',
            Remarks: '',
            Status: 'Draft',
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
                GRNDate:   (data.GRNDate || '').slice(0, 10),
                PartyID:   data.PartyID,
                SupplierBillNo: data.SupplierBillNo || '',
                PaintWHID: data.PaintWHID,
                Remarks:   data.Remarks || '',
                Status:    data.Status,
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
                    _existing:   true,
                    LineTotal:   Number(l.LineTotal),
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

    // ── Form mutators ──
    const patch = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
    const patchLine = (idx, patchObj) => {
        setForm(f => {
            const Lines = f.Lines.map((l, i) => i === idx ? { ...l, ...patchObj } : l);
            return { ...f, Lines };
        });
        setDirty(true);
    };
    const addLine = () => {
        setForm(f => ({ ...f, Lines: [...f.Lines, blankLine(null, gstRate)] }));
        setDirty(true);
    };
    const removeLine = (idx) => {
        setForm(f => ({ ...f, Lines: f.Lines.filter((_, i) => i !== idx) }));
        setDirty(true);
    };

    // Line calc — mirrors server-side computeLineAmounts so the preview
    // stays consistent with what will get saved.
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
        SubTotal:      a.SubTotal      + x._gross,
        DiscountTotal: a.DiscountTotal + x._discAmt,
        GSTTotal:      a.GSTTotal      + x._gstAmt,
        GrandTotal:    a.GrandTotal    + x._total,
    }), { SubTotal: 0, DiscountTotal: 0, GSTTotal: 0, GrandTotal: 0 }), [linesWithCalc]);

    const isReadOnly = form && form.Status !== 'Draft';

    // ── Save / Finalize / Delete / Unfinalize ──
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
            }
            setDirty(false);
            await reloadList();
        } catch (err) {
            notify({ type: 'error', title: 'Could not save', message: err.response?.data?.error || err.message });
        } finally { setSaving(false); }
    };

    const finalize = async () => {
        if (dirty) {
            if (!(await confirm({ title: 'Save + Finalize?', message: 'Your changes must be saved before finalizing. Continue?', confirmLabel: 'Save + Finalize' }))) return;
            await saveDraft();
        } else if (!(await confirm({
            title: 'Finalize Paint GRN?',
            message: 'This will add stock to inventory (moving-avg cost updated), post a GL voucher, and lock the record.',
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
            message: 'Reverses the GL voucher and rolls back the moving-average cost using each line\'s original landed unit cost. Only proceed if no downstream GRTN or Issue has consumed this stock.',
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

    const printPaintGRN = () => {
        if (!id) return;
        window.open(`/paint/grn/${id}/print`, '_blank', 'noopener');
    };

    // ── Options for pickers ──
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

    // ── Render ──
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel title="Paint GRN"
                subtitle="Receive paint from suppliers. Finalize updates stock, moving-average cost, and posts a purchase voucher."
                actions={canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> New GRN</button>}
            >
                <div className="erp-search-input">
                    <Search size={14} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="GRN #, Bill #, Supplier…" />
                    {search && <X size={14} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="erp-input">
                    <option value="">All statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Posted">Posted</option>
                    <option value="Reversed">Reversed</option>
                </select>
            </ErpControlPanel>

            <div style={{ display: 'grid', gridTemplateColumns: form ? 'minmax(280px, 340px) 1fr' : '1fr', gap: 10 }}>
                {/* LIST */}
                <div className="erp-panel" style={{ padding: 0, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                <th style={th}>GRN #</th>
                                <th style={th}>Date</th>
                                {!form && <th style={th}>Supplier</th>}
                                <th style={{ ...th, textAlign: 'right' }}>Grand Total</th>
                                <th style={th}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(row => (
                                <tr key={row.PaintGRNID}
                                    onClick={() => openId(row.PaintGRNID)}
                                    style={{
                                        cursor: 'pointer',
                                        background: row.PaintGRNID === id ? 'var(--erp-brand-soft)' : 'transparent',
                                        borderTop: '1px solid #e5e7eb',
                                    }}>
                                    <td style={td}><strong>{row.GRNNo}</strong></td>
                                    <td style={td}>{(row.GRNDate || '').slice(0, 10)}</td>
                                    {!form && <td style={td}>{row.PartyName}</td>}
                                    <td style={{ ...td, textAlign: 'right' }}>{fmt(row.GrandTotal)}</td>
                                    <td style={td}>
                                        <StatusPill status={row.Status} />
                                    </td>
                                </tr>
                            ))}
                            {list.length === 0 && (
                                <tr><td colSpan={form ? 4 : 5}>
                                    <ErpEmptyState title="No Paint GRNs" message="Create one to record paint received from a supplier." />
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* FORM */}
                {form && (
                    <div className="erp-panel" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontSize: 15, fontWeight: 600 }}>
                                    {id ? (form.GRNNo || `GRN #${id}`) : 'New Paint GRN'}
                                </div>
                                <StatusPill status={form.Status} />
                                {form.VoucherNo && <span style={{ fontSize: 12, color: '#64748b' }}>· Voucher {form.VoucherNo}</span>}
                                {isReadOnly && <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> Read-only</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {!isReadOnly && canEdit && (
                                    <button className="btn btn-primary" onClick={saveDraft} disabled={saving || !dirty}>
                                        <Save size={14} /> Save
                                    </button>
                                )}
                                {form.Status === 'Draft' && id && canEdit && (
                                    <button className="btn btn-primary" onClick={finalize} disabled={saving}>
                                        <Check size={14} /> Finalize
                                    </button>
                                )}
                                {form.Status === 'Posted' && canUnfinalize && (
                                    <button className="btn btn-secondary" onClick={unfinalize} disabled={saving}>
                                        <RefreshCcw size={14} /> Unfinalize
                                    </button>
                                )}
                                {id && (
                                    <button className="btn" onClick={printPaintGRN}>
                                        <Printer size={14} /> Print
                                    </button>
                                )}
                                {form.Status === 'Draft' && id && canEdit && (
                                    <button className="btn btn-danger" onClick={remove} disabled={saving}>
                                        <Trash2 size={14} /> Delete
                                    </button>
                                )}
                                <button className="btn" onClick={closeForm}><X size={14} /> Close</button>
                            </div>
                        </div>

                        <fieldset disabled={isReadOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
                                <ErpField label="GRN Date *">
                                    <input type="date" value={form.GRNDate} onChange={e => patch('GRNDate', e.target.value)} />
                                </ErpField>
                                <ErpField label="Supplier *">
                                    <SearchableSelect
                                        value={form.PartyID}
                                        onChange={v => patch('PartyID', v)}
                                        options={partyOpts}
                                        placeholder="Select supplier…"
                                        title="Pick supplier"
                                    />
                                </ErpField>
                                <ErpField label="Warehouse *">
                                    <SearchableSelect
                                        value={form.PaintWHID}
                                        onChange={v => patch('PaintWHID', v)}
                                        options={whOpts}
                                        placeholder="Select warehouse…"
                                        title="Pick warehouse"
                                    />
                                </ErpField>
                                <ErpField label="Supplier Bill No">
                                    <input value={form.SupplierBillNo || ''} onChange={e => patch('SupplierBillNo', e.target.value)} placeholder="e.g. INV-12345" />
                                </ErpField>
                            </div>
                            <ErpField label="Remarks">
                                <input value={form.Remarks || ''} onChange={e => patch('Remarks', e.target.value)} placeholder="Optional" />
                            </ErpField>

                            {parties.length === 0 && (
                                <div className="erp-alert warning" style={{ marginTop: 8 }}>
                                    <AlertTriangle size={14} /> No suppliers mapped to PAINT_LAB. Open <a href="/parties/business-access">Party Business Access</a> and grant PAINT_LAB to your paint suppliers.
                                </div>
                            )}

                            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 600 }}>Lines</div>
                                {!isReadOnly && <button className="btn" onClick={addLine}><Plus size={14} /> Add Line</button>}
                            </div>

                            <div style={{ overflowX: 'auto', marginTop: 6 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={th2}>#</th>
                                            <th style={th2}>Paint Item *</th>
                                            <th style={th2}>UOM</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Qty *</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Rate *</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Disc %</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Disc Amt</th>
                                            <th style={{ ...th2, textAlign: 'center' }}>GST</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>GST %</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>GST Amt</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Line Total</th>
                                            <th style={th2}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {linesWithCalc.map((l, idx) => (
                                            <tr key={idx} style={{ borderTop: '1px solid #e5e7eb' }}>
                                                <td style={td2}>{idx + 1}</td>
                                                <td style={{ ...td2, minWidth: 220 }}>
                                                    <SearchableSelect
                                                        value={l.PaintItemID}
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
                                                        title="Pick paint item"
                                                    />
                                                </td>
                                                <td style={{ ...td2, minWidth: 100 }}>
                                                    <SearchableSelect
                                                        value={l.PaintUOMID || ''}
                                                        onChange={v => patchLine(idx, { PaintUOMID: v })}
                                                        options={uomOpts}
                                                        placeholder="UOM"
                                                        title="Pick UOM"
                                                    />
                                                </td>
                                                <td style={td2}>
                                                    <input type="number" step="0.0001" value={l.Quantity} min={0}
                                                        onChange={e => patchLine(idx, { Quantity: e.target.value })}
                                                        style={{ width: '100%', textAlign: 'right' }} />
                                                </td>
                                                <td style={td2}>
                                                    <input type="number" step="0.0001" value={l.UnitRate} min={0}
                                                        onChange={e => patchLine(idx, { UnitRate: e.target.value })}
                                                        style={{ width: '100%', textAlign: 'right' }} />
                                                </td>
                                                <td style={td2}>
                                                    <input type="number" step="0.01" value={l.DiscountPct} min={0} max={100}
                                                        onChange={e => patchLine(idx, {
                                                            DiscountPct: e.target.value,
                                                            DiscountAmt: '', // clear amt so % drives
                                                        })}
                                                        style={{ width: '100%', textAlign: 'right' }} />
                                                </td>
                                                <td style={td2}>
                                                    <input type="number" step="0.01" value={l.DiscountAmt}
                                                        onChange={e => patchLine(idx, { DiscountAmt: e.target.value })}
                                                        placeholder={fmt(l._discAmt)}
                                                        style={{ width: '100%', textAlign: 'right' }} />
                                                </td>
                                                <td style={{ ...td2, textAlign: 'center' }}>
                                                    <input type="checkbox" checked={!!l.GSTOn}
                                                        onChange={e => patchLine(idx, {
                                                            GSTOn: e.target.checked,
                                                            GSTRate: e.target.checked ? gstRate : 0,
                                                        })} />
                                                </td>
                                                <td style={td2}>
                                                    <input type="number" step="0.01" value={l.GSTRate} min={0}
                                                        disabled={!l.GSTOn}
                                                        onChange={e => patchLine(idx, { GSTRate: e.target.value })}
                                                        style={{ width: '100%', textAlign: 'right' }} />
                                                </td>
                                                <td style={{ ...td2, textAlign: 'right' }}>{fmt(l._gstAmt)}</td>
                                                <td style={{ ...td2, textAlign: 'right', fontWeight: 600 }}>{fmt(l._total)}</td>
                                                <td style={td2}>
                                                    {!isReadOnly && (
                                                        <button className="btn btn-sm btn-danger" onClick={() => removeLine(idx)} title="Remove line">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {linesWithCalc.length === 0 && (
                                            <tr><td colSpan={12} style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>
                                                No lines yet. Click "Add Line" to start.
                                            </td></tr>
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', fontWeight: 600 }}>
                                            <td style={td2} colSpan={6}>Totals</td>
                                            <td style={{ ...td2, textAlign: 'right' }}>{fmt(totals.DiscountTotal)}</td>
                                            <td colSpan={2}></td>
                                            <td style={{ ...td2, textAlign: 'right' }}>{fmt(totals.GSTTotal)}</td>
                                            <td style={{ ...td2, textAlign: 'right' }}>{fmt(totals.GrandTotal)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div style={{ marginTop: 12, display: 'flex', gap: 24, justifyContent: 'flex-end', fontSize: 13 }}>
                                <div>Sub Total: <strong>{fmt(totals.SubTotal)}</strong></div>
                                <div>Discount: <strong>{fmt(totals.DiscountTotal)}</strong></div>
                                <div>GST: <strong>{fmt(totals.GSTTotal)}</strong></div>
                                <div style={{ fontSize: 15 }}>Grand Total: <strong>{fmt(totals.GrandTotal)}</strong></div>
                            </div>
                        </fieldset>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatusPill({ status }) {
    if (status === 'Posted')   return <ErpStatusPill tone="success">Posted</ErpStatusPill>;
    if (status === 'Reversed') return <ErpStatusPill tone="danger">Reversed</ErpStatusPill>;
    return <ErpStatusPill tone="muted">Draft</ErpStatusPill>;
}

const th  = { padding: '6px 8px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#64748b' };
const td  = { padding: '6px 8px', fontSize: 12 };
const th2 = { padding: '4px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#64748b', whiteSpace: 'nowrap' };
const td2 = { padding: '3px 6px', fontSize: 12 };
