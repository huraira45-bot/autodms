import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PackageCheck, Search, Loader2, RefreshCw, Wifi, ExternalLink, XCircle } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { useServiceEvents } from '../tablet/useServiceEvents';
import { fmtDT } from '../utils/datetime';

const API = '/api/service-intake/requisitions';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n) => String(+Number(n || 0).toFixed(2));
const errText = (err) => err?.response?.data?.error || err?.message || 'Something went wrong.';

const STATUS = {
    'Pending':          { bg: '#fef9c3', fg: '#854d0e' },
    'Partially issued': { bg: '#dbeafe', fg: '#1e40af' },
    'Issued':           { bg: '#dcfce7', fg: '#166534' },
    'Cancelled':        { bg: '#fee2e2', fg: '#991b1b' },
};
const pill = (s) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
    background: (STATUS[s] || STATUS.Pending).bg, color: (STATUS[s] || STATUS.Pending).fg, whiteSpace: 'nowrap',
});

/**
 * Parts Counter — requisitions from the service tablet (plan 2026-09-14,
 * Phase 3).
 *
 * When a customer signs an estimate on the tablet, its parts arrive here. The
 * counter issues them in full or in part; each issue is a normal Parts Issue
 * slip on the job card (same stock check, GST and cost), so it also appears
 * on the Parts Issue screen, where it can still be edited or removed.
 */
