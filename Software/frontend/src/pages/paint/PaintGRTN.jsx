/**
 * Paint GRTN — return paint to supplier. Owner ask 2026-07-04.
 *
 * Every GRTN references EXACTLY ONE Paint GRN. Lines can only be picked
 * from that GRN's remaining returnable qty (Quantity − ReturnedQty −
 * other-draft reservations). The unit cost is fixed to the source line's
 * LandedUnitCost so the moving-avg reversal is deterministic.
 *
 * UX:
 *  - Pick supplier → dropdown of eligible Posted Paint GRNs from that supplier
 *  - Pick a source GRN → shows its remaining lines with a "return this many"
 *    input on each; qty capped by Remaining server-side too.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, Save, Check, Trash2, Printer, X, Search, AlertTriangle, RefreshCcw, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { ErpControlPanel, ErpStatusPill, ErpEmptyState, ErpField } from '../../components/erp';
import SearchableSelect from '../../components/SearchableSelect';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export default function PaintGRTN() {
    const { hasModule } = useAuth();
    const { notify, confirm } = useFeedback();
    const canUnfinalize = hasModule('admin_unfinalize');
    const canEdit       = hasModule('paint_lab_grtn');

    const [list, setList]             = useState([]);
    const [search, setSearch]         = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [parties, setParties]       = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    const [id, setId]                     = useState(null);
    const [form, setForm]                 = useState(null);
    const [sourceOptions, setSourceOpts]  = useState([]);
    const [sourceLines, setSourceLines]   = useState([]);   // eligible lines from picked GRN
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
            } catch (e) {
                notify({ type: 'error', title: 'Setup load failed', message: e.response?.data?.error || e.message });
            }
            reloadList();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { reloadList().catch(() => {}); /* eslint-disable-next-line */ }, [search, statusFilter]);

    // Reload the source-GRN list when supplier changes on the current form.
    useEffect(() => {
        (async () => {
            if (!form?.PartyID) { setSourceOpts([]); return; }
            try {
                const r = await axios.get('/api/paint/grtn/sources', { params: { partyId: form.PartyID } });
                setSourceOpts(r.data || []);
            } catch { setSourceOpts([]); }
        })();
    }, [form?.PartyID]);

    // Reload the source-GRN lines when source GRN changes (or when opening).
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
            PartyID: '',
            SourcePaintGRNID: '',
            PaintWHID: warehouses[0]?.PaintWHID || '',
            Remarks: '',
            Status: 'Draft',
            Lines: [], // populated by row-return-qty inputs on the source-lines table
        });
        setDirty(false);
    };

    const openId = async (rowId) => {
        try {
            const r = await axios.get(`/api/paint/grtn/${rowId}`);
            const data = r.data;
            setId(data.PaintGRTNID);
            setForm({
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

    // ── Line qty mutator (keyed by SourceGRNDetailID) ──
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

    // Merge source lines with the qty currently entered, for the table.
    const rows = useMemo(() => sourceLines.map(sl => {
        const qty = round4(Number(getQty(sl.PaintGRNDetailID)) || 0);
        const cap = round4(Number(sl.Remaining || 0));
        return {
            ...sl,
            _qty: qty,
            _cap: cap,
            _overflow: qty - cap > 0.0001,
            _lineTotal: round2(qty * Number(sl.LandedUnitCost)),
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [sourceLines, form?.Lines]);

    const totals = useMemo(() => rows.reduce((a, r) => ({
        qty:  a.qty  + r._qty,
        line: a.line + r._lineTotal,
    }), { qty: 0, line: 0 }), [rows]);

    const isReadOnly = form && form.Status !== 'Draft';

    const patch = (k, v) => {
        setForm(f => {
            const next = { ...f, [k]: v };
            // Clearing supplier/source resets Lines to avoid stale mappings.
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
            }
            setDirty(false);
            await reloadList();
        } catch (e) {
            notify({ type: 'error', title: 'Could not save', message: e.response?.data?.error || e.message });
        } finally { setSaving(false); }
    };

    const finalize = async () => {
        if (dirty) {
            if (!(await confirm({ title: 'Save + Finalize?', message: 'Save changes and finalize?', confirmLabel: 'Save + Finalize' }))) return;
            await saveDraft();
        } else if (!(await confirm({
            title: 'Finalize Paint GRTN?',
            message: 'Reduces stock at each line\'s original landed cost, bumps ReturnedQty on the source GRN, and posts a GL voucher.',
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
            message: 'Reverses the GL voucher and restores stock at the original unit cost. Source GRN\'s ReturnedQty is freed.',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel title="Paint GRTN"
                subtitle="Return paint to supplier — each GRTN references one Paint GRN and rolls back the stock at that GRN's original cost."
                actions={canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> New GRTN</button>}
            >
                <div className="erp-search-input">
                    <Search size={14} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="GRTN #, Supplier, Source GRN…" />
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
                                <th style={th}>GRTN #</th>
                                <th style={th}>Date</th>
                                {!form && <th style={th}>Supplier</th>}
                                {!form && <th style={th}>Source GRN</th>}
                                <th style={{ ...th, textAlign: 'right' }}>Grand Total</th>
                                <th style={th}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(row => (
                                <tr key={row.PaintGRTNID}
                                    onClick={() => openId(row.PaintGRTNID)}
                                    style={{
                                        cursor: 'pointer',
                                        background: row.PaintGRTNID === id ? 'var(--erp-brand-soft)' : 'transparent',
                                        borderTop: '1px solid #e5e7eb',
                                    }}>
                                    <td style={td}><strong>{row.GRTNNo}</strong></td>
                                    <td style={td}>{(row.GRTNDate || '').slice(0, 10)}</td>
                                    {!form && <td style={td}>{row.PartyName}</td>}
                                    {!form && <td style={td}>{row.SourceGRNNo || '—'}</td>}
                                    <td style={{ ...td, textAlign: 'right' }}>{fmt(row.GrandTotal)}</td>
                                    <td style={td}>
                                        <StatusPill status={row.Status} />
                                    </td>
                                </tr>
                            ))}
                            {list.length === 0 && (
                                <tr><td colSpan={form ? 4 : 6}>
                                    <ErpEmptyState title="No Paint GRTNs" message="Return paint to a supplier against a specific paid Paint GRN." />
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
                                <div style={{ fontSize: 15, fontWeight: 600 }}>{id ? (form.GRTNNo || `GRTN #${id}`) : 'New Paint GRTN'}</div>
                                <StatusPill status={form.Status} />
                                {form.VoucherNo && <span style={{ fontSize: 12, color: '#64748b' }}>· Voucher {form.VoucherNo}</span>}
                                {isReadOnly && <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> Read-only</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {!isReadOnly && canEdit && <button className="btn btn-primary" onClick={saveDraft} disabled={saving || !dirty}><Save size={14} /> Save</button>}
                                {form.Status === 'Draft' && id && canEdit && <button className="btn btn-primary" onClick={finalize} disabled={saving}><Check size={14} /> Finalize</button>}
                                {form.Status === 'Posted' && canUnfinalize && <button className="btn btn-secondary" onClick={unfinalize} disabled={saving}><RefreshCcw size={14} /> Unfinalize</button>}
                                {id && <button className="btn" onClick={printPage}><Printer size={14} /> Print</button>}
                                {form.Status === 'Draft' && id && canEdit && <button className="btn btn-danger" onClick={remove} disabled={saving}><Trash2 size={14} /> Delete</button>}
                                <button className="btn" onClick={closeForm}><X size={14} /> Close</button>
                            </div>
                        </div>

                        <fieldset disabled={isReadOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 10 }}>
                                <ErpField label="GRTN Date *">
                                    <input type="date" value={form.GRTNDate} onChange={e => patch('GRTNDate', e.target.value)} />
                                </ErpField>
                                <ErpField label="Supplier *">
                                    <SearchableSelect value={form.PartyID} onChange={v => patch('PartyID', v)}
                                        options={partyOpts} placeholder="Select supplier…" title="Pick supplier" />
                                </ErpField>
                                <ErpField label="Source Paint GRN *">
                                    <SearchableSelect value={form.SourcePaintGRNID} onChange={v => patch('SourcePaintGRNID', v)}
                                        options={grnOpts}
                                        placeholder={form.PartyID ? 'Select source GRN…' : 'Pick supplier first'}
                                        title="Pick source Paint GRN"
                                        disabled={!form.PartyID} />
                                </ErpField>
                                <ErpField label="Warehouse *">
                                    <SearchableSelect value={form.PaintWHID} onChange={v => patch('PaintWHID', v)}
                                        options={whOpts} placeholder="Select warehouse…" title="Pick warehouse" />
                                </ErpField>
                            </div>
                            <ErpField label="Remarks">
                                <input value={form.Remarks || ''} onChange={e => { setForm(f => ({ ...f, Remarks: e.target.value })); setDirty(true); }} placeholder="Optional" />
                            </ErpField>

                            {form.PartyID && sourceOptions.length === 0 && (
                                <div className="erp-alert warning" style={{ marginTop: 8 }}>
                                    <AlertTriangle size={14} /> No returnable Paint GRNs found for this supplier. Every line on their prior GRNs may already be fully returned.
                                </div>
                            )}

                            <div style={{ marginTop: 12, fontWeight: 600 }}>Returnable Lines</div>
                            <div style={{ overflowX: 'auto', marginTop: 4 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={th2}>#</th>
                                            <th style={th2}>Code</th>
                                            <th style={th2}>Paint Name</th>
                                            <th style={th2}>UOM</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Src Qty</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Already Ret.</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Remaining</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Unit Cost</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Return Qty</th>
                                            <th style={{ ...th2, textAlign: 'right' }}>Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r, i) => (
                                            <tr key={r.PaintGRNDetailID} style={{ borderTop: '1px solid #e5e7eb', background: r._overflow ? '#fef2f2' : 'transparent' }}>
                                                <td style={td2}>{i + 1}</td>
                                                <td style={{ ...td2, fontFamily: 'monospace', fontSize: 11 }}>{r.PaintCode}</td>
                                                <td style={td2}>{r.PaintName}</td>
                                                <td style={td2}>{r.UOMName}</td>
                                                <td style={{ ...td2, textAlign: 'right' }}>{fmt(r.Quantity)}</td>
                                                <td style={{ ...td2, textAlign: 'right' }}>{fmt(r.ReturnedQty)}</td>
                                                <td style={{ ...td2, textAlign: 'right', fontWeight: 600 }}>{fmt(r._cap)}</td>
                                                <td style={{ ...td2, textAlign: 'right' }}>{fmt(r.LandedUnitCost)}</td>
                                                <td style={{ ...td2, textAlign: 'right' }}>
                                                    <input type="number" step="0.0001" min={0} max={r._cap}
                                                        value={getQty(r.PaintGRNDetailID)}
                                                        onChange={e => setQty(r.PaintGRNDetailID, e.target.value)}
                                                        style={{ width: 100, textAlign: 'right' }}
                                                        placeholder="0" />
                                                </td>
                                                <td style={{ ...td2, textAlign: 'right', fontWeight: 600 }}>{fmt(r._lineTotal)}</td>
                                            </tr>
                                        ))}
                                        {rows.length === 0 && (
                                            <tr><td colSpan={10} style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>
                                                {form.SourcePaintGRNID ? 'This GRN has nothing left to return.' : 'Pick a source Paint GRN to see returnable lines.'}
                                            </td></tr>
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', fontWeight: 600 }}>
                                            <td style={td2} colSpan={8}>Totals</td>
                                            <td style={{ ...td2, textAlign: 'right' }}>{fmt(totals.qty)}</td>
                                            <td style={{ ...td2, textAlign: 'right' }}>{fmt(totals.line)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {rows.some(r => r._overflow) && (
                                <div className="erp-alert error" style={{ marginTop: 8 }}>
                                    <AlertTriangle size={14} /> One or more return quantities exceed the source line's remaining. Fix them before saving.
                                </div>
                            )}

                            <div style={{ marginTop: 10, display: 'flex', gap: 24, justifyContent: 'flex-end', fontSize: 13 }}>
                                <div style={{ fontSize: 15 }}>Grand Total: <strong>{fmt(totals.line)}</strong></div>
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
const td2 = { padding: '4px 6px', fontSize: 12 };
