/**
 * Paint GRTN — compact desktop-ERP layout (owner ask 2026-07-05).
 *
 * BUSINESS LOGIC UNCHANGED:
 *  - Source-doc restriction: lines picked from paint_GRNDetail with
 *    Remaining = Quantity - ReturnedQty - other-draft reservations.
 *  - OriginalUnitCost pinned from source LandedUnitCost.
 *  - Dr Supplier / Cr Paint Inventory on finalize.
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
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export default function PaintGRTN() {
    const { hasModule } = useAuth();
    const { notify, confirm } = useFeedback();
    const canUnfinalize = hasModule('admin_unfinalize');
    const canEdit = hasModule('paint_lab_grtn');

    const [list, setList]             = useState([]);
    const [search, setSearch]         = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [parties, setParties]       = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    const [id, setId]                     = useState(null);
    const [form, setForm]                 = useState(null);
    const [sourceOptions, setSourceOpts]  = useState([]);
    const [sourceLines, setSourceLines]   = useState([]);
    const [dirty, setDirty]               = useState(false);
    const [saving, setSaving]             = useState(false);

    const reloadList = async () => {
        const params = {};
        if (search) params.search = search;
        if (statusFilter) params.status = statusFilter;
        const r = await axios.get('/api/paint/grtn', { params });
        setList(r.data || []);
    };

    useEffect(() => {
        (async () => {
            try {
                const [p, w] = await Promise.all([
                    axios.get('/api/parties', { params: { business: 'PAINT_LAB' } }),
                    axios.get('/api/paint/warehouses'),
                ]);
                setParties(p.data || []); setWarehouses(w.data || []);
            } catch (e) { notify({ type: 'error', title: 'Setup load failed', message: e.response?.data?.error || e.message }); }
            reloadList();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { reloadList().catch(() => {}); /* eslint-disable-next-line */ }, [search, statusFilter]);

    useEffect(() => {
        (async () => {
            if (!form?.PartyID) { setSourceOpts([]); return; }
            try {
                const r = await axios.get('/api/paint/grtn/sources', { params: { partyId: form.PartyID } });
                setSourceOpts(r.data || []);
            } catch { setSourceOpts([]); }
        })();
    }, [form?.PartyID]);

    useEffect(() => {
        (async () => {
            if (!form?.SourcePaintGRNID) { setSourceLines([]); return; }
            try {
                const r = await axios.get(`/api/paint/grtn/sources/${form.SourcePaintGRNID}/lines`,
                    { params: id ? { excludeGRTNID: id } : {} });
                setSourceLines(r.data || []);
            } catch { setSourceLines([]); }
        })();
    }, [form?.SourcePaintGRNID, id]);

    const openNew = () => {
        setId(null);
        setForm({
            GRTNDate: today(),
            PartyID: '', SourcePaintGRNID: '',
            PaintWHID: warehouses[0]?.PaintWHID || '',
            Remarks: '', Status: 'Draft', Lines: [],
        });
        setDirty(false);
    };

    const openId = async (rowId) => {
        try {
            const r = await axios.get(`/api/paint/grtn/${rowId}`);
            const data = r.data;
            setId(data.PaintGRTNID);
            setForm({
                GRTNNo: data.GRTNNo,
                GRTNDate: (data.GRTNDate || '').slice(0, 10),
                PartyID: data.PartyID,
                SourcePaintGRNID: data.SourcePaintGRNID,
                PaintWHID: data.PaintWHID,
                Remarks: data.Remarks || '',
                Status: data.Status,
                VoucherNo: data.VoucherNo,
                Lines: (data.Lines || []).map(l => ({
                    SourceGRNDetailID: l.SourceGRNDetailID,
                    Quantity: Number(l.Quantity),
                })),
            });
            setDirty(false);
        } catch (e) {
            notify({ type: 'error', title: 'Could not open', message: e.response?.data?.error || e.message });
        }
    };

    const closeForm = async () => {
        if (dirty && !(await confirm({ title: 'Discard changes?', message: 'You have unsaved changes.', confirmLabel: 'Discard', tone: 'warning' }))) return;
        setId(null); setForm(null); setDirty(false);
    };

    const getQty = (srcDetId) => {
        const l = form.Lines.find(x => Number(x.SourceGRNDetailID) === Number(srcDetId));
        return l ? l.Quantity : '';
    };
    const setQty = (srcDetId, qty) => {
        setForm(f => {
            const others = f.Lines.filter(x => Number(x.SourceGRNDetailID) !== Number(srcDetId));
            const n = qty === '' ? '' : Number(qty);
            const next = (!Number.isFinite(n) || n <= 0) ? others : [...others, { SourceGRNDetailID: srcDetId, Quantity: n }];
            return { ...f, Lines: next };
        });
        setDirty(true);
    };

    const rows = useMemo(() => sourceLines.map(sl => {
        const qty = round4(Number(getQty(sl.PaintGRNDetailID)) || 0);
        const cap = round4(Number(sl.Remaining || 0));
        return {
            ...sl, _qty: qty, _cap: cap,
            _overflow: qty - cap > 0.0001,
            _lineTotal: round2(qty * Number(sl.LandedUnitCost)),
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [sourceLines, form?.Lines]);

    const totals = useMemo(() => rows.reduce((a, r) => ({
        qty: a.qty + r._qty,
        line: a.line + r._lineTotal,
    }), { qty: 0, line: 0 }), [rows]);

    const isReadOnly = form && form.Status !== 'Draft';

    const patch = (k, v) => {
        setForm(f => {
            const next = { ...f, [k]: v };
            if (k === 'PartyID' || k === 'SourcePaintGRNID') next.Lines = [];
            return next;
        });
        setDirty(true);
    };

    const buildPayload = () => ({
        GRTNDate: form.GRTNDate,
        PartyID: form.PartyID,
        SourcePaintGRNID: form.SourcePaintGRNID,
        PaintWHID: form.PaintWHID,
        Remarks: form.Remarks || null,
        Lines: form.Lines,
    });

    const saveDraft = async () => {
        if (!form.SourcePaintGRNID) { notify({ type: 'error', title: 'Pick a source GRN' }); return; }
        if ((form.Lines || []).length === 0) { notify({ type: 'error', title: 'Enter return qty on at least one line' }); return; }
        try {
            setSaving(true);
            if (id) {
                await axios.put(`/api/paint/grtn/${id}`, buildPayload());
                notify({ type: 'success', title: 'Draft saved' });
            } else {
                const r = await axios.post('/api/paint/grtn', buildPayload());
                setId(r.data.PaintGRTNID);
                notify({ type: 'success', title: 'Draft created' });
                await openId(r.data.PaintGRTNID);
            }
            setDirty(false);
            await reloadList();
        } catch (e) {
            notify({ type: 'error', title: 'Could not save', message: e.response?.data?.error || e.message });
        } finally { setSaving(false); }
    };

    const finalize = async () => {
        if (dirty) {
            if (!(await confirm({ title: 'Save + Finalize?', message: 'Save then finalize?', confirmLabel: 'Save + Finalize' }))) return;
            await saveDraft();
        } else if (!(await confirm({
            title: 'Finalize Paint GRTN?',
            message: 'Reduces stock at each line\'s original cost, bumps ReturnedQty on the source GRN, posts a GL voucher.',
            confirmLabel: 'Finalize',
        }))) return;
        try {
            setSaving(true);
            const r = await axios.post(`/api/paint/grtn/${id}/finalize`);
            notify({ type: 'success', title: 'Finalized', message: r.data.VoucherNo ? `Voucher ${r.data.VoucherNo}` : '' });
            await openId(id);
            await reloadList();
        } catch (e) {
            notify({ type: 'error', title: 'Finalize failed', message: e.response?.data?.error || e.message });
        } finally { setSaving(false); }
    };

    const unfinalize = async () => {
        if (!(await confirm({
            title: 'Unfinalize Paint GRTN?',
            message: 'Reverses the voucher and restores stock at the original unit cost.',
            confirmLabel: 'Unfinalize', tone: 'warning',
        }))) return;
        try {
            setSaving(true);
            await axios.post(`/api/paint/grtn/${id}/unfinalize`);
            notify({ type: 'success', title: 'Unfinalized' });
            await openId(id);
            await reloadList();
        } catch (e) {
            notify({ type: 'error', title: 'Unfinalize failed', message: e.response?.data?.error || e.message });
        } finally { setSaving(false); }
    };

    const remove = async () => {
        if (!(await confirm({ title: 'Delete draft?', message: 'This draft will be permanently deleted.', confirmLabel: 'Delete', tone: 'danger' }))) return;
        try {
            await axios.delete(`/api/paint/grtn/${id}`);
            notify({ type: 'success', title: 'Draft deleted' });
            setId(null); setForm(null); setDirty(false);
            await reloadList();
        } catch (e) {
            notify({ type: 'error', title: 'Delete failed', message: e.response?.data?.error || e.message });
        }
    };

    const printPage = () => id && window.open(`/paint/grtn/${id}/print`, '_blank', 'noopener');

    const partyOpts = useMemo(() => parties.map(p => ({ id: p.PartyID, label: p.PartyName, sub: p.PhoneOne || p.NTNNO })), [parties]);
    const whOpts    = useMemo(() => warehouses.map(w => ({ id: w.PaintWHID, label: w.WHDesc, sub: w.WHCode })), [warehouses]);
    const grnOpts   = useMemo(() => sourceOptions.map(s => ({
        id: s.PaintGRNID,
        label: `${s.GRNNo} · ${(s.GRNDate || '').slice(0, 10)} · Remaining ${Number(s.RemainingQty).toFixed(2)}`,
        sub: s.WHDesc || '',
    })), [sourceOptions]);

    return (
        <div className="paint-page">
            <div className="paint-actionbar">
                {form && <button className="paint-icon-btn" onClick={closeForm} title="Back to list"><ChevronLeft size={13} /></button>}
                <div className="title">
                    {form
                        ? <>Paint GRTN {form.GRTNNo || (id ? `#${id}` : '· New')}
                            <StatusPill status={form.Status} />
                            {form.VoucherNo && <span className="subtitle">· Voucher {form.VoucherNo}</span>}
                            {isReadOnly && <span className="subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} /> Read-only</span>}
                        </>
                        : <>Paint GRTN <span className="subtitle">Return paint to supplier against a specific Paint GRN</span></>}
                </div>
                <div className="actions">
                    {!form && canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={13} /> New</button>}
                    {form && !isReadOnly && canEdit && <button className="btn btn-primary" onClick={saveDraft} disabled={saving || !dirty}><Save size={13} /> Save</button>}
                    {form?.Status === 'Draft' && id && canEdit && <button className="btn btn-primary" onClick={finalize} disabled={saving}><Check size={13} /> Finalize</button>}
                    {form?.Status === 'Posted' && canUnfinalize && <button className="btn btn-secondary" onClick={unfinalize} disabled={saving}><RefreshCcw size={13} /> Unfinalize</button>}
                    {form && id && <button className="btn" onClick={printPage}><Printer size={13} /> Print</button>}
                    {form?.Status === 'Draft' && id && canEdit && <button className="btn btn-danger" onClick={remove} disabled={saving}><Trash2 size={13} /> Delete</button>}
                    {form && <button className="btn" onClick={closeForm}><X size={13} /> Close</button>}
                </div>
            </div>

            {!form && (
                <>
                    <div className="paint-filterbar">
                        <div className="erp-search-input" style={{ height: 28, minWidth: 240 }}>
                            <Search size={12} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="GRTN #, Supplier, Source GRN…" />
                            {search && <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                        </div>
                        <label>Status
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
                                    <th>GRTN #</th>
                                    <th>Date</th>
                                    <th>Supplier</th>
                                    <th>Source GRN</th>
                                    <th>Warehouse</th>
                                    <th className="num">Grand Total</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(row => (
                                    <tr key={row.PaintGRTNID} onClick={() => openId(row.PaintGRTNID)} style={{ cursor: 'pointer' }}>
                                        <td className="mono"><strong>{row.GRTNNo}</strong></td>
                                        <td>{(row.GRTNDate || '').slice(0, 10)}</td>
                                        <td className="trunc">{row.PartyName}</td>
                                        <td className="mono">{row.SourceGRNNo || '—'}</td>
                                        <td className="trunc">{row.WHDesc}</td>
                                        <td className="num">{fmt(row.GrandTotal)}</td>
                                        <td><StatusPill status={row.Status} /></td>
                                    </tr>
                                ))}
                                {list.length === 0 && (
                                    <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                                        No Paint GRTNs. Click New to record one.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {form && (
                <>
                    <div className="paint-card">
                        <div className="paint-card-title">Header</div>
                        <fieldset disabled={isReadOnly} style={{ border: 0, padding: 0, margin: 0 }}>
                            <div className="paint-form-grid">
                                <label>GRTN Date *
                                    <input className="field" type="date" value={form.GRTNDate}
                                        onChange={e => patch('GRTNDate', e.target.value)} />
                                </label>
                                <label>Supplier *
                                    <SearchableSelect value={form.PartyID} onChange={v => patch('PartyID', v)}
                                        options={partyOpts} placeholder="Select supplier…" title="Pick supplier" />
                                </label>
                                <label className="span-2">Source Paint GRN *
                                    <SearchableSelect value={form.SourcePaintGRNID} onChange={v => patch('SourcePaintGRNID', v)}
                                        options={grnOpts}
                                        placeholder={form.PartyID ? 'Select source GRN…' : 'Pick supplier first'}
                                        title="Pick source Paint GRN"
                                        disabled={!form.PartyID} />
                                </label>
                                <label>Warehouse *
                                    <SearchableSelect value={form.PaintWHID} onChange={v => patch('PaintWHID', v)}
                                        options={whOpts} placeholder="Select warehouse…" title="Pick warehouse" />
                                </label>
                                <label className="span-2">Remarks
                                    <input className="field" value={form.Remarks || ''}
                                        onChange={e => { setForm(f => ({ ...f, Remarks: e.target.value })); setDirty(true); }}
                                        placeholder="Optional" />
                                </label>
                            </div>
                        </fieldset>
                    </div>

                    {form.PartyID && sourceOptions.length === 0 && (
                        <div className="erp-alert warning" style={{ padding: '6px 10px', fontSize: 12 }}>
                            <AlertTriangle size={13} /> No returnable Paint GRNs for this supplier.
                        </div>
                    )}

                    <div className="paint-card">
                        <div className="paint-card-title">Returnable Lines</div>
                        <div className="paint-table-wrap">
                            <table className="paint-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}>#</th>
                                        <th>Code</th>
                                        <th>Paint Name</th>
                                        <th>UOM</th>
                                        <th className="num">Src Qty</th>
                                        <th className="num">Already Ret.</th>
                                        <th className="num">Remaining</th>
                                        <th className="num">Unit Cost</th>
                                        <th className="num">Return Qty</th>
                                        <th className="num">Line Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r, i) => (
                                        <tr key={r.PaintGRNDetailID} className={r._overflow ? 'is-warn' : ''}>
                                            <td>{i + 1}</td>
                                            <td className="mono">{r.PaintCode}</td>
                                            <td className="trunc">{r.PaintName}</td>
                                            <td>{r.UOMName}</td>
                                            <td className="num">{fmt(r.Quantity)}</td>
                                            <td className="num">{fmt(r.ReturnedQty)}</td>
                                            <td className="num"><strong>{fmt(r._cap)}</strong></td>
                                            <td className="num">{fmt(r.LandedUnitCost)}</td>
                                            <td className="num">
                                                <input type="number" step="0.0001" min={0} max={r._cap}
                                                    value={getQty(r.PaintGRNDetailID)}
                                                    onChange={e => setQty(r.PaintGRNDetailID, e.target.value)}
                                                    placeholder="0" />
                                            </td>
                                            <td className="num"><strong>{fmt(r._lineTotal)}</strong></td>
                                        </tr>
                                    ))}
                                    {rows.length === 0 && (
                                        <tr><td colSpan={10} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                                            {form.SourcePaintGRNID ? 'This GRN has nothing left to return.' : 'Pick a source Paint GRN to see returnable lines.'}
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {rows.some(r => r._overflow) && (
                        <div className="erp-alert error" style={{ padding: '6px 10px', fontSize: 12 }}>
                            <AlertTriangle size={13} /> One or more return quantities exceed the source remaining. Fix before saving.
                        </div>
                    )}

                    <div className="paint-totals">
                        <div className="t"><span className="lbl">Total Qty</span><span className="val">{fmt(totals.qty)}</span></div>
                        <div className="t emph"><span className="lbl">Grand Total</span><span className="val">{fmt(totals.line)}</span></div>
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
