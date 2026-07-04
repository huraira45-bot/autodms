/**
 * Paint Issue — compact desktop-ERP layout (owner ask 2026-07-05).
 *
 * BUSINESS LOGIC UNCHANGED:
 *  - No draft state; stock deducted immediately on save.
 *  - IssueUnitCost pinned server-side at paint_Item.AvgCost.
 *  - Locked once linked JC finalizes; unlocks on JC unfinalize.
 *  - GL voucher deferred to JC finalize (Dr Consumption / Cr Inventory).
 *
 * User enters ONLY quantity; unit cost is a read-only preview of the
 * current avg (or pinned cost once saved).
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Plus, Save, Trash2, Printer, X, Search,
    AlertTriangle, Lock, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import SearchableSelect from '../../components/SearchableSelect';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const blankLine = (defaultUomId) => ({ PaintItemID: '', PaintUOMID: defaultUomId || '', Quantity: 1 });

export default function PaintIssue() {
    const { hasModule } = useAuth();
    const { notify, confirm } = useFeedback();
    const canEdit = hasModule('paint_lab_issue');

    const [list, setList]     = useState([]);
    const [search, setSearch] = useState('');
    const [lockedFilter, setLockedFilter] = useState('');
    const [items, setItems]           = useState([]);
    const [uoms, setUoms]             = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [jobs, setJobs]             = useState([]);

    const [id, setId]         = useState(null);
    const [form, setForm]     = useState(null);
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);

    const reloadList = async () => {
        const params = {};
        if (search) params.search = search;
        if (lockedFilter !== '') params.locked = lockedFilter;
        const r = await axios.get('/api/paint/issue', { params });
        setList(r.data || []);
    };

    useEffect(() => {
        (async () => {
            try {
                const [i, u, w, j] = await Promise.all([
                    axios.get('/api/paint/items'),
                    axios.get('/api/paint/uom'),
                    axios.get('/api/paint/warehouses'),
                    axios.get('/api/paint/issue/eligible-jobs'),
                ]);
                setItems(i.data || []);
                setUoms(u.data || []);
                setWarehouses(w.data || []);
                setJobs(j.data || []);
            } catch (e) { notify({ type: 'error', title: 'Setup load failed', message: e.response?.data?.error || e.message }); }
            reloadList();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { reloadList().catch(() => {}); /* eslint-disable-next-line */ }, [search, lockedFilter]);

    const openNew = () => {
        setId(null);
        setForm({
            IssueDate: today(),
            JobCardID: '',
            PaintWHID: warehouses[0]?.PaintWHID || '',
            Remarks: '', Locked: 0,
            Lines: [blankLine()],
        });
        setDirty(false);
    };

    const openId = async (rowId) => {
        try {
            const r = await axios.get(`/api/paint/issue/${rowId}`);
            const data = r.data;
            setId(data.PaintIssueID);
            setForm({
                IssueNo: data.IssueNo,
                IssueDate: (data.IssueDate || '').slice(0, 10),
                JobCardID: data.JobCardID,
                JobCardNo: data.JobCardNo,
                JCFinalized: !!data.JCFinalized,
                PaintWHID: data.PaintWHID,
                Remarks: data.Remarks || '',
                Locked: !!data.Locked,
                TotalCost: Number(data.TotalCost),
                CustomerName: data.CustomerName,
                VehicleRegNo: data.VehicleRegNo,
                Lines: (data.Lines || []).map(l => ({
                    PaintItemID: l.PaintItemID,
                    PaintUOMID: l.PaintUOMID || '',
                    Quantity: Number(l.Quantity),
                    IssueUnitCost: Number(l.IssueUnitCost),
                    LineTotal: Number(l.LineTotal),
                })),
            });
            setDirty(false);
        } catch (e) { notify({ type: 'error', title: 'Could not open', message: e.response?.data?.error || e.message }); }
    };

    const closeForm = async () => {
        if (dirty && !(await confirm({ title: 'Discard changes?', message: 'You have unsaved changes.', confirmLabel: 'Discard', tone: 'warning' }))) return;
        setId(null); setForm(null); setDirty(false);
    };

    const patch = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
    const patchLine = (idx, obj) => {
        setForm(f => ({ ...f, Lines: f.Lines.map((l, i) => i === idx ? { ...l, ...obj } : l) }));
        setDirty(true);
    };
    const addLine    = () => { setForm(f => ({ ...f, Lines: [...f.Lines, blankLine()] })); setDirty(true); };
    const removeLine = (idx) => { setForm(f => ({ ...f, Lines: f.Lines.filter((_, i) => i !== idx) })); setDirty(true); };

    const linesWithCalc = useMemo(() => (form?.Lines || []).map((l) => {
        const it = items.find(x => x.PaintItemID === Number(l.PaintItemID));
        const currentAvg = it ? Number(it.AvgCost) : 0;
        const pinned = l.IssueUnitCost != null ? Number(l.IssueUnitCost) : null;
        const previewCost = pinned != null ? pinned : currentAvg;
        const qty = Number(l.Quantity) || 0;
        return {
            ...l,
            _stock: it ? Number(it.StockQty) : null,
            _previewCost: round2(previewCost),
            _lineTotal: round2(qty * previewCost),
            _overStock: it && !pinned && (Number(it.StockQty) - qty < 0),
        };
    }), [form, items]);

    const totalCost = useMemo(() => linesWithCalc.reduce((a, x) => a + x._lineTotal, 0), [linesWithCalc]);
    const isReadOnly = form && form.Locked;

    const buildPayload = () => ({
        IssueDate: form.IssueDate,
        JobCardID: form.JobCardID,
        PaintWHID: form.PaintWHID,
        Remarks: form.Remarks || null,
        Lines: form.Lines.map(l => ({
            PaintItemID: l.PaintItemID,
            PaintUOMID: l.PaintUOMID || null,
            Quantity: Number(l.Quantity) || 0,
        })),
    });

    const save = async () => {
        try {
            setSaving(true);
            if (id) {
                await axios.put(`/api/paint/issue/${id}`, buildPayload());
                notify({ type: 'success', title: 'Issue updated', message: 'Stock adjusted.' });
                setDirty(false);
                await openId(id);
            } else {
                const r = await axios.post('/api/paint/issue', buildPayload());
                setId(r.data.PaintIssueID);
                notify({ type: 'success', title: 'Issue saved', message: 'Stock deducted.' });
                await openId(r.data.PaintIssueID);
                setDirty(false);
            }
            await reloadList();
        } catch (e) { notify({ type: 'error', title: 'Could not save', message: e.response?.data?.error || e.message }); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        if (!(await confirm({ title: 'Delete Paint Issue?', message: 'Stock will be restored at the pinned issue cost.', confirmLabel: 'Delete', tone: 'danger' }))) return;
        try {
            await axios.delete(`/api/paint/issue/${id}`);
            notify({ type: 'success', title: 'Deleted', message: 'Stock restored.' });
            setId(null); setForm(null); setDirty(false);
            await reloadList();
        } catch (e) { notify({ type: 'error', title: 'Delete failed', message: e.response?.data?.error || e.message }); }
    };

    const printPage = () => id && window.open(`/paint/issue/${id}/print`, '_blank', 'noopener');

    const itemOpts = useMemo(() => items.map(i => ({
        id: i.PaintItemID, label: i.PaintName,
        sub: `${i.PaintCode} · Stock ${Number(i.StockQty).toFixed(2)} · Cost ${Number(i.AvgCost).toFixed(2)}`,
        group: i.CategoryName || 'Uncategorised',
    })), [items]);
    const jobOpts = useMemo(() => jobs.map(j => ({
        id: j.JobCardId,
        label: `${j.JobCardNo} · ${j.VehicleRegNo || '—'}`,
        sub: `${j.CardCode} · ${j.CustomerName || ''}`.trim(),
    })), [jobs]);
    const whOpts = useMemo(() => warehouses.map(w => ({ id: w.PaintWHID, label: w.WHDesc, sub: w.WHCode })), [warehouses]);
    const uomOpts = useMemo(() => uoms.map(u => ({ id: u.PaintUOMID, label: u.UOMName })), [uoms]);

    return (
        <div className="paint-page">
            <div className="paint-actionbar">
                {form && <button className="paint-icon-btn" onClick={closeForm} title="Back to list"><ChevronLeft size={13} /></button>}
                <div className="title">
                    {form
                        ? <>Paint Issue {form.IssueNo || (id ? `#${id}` : '· New')}
                            <span className={`paint-status ${form.Locked ? 'locked' : 'open'}`}>{form.Locked ? 'Locked' : 'Open'}</span>
                            {form.JobCardNo && <span className="subtitle">· JC {form.JobCardNo}</span>}
                            {isReadOnly && <span className="subtitle" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={10} /> Read-only</span>}
                        </>
                        : <>Paint Issue <span className="subtitle">Issue paint to a Job Card (internal costing only)</span></>}
                </div>
                <div className="actions">
                    {!form && canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={13} /> New</button>}
                    {form && !isReadOnly && canEdit && <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}><Save size={13} /> Save</button>}
                    {form && id && <button className="btn" onClick={printPage}><Printer size={13} /> Print</button>}
                    {form && !isReadOnly && id && canEdit && <button className="btn btn-danger" onClick={remove} disabled={saving}><Trash2 size={13} /> Delete</button>}
                    {form && <button className="btn" onClick={closeForm}><X size={13} /> Close</button>}
                </div>
            </div>

            {!form && (
                <>
                    <div className="paint-filterbar">
                        <div className="erp-search-input" style={{ height: 28, minWidth: 220 }}>
                            <Search size={12} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Issue #, JC #…" />
                            {search && <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                        </div>
                        <label>Status
                            <select value={lockedFilter} onChange={e => setLockedFilter(e.target.value)}>
                                <option value="">All</option>
                                <option value="0">Open (editable)</option>
                                <option value="1">Locked (JC finalized)</option>
                            </select>
                        </label>
                        <div className="spacer" />
                        <span className="hint">{list.length} record{list.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="paint-table-wrap tall">
                        <table className="paint-table">
                            <thead>
                                <tr>
                                    <th>Issue #</th>
                                    <th>Date</th>
                                    <th>Job Card</th>
                                    <th>Vehicle</th>
                                    <th>Warehouse</th>
                                    <th className="num">Total Cost</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map(row => (
                                    <tr key={row.PaintIssueID} onClick={() => openId(row.PaintIssueID)} style={{ cursor: 'pointer' }}>
                                        <td className="mono"><strong>{row.IssueNo}</strong></td>
                                        <td>{(row.IssueDate || '').slice(0, 10)}</td>
                                        <td className="mono">{row.JobCardNo}</td>
                                        <td className="trunc">{row.VehicleRegNo || ''}</td>
                                        <td className="trunc">{row.WHDesc}</td>
                                        <td className="num">{fmt(row.TotalCost)}</td>
                                        <td>
                                            <span className={`paint-status ${row.Locked ? 'locked' : 'open'}`}>
                                                {row.Locked ? 'Locked' : 'Open'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {list.length === 0 && (
                                    <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                                        No Paint Issues. Click New to record one.
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
                                <label>Issue Date *
                                    <input className="field" type="date" value={form.IssueDate}
                                        onChange={e => patch('IssueDate', e.target.value)} />
                                </label>
                                <label className="span-2">Job Card *
                                    <SearchableSelect value={form.JobCardID}
                                        onChange={v => patch('JobCardID', v)}
                                        options={id ? [{ id: form.JobCardID, label: form.JobCardNo, sub: form.VehicleRegNo || '' }] : jobOpts}
                                        placeholder="Select eligible JC…"
                                        title="Pick eligible Job Card"
                                        disabled={!!id} />
                                </label>
                                <label>Warehouse *
                                    <SearchableSelect value={form.PaintWHID} onChange={v => patch('PaintWHID', v)}
                                        options={whOpts} placeholder="Select warehouse…" title="Pick warehouse" />
                                </label>
                                <label className="span-2">Remarks
                                    <input className="field" value={form.Remarks || ''}
                                        onChange={e => patch('Remarks', e.target.value)} placeholder="Optional" />
                                </label>
                            </div>
                        </fieldset>
                    </div>

                    {!id && jobs.length === 0 && (
                        <div className="erp-alert warning" style={{ padding: '6px 10px', fontSize: 12 }}>
                            <AlertTriangle size={13} /> No eligible Job Cards. Check <a href="/paint/settings">Paint Settings</a>.
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
                                        <th className="num" style={{ width: 90 }}>On Hand</th>
                                        <th className="num" style={{ width: 100 }}>Unit Cost</th>
                                        <th className="num" style={{ width: 90 }}>Qty *</th>
                                        <th className="num" style={{ width: 110 }}>Line Total</th>
                                        <th style={{ width: 30 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linesWithCalc.map((l, idx) => (
                                        <tr key={idx} className={l._overStock ? 'is-warn' : ''}>
                                            <td>{idx + 1}</td>
                                            <td style={{ minWidth: 220 }}>
                                                <SearchableSelect value={l.PaintItemID}
                                                    onChange={v => {
                                                        const it = items.find(x => x.PaintItemID === Number(v));
                                                        patchLine(idx, { PaintItemID: v, PaintUOMID: it?.PaintUOMID || l.PaintUOMID || '' });
                                                    }}
                                                    options={itemOpts}
                                                    placeholder="Pick paint…"
                                                    title="Pick paint item" />
                                            </td>
                                            <td>
                                                <SearchableSelect value={l.PaintUOMID || ''}
                                                    onChange={v => patchLine(idx, { PaintUOMID: v })}
                                                    options={uomOpts} placeholder="UOM" title="Pick UOM" />
                                            </td>
                                            <td className="num">{l._stock == null ? '—' : fmt(l._stock)}</td>
                                            <td className="num">{fmt(l._previewCost)}</td>
                                            <td className="num">
                                                <input type="number" step="0.0001" min={0} value={l.Quantity}
                                                    onChange={e => patchLine(idx, { Quantity: e.target.value })} />
                                            </td>
                                            <td className="num"><strong>{fmt(l._lineTotal)}</strong></td>
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
                                        <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                                            No lines. Click Add Line to start.
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {linesWithCalc.some(l => l._overStock) && (
                        <div className="erp-alert error" style={{ padding: '6px 10px', fontSize: 12 }}>
                            <AlertTriangle size={13} /> One or more lines exceed on-hand stock. Save will be rejected.
                        </div>
                    )}

                    <div className="paint-totals">
                        <div className="t"><span className="lbl">Lines</span><span className="val">{linesWithCalc.length}</span></div>
                        <div className="t emph"><span className="lbl">Total Cost</span><span className="val">{fmt(totalCost)}</span></div>
                    </div>
                </>
            )}
        </div>
    );
}