export default function PartsRequisitions() {
    const { notify, confirm } = useFeedback();
    const [openOnly, setOpenOnly] = useState(true);
    const [search, setSearch] = useState('');
    const [list, setList] = useState(null);
    const [selId, setSelId] = useState(null);
    const [sel, setSel] = useState(null);
    const [qty, setQty] = useState({});
    const [busy, setBusy] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    const loadList = useCallback(async () => {
        try {
            const { data } = await axios.get(API, { params: { status: openOnly ? 'open' : 'all', search: search.trim() || undefined } });
            setList(data);
        } catch (err) {
            setList([]);
            notify({ type: 'error', title: 'Could not load requisitions', message: errText(err) });
        }
    }, [openOnly, search, notify]);

    // Quantities are only reset on a deliberate reload, so a background
    // refresh never wipes what the counter has typed.
    const loadSel = useCallback(async (id, resetQty) => {
        if (!id) { setSel(null); return; }
        try {
            const { data } = await axios.get(`${API}/${id}`);
            setSel(data);
            setQty(prev => {
                const next = {};
                for (const l of data.Lines) {
                    const suggested = Math.max(0, Math.min(l.Remaining, l.OnHand));
                    next[l.RequisitionLineID] = !resetQty && prev[l.RequisitionLineID] !== undefined
                        ? prev[l.RequisitionLineID]
                        : qtyText(suggested);
                }
                return next;
            });
        } catch (err) {
            notify({ type: 'error', title: 'Could not load the requisition', message: errText(err) });
        }
    }, [notify]);

    useEffect(() => {
        const t = setTimeout(loadList, 300);
        return () => clearTimeout(t);
    }, [loadList]);

    useEffect(() => {
        const t = setInterval(() => { loadList(); if (selId) loadSel(selId, false); }, 15000);
        return () => clearInterval(t);
    }, [loadList, loadSel, selId]);

    const live = useServiceEvents(localStorage.getItem('dms_token'), {
        'requisitions:changed': () => { loadList(); if (selId) loadSel(selId, false); },
    });

    const select = (id) => {
        setSelId(id);
        setCancelReason('');
        loadSel(id, true);
    };

    const issue = async () => {
        const lines = sel.Lines
            .map(l => ({ line: l, Quantity: Number(qty[l.RequisitionLineID]) || 0 }))
            .filter(x => x.Quantity > 0);
        if (!lines.length) {
            notify({ type: 'warning', title: 'Nothing to issue', message: 'Enter a quantity for at least one part.' });
            return;
        }
        const over = lines.find(x => x.Quantity > x.line.Remaining);
        if (over) {
            notify({ type: 'warning', title: 'Too many', message: `${over.line.Description}: only ${qtyText(over.line.Remaining)} left to issue.` });
            return;
        }
        const ok = await confirm({
            title: `Issue parts to ${sel.JobCardNo}?`,
            message: lines.map(x => `${qtyText(x.Quantity)} × ${x.line.Description}`).join(', ')
                   + '. Stock is taken out now and the parts are added to the job card.',
            confirmLabel: 'Issue parts',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`${API}/${sel.RequisitionID}/issue`, {
                Lines: lines.map(x => ({ RequisitionLineID: x.line.RequisitionLineID, Quantity: x.Quantity })),
            });
            notify({ type: 'success', title: 'Parts issued', message: `Issue slip saved on ${sel.JobCardNo}.` });
            setSel(data.requisition);
            await loadSel(sel.RequisitionID, true);
            loadList();
        } catch (err) {
            notify({ type: 'error', title: 'Could not issue', message: errText(err) });
        } finally {
            setBusy(false);
        }
    };

    const cancel = async () => {
        if (!cancelReason.trim()) {
            notify({ type: 'warning', title: 'Reason needed', message: 'Say why the rest of this requisition is being cancelled.' });
            return;
        }
        const ok = await confirm({
            title: `Cancel ${sel.RequisitionNo}?`,
            message: 'Parts not yet issued will no longer be requested. Parts already issued stay on the job card.',
            confirmLabel: 'Cancel requisition',
            tone: 'danger',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`${API}/${sel.RequisitionID}/cancel`, { Reason: cancelReason.trim() });
            setSel(data);
            setCancelReason('');
            loadList();
        } catch (err) {
            notify({ type: 'error', title: 'Could not cancel', message: errText(err) });
        } finally {
            setBusy(false);
        }
    };

    const canIssue = sel && sel.Status === 'Open' && !sel.JobCardFinalized && sel.Lines.some(l => l.Remaining > 0);

    return (
        <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <PackageCheck size={24} color="#714b67" />
                <h2 style={{ margin: 0, fontSize: 20 }}>Parts Counter — Tablet Requisitions</h2>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: live ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Wifi size={14} /> {live ? 'Live' : 'Refreshing every 15 s'}
                </span>
                <button type="button" className="btn btn-secondary" onClick={() => { loadList(); if (selId) loadSel(selId, false); }}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 16, alignItems: 'start' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                            <Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: '#94a3b8' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="PR no, job card, registration, customer"
                                   style={{ width: '100%', boxSizing: 'border-box', padding: '7px 8px 7px 28px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                        </div>
                        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} /> Waiting to be issued only
                        </label>
                    </div>
                    {list === null && <div style={{ padding: 16 }}><Loader2 className="animate-spin" size={18} /></div>}
                    {list && !list.length && <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>Nothing waiting at the counter.</div>}
                    {list?.map(r => (
                        <button key={r.RequisitionID} type="button" onClick={() => select(r.RequisitionID)}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none',
                                    borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                                    background: selId === r.RequisitionID ? '#f5eef3' : '#fff',
                                }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <strong style={{ fontSize: 13 }}>{r.RequisitionNo}</strong>
                                <span style={pill(r.DisplayStatus)}>{r.DisplayStatus}</span>
                                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>{fmtDT(r.RequestedAt)}</span>
                            </div>
                            <div style={{ fontSize: 13, marginTop: 3 }}>
                                {r.JobCardNo} · <strong>{r.VehicleRegNo}</strong>{r.BayName ? ` · ${r.BayName}` : ''}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                {r.CustomerName} · {r.LineCount} part{r.LineCount === 1 ? '' : 's'} · issued {qtyText(r.QtyIssued)} of {qtyText(r.QtyRequested)}
                            </div>
                        </button>
                    ))}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, minHeight: 200 }}>
                    {!sel && <div style={{ color: '#94a3b8', fontSize: 14 }}>Select a requisition on the left.</div>}
                    {sel && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <h3 style={{ margin: 0 }}>{sel.RequisitionNo}</h3>
                                <span style={pill(sel.DisplayStatus)}>{sel.DisplayStatus}</span>
                                <Link to={`/parts-issue?jobCardId=${sel.JobCardID}`} style={{ marginLeft: 'auto', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    Open {sel.JobCardNo} in Parts Issue <ExternalLink size={13} />
                                </Link>
                            </div>
                            <div style={{ fontSize: 13, color: '#475569', margin: '6px 0 14px', lineHeight: 1.6 }}>
                                Job card <strong>{sel.JobCardNo}</strong> · {sel.VehicleRegNo} {sel.VehicleModel ? `(${sel.VehicleModel})` : ''} · {sel.CustomerName}
                                <br />Requested by {sel.RequestedByName} on {fmtDT(sel.RequestedAt)}
                                {sel.BayName ? ` · ${sel.BayName}` : ''}{sel.EstimateNo ? ` · from ${sel.EstimateNo}` : ''}
                                {sel.Status === 'Cancelled' && <><br />Cancelled by {sel.CancelledByName} on {fmtDT(sel.CancelledAt)}: {sel.CancelReason}</>}
                            </div>

                            {!!sel.JobCardFinalized && (
                                <div style={{ padding: 10, borderRadius: 6, background: '#fef2f2', color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
                                    {sel.JobCardNo} is finalized, so no more parts can be issued to it.
                                </div>
                            )}

                            <div style={{ overflowX: 'auto' }}>
                                <table className="erp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                            <th style={{ padding: 6 }}>Part no</th>
                                            <th style={{ padding: 6 }}>Description</th>
                                            <th style={{ padding: 6, textAlign: 'right' }}>Rate</th>
                                            <th style={{ padding: 6, textAlign: 'right' }}>Requested</th>
                                            <th style={{ padding: 6, textAlign: 'right' }}>Issued</th>
                                            <th style={{ padding: 6, textAlign: 'right' }}>Remaining</th>
                                            <th style={{ padding: 6, textAlign: 'right' }}>On hand</th>
                                            <th style={{ padding: 6, textAlign: 'right' }}>Issue now</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sel.Lines.map(l => {
                                            const short = l.OnHand < l.Remaining;
                                            return (
                                                <tr key={l.RequisitionLineID} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: 6, fontFamily: 'monospace' }}>{l.PartNumber || '—'}</td>
                                                    <td style={{ padding: 6 }}>{l.Description}</td>
                                                    <td style={{ padding: 6, textAlign: 'right' }}>{fmt(l.Rate)}</td>
                                                    <td style={{ padding: 6, textAlign: 'right' }}>{qtyText(l.QtyRequested)}</td>
                                                    <td style={{ padding: 6, textAlign: 'right' }}>{qtyText(l.QtyIssued)}</td>
                                                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{qtyText(l.Remaining)}</td>
                                                    <td style={{ padding: 6, textAlign: 'right', color: short && l.Remaining > 0 ? '#b45309' : undefined, fontWeight: short && l.Remaining > 0 ? 700 : 400 }}>
                                                        {qtyText(l.OnHand)}
                                                    </td>
                                                    <td style={{ padding: 6, textAlign: 'right' }}>
                                                        {canIssue && l.Remaining > 0 ? (
                                                            <input value={qty[l.RequisitionLineID] ?? ''} inputMode="decimal"
                                                                   onChange={e => setQty(q => ({ ...q, [l.RequisitionLineID]: e.target.value.replace(/[^\d.]/g, '') }))}
                                                                   style={{ width: 70, textAlign: 'right', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {canIssue && (
                                <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button type="button" className="btn btn-primary" onClick={issue} disabled={busy}>
                                        {busy ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} Issue parts
                                    </button>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        Issued at the price the customer signed for, with GST. A quantity below what remains is a part issue.
                                    </span>
                                </div>
                            )}

                            {sel.Issues.length > 0 && (
                                <div style={{ marginTop: 18 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>ISSUED SO FAR</div>
                                    {sel.Issues.map(i => {
                                        const line = sel.Lines.find(l => l.RequisitionLineID === i.RequisitionLineID);
                                        return (
                                            <div key={`${i.RequisitionLineID}-${i.StockIssueDetailID}`} style={{ fontSize: 13, padding: '3px 0', color: i.RemovedOnPartsIssue ? '#94a3b8' : undefined }}>
                                                {fmtDT(i.IssuedAt)} · {qtyText(i.QtyAtIssue)} × {line?.Description} · {i.IssuedByName}
                                                {i.IssueNo ? ` · slip #${i.IssueNo}` : ''}
                                                {i.RemovedOnPartsIssue ? ' · removed on Parts Issue' : Number(i.QtyNow) !== Number(i.QtyAtIssue) ? ` · changed to ${qtyText(i.QtyNow)} on Parts Issue` : ''}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {sel.Status === 'Open' && sel.Lines.some(l => l.Remaining > 0) && (
                                <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px dashed #e2e8f0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} maxLength={300}
                                           placeholder="Reason, e.g. customer declined part / not available"
                                           style={{ flex: 1, minWidth: 240, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                                    <button type="button" className="btn btn-secondary" onClick={cancel} disabled={busy} style={{ color: '#b91c1c' }}>
                                        <XCircle size={14} /> Cancel the rest
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
