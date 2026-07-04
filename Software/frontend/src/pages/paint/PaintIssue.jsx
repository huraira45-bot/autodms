/**
 * Paint Issue — internal paint drawn against a Job Card.
 *
 * Owner spec 2026-07-04: no draft state — stock is deducted immediately
 * on save. Each line pins IssueUnitCost from paint_Item.AvgCost so edits
 * and reverses use the same cost. The GL voucher (Dr Paint Consumption
 * / Cr Paint Inventory) is posted when the linked Job Card finalizes.
 *
 * Editing an Issue is a full-replace: server restores prior stock at
 * pinned cost, then re-issues at current AvgCost. Once the JC finalizes
 * the row locks and this screen renders it read-only.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, Save, Trash2, Printer, X, Search, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { ErpControlPanel, ErpStatusPill, ErpEmptyState, ErpField } from '../../components/erp';
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

    const [id, setId]     = useState(null);
    const [form, setForm] = useState(null);
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
            } catch (e) {
                notify({ type: 'error', title: 'Setup load failed', message: e.response?.data?.error || e.message });
            }
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
            Remarks: '',
            Locked: 0,
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
        } catch (e) {
            notify({ type: 'error', title: 'Could not open', message: e.response?.data?.error || e.message });
        }
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
    const addLine = () => { setForm(f => ({ ...f, Lines: [...f.Lines, blankLine()] })); setDirty(true); };
    const removeLine = (idx) => { setForm(f => ({ ...f, Lines: f.Lines.filter((_, i) => i !== idx) })); setDirty(true); };

    // Preview totals — for saved rows use the pinned IssueUnitCost;
    // for new/edited rows show the current AvgCost as a preview.
    const linesWithCalc = useMemo(() => (form?.Lines || []).map((l) => {
        const it = items.find(x => x.PaintItemID === Number(l.PaintItemID));
        const currentAvg = it ? Number(it.AvgCost) : 0;
        const pinned = l.IssueUnitCost != null ? Number(l.IssueUnitCost) : null;
        const previewCost = pinned != null ? pinned : currentAvg;
        const qty = Number(l.Quantity) || 0;
        return {
            ...l,
            _stock: it ? Number(it.StockQty) : null,
            _avgCost: currentAvg,
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
            } else {
                const r = await axios.post('/api/paint/issue', buildPayload());
                setId(r.data.PaintIssueID);
                notify({ type: 'success', title: 'Issue saved', message: 'Stock deducted.' });
                await openId(r.data.PaintIssueID);
                await reloadList();
                setSaving(false);
                return;
            }
            setDirty(false);
            await openId(id);
            await reloadList();
        } catch (e) {
            notify({ type: 'error', title: 'Could not save', message: e.response?.data?.error || e.message });
        } finally { setSaving(false); }
    };

    const remove = async () => {
        if (!(await confirm({
            title: 'Delete Paint Issue?',
            message: 'Stock will be restored at the pinned issue cost.',
            confirmLabel: 'Delete', tone: 'danger',
        }))) return;
        try {
            await axios.delete(`/api/paint/issue/${id}`);
            notify({ type: 'success', title: 'Deleted', message: 'Stock restored.' });
            setId(null); setForm(null); setDirty(false);
            await reloadList();
        } catch (e) {
            notify({ type: 'error', title: 'Delete failed', message: e.response?.data?.error || e.message });
        }
    };

    const printPage = () => id && window.open(`/paint/issue/${id}/print`, '_blank', 'noopener');

    // ── Picker options ──
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel title="Paint Issue"
                subtitle="Issue paint from stock against a Job Card. Deducts stock immediately; posts consumption voucher when the JC finalizes."
                actions={canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> New Issue</button>}
            >
                <div className="erp-search-input">
                    <Search size={14} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Issue #, JC #…" />
                    {search && <X size={14} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                </div>
                <select value={lockedFilter} onChange={e => setLockedFilter(e.target.value)} className="erp-input">
                    <option value="">All statuses</option>
                    <option value="0">Open (editable)</option>
                    <option value="1">Locked (JC finalized)</option>
                </select>
            </ErpControlPanel>

            <div style={{ display: 'grid', gridTemplateColumns: form ? 'minmax(280px, 340px) 1fr' : '1fr', gap: 10 }}>
                <div className="erp-panel" style={{ padding: 0, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                <th style={th}>Issue #</th>
                                <th style={th}>Date</th>
                                {!form && <th style={th}>Job Card</th>}
                                <th style={{ ...th, textAlign: 'right' }}>Total Cost</th>
                                <th style={th}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(row => (
                                <tr key={row.PaintIssueID}
                                    onClick={() => openId(row.PaintIssueID)}
                                    style={{
                                        cursor: 'pointer',
                                        background: row.PaintIssueID === id ? 'var(--erp-brand-soft)' : 'transparent',
                                        borderTop: '1px solid #e5e7eb',
                                    }}>
                                    <td style={td}><strong>{row.IssueNo}</strong></td>
                                    <td style={td}>{(row.IssueDate || '').slice(0, 10)}</td>
                                    {!form && <td style={td}>{row.JobCardNo}</td>}
                                    <td style={{ ...td, textAlign: 'right' }}>{fmt(row.TotalCost)}</td>
                                    <td style={td}>
                                        {row.Locked
                                            ? <ErpStatusPill tone="success">Locked</ErpStatusPill>
                                            : <ErpStatusPill tone="muted">Open</ErpStatusPill>}
                                    </td>
                                </tr>
                            ))}
                            {list.length === 0 && (
                                <tr><td colSpan={form ? 4 : 5}>
                                    <ErpEmptyState title="No Paint Issues" message="Draw paint from stock against an open Job Card." />
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {form && (
                    <div className="erp-panel" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ fontSize: 15, fontWeight: 600 }}>{id ? (form.IssueNo || `Issue #${id}`) : 'New Paint Issue'}</div>
                                {form.Locked
                                    ? <ErpStatusPill tone="success">Locked</ErpStatusPill>
                                    : <ErpStatusPill tone="muted">Open</ErpStatusPill>}
                                {form.JobCardNo && <span style={{ fontSize: 12, color: '#64748b' }}>· JC {form.JobCardNo}</span>}
                                {isReadOnly && <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> Read-only</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {!isReadOnly && canEdit && (
                                    <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}><Save size={14} /> Save</button>
                                )}
                                {id && <button className="btn" onClick={printPage}><Printer size={14} /> Print</button>}
                                {!isReadOnly && id && canEdit && (
                                    <button className="btn btn-danger" onClick={remove} disabled={saving}><Trash2 size={14} /> Delete</button>
                                )}
                                <button className="btn" onClick={closeForm}><X size={14} /> Close</button>
                            </div>
                        </div>

                        <fieldset disabled={isReadOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 10 }}>
                                <ErpField label="Issue Date *">
                                    <input type="date" value={form.IssueDate} onChange={e => patch('IssueDate', e.target.value)} />
                                </ErpField>
                                <ErpField label="Job Card *">
                                    <SearchableSelect
                                        value={form.JobCardID}
                                        onChange={v => patch('JobCardID', v)}
                                        options={id ? [{ id: form.JobCardID, label: form.JobCardNo, sub: form.VehicleRegNo || '' }] : jobOpts}
                                        placeholder="Select JC…"
                                        title="Pick eligible Job Card"
                                        disabled={!!id}
                                    />
                                </ErpField>
                                <ErpField label="Warehouse *">
                                    <SearchableSelect value={form.PaintWHID} onChange={v => patch('PaintWHID', v)}
                                        options={whOpts} placeholder="Select warehouse…" title="Pick warehouse" />
                                </ErpField>
                                <ErpField label="Remarks">
                                    <input value={form.Remarks || ''} onChange={e => patch('Remarks', e.target.value)} placeholder="Optional" />
                                </ErpField>
                            </div>

                            {!id && jobs.length === 0 && (
                                <div className="erp-alert warning" style={{ marginTop: 4 }}>
                                    <AlertTriangle size={14} /> No eligible Job Cards. Open <a href="/paint/settings">Paint Settings</a> and confirm the allowed business types; or ensure at least one JC of an allowed type is open.
                                </div>
                            )}

                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                            <th style={{ ...th2, textAlign: 'right' }}>On Hand</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Unit Cost{form.Locked ? '' : ' (current avg)'}</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Qty *</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Line Total</th>
                                            <th style={th2}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {linesWithCalc.map((l, idx) => (
                                            <tr key={idx} style={{ borderTop: '1px solid #e5e7eb', background: l._overStock ? '#fef2f2' : 'transparent' }}>
                                                <td style={td2}>{idx + 1}</td>
                                                <td style={{ ...td2, minWidth: 220 }}>
                                                    <SearchableSelect
                                                        value={l.PaintItemID}
                                                        onChange={v => {
                                                            const it = items.find(x => x.PaintItemID === Number(v));
                                                            patchLine(idx, { PaintItemID: v, PaintUOMID: it?.PaintUOMID || l.PaintUOMID || '' });
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
                                                <td style={{ ...td2, textAlign: 'right' }}>{l._stock == null ? '—' : fmt(l._stock)}</td>
                                                <td style={{ ...td2, textAlign: 'right' }}>{fmt(l._previewCost)}</td>
                                                <td style={td2}>
                                                    <input type="number" step="0.0001" min={0} value={l.Quantity}
                                                        onChange={e => patchLine(idx, { Quantity: e.target.value })}
                                                        style={{ width: '100%', textAlign: 'right' }} />
                                                </td>
                                                <td style={{ ...td2, textAlign: 'right', fontWeight: 600 }}>{fmt(l._lineTotal)}</td>
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
                                            <tr><td colSpan={8} style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>
                                                No lines. Click "Add Line" to start.
                                            </td></tr>
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', fontWeight: 600 }}>
                                            <td style={td2} colSpan={6}>Total Cost</td>
                                            <td style={{ ...td2, textAlign: 'right' }}>{fmt(totalCost)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {linesWithCalc.some(l => l._overStock) && (
                                <div className="erp-alert error" style={{ marginTop: 8 }}>
                                    <AlertTriangle size={14} /> One or more lines exceed on-hand stock. Save will be rejected.
                                </div>
                            )}
                        </fieldset>
                    </div>
                )}
            </div>
        </div>
    );
}

const th  = { padding: '6px 8px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#64748b' };
const td  = { padding: '6px 8px', fontSize: 12 };
const th2 = { padding: '4px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#64748b', whiteSpace: 'nowrap' };
const td2 = { padding: '4px 6px', fontSize: 12 };
