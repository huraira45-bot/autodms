/**
 * Sales — Negotiation Queue.
 *
 * For sales_admin_pricing role. Approve or reject discount proposals with comments.
 * Approving snapshots NegotiatedPrice onto the booking + advances state.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle2, XCircle, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

export default function NegotiationQueue() {
    const { hasModule } = useAuth();
    const canApprove = hasModule('sales_admin_pricing');

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('Pending');
    const [actionItem, setActionItem] = useState(null);
    const [actionMode, setActionMode] = useState(null); // 'approve' | 'reject'
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/sales/negotiations`, { params: statusFilter ? { status: statusFilter } : {} });
            setRows(r.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [statusFilter]);
    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Discount Approval Queue</h1>
                    <p className="page-subtitle">Every discount on every booking requires approval (decision #14, zero threshold).</p>
                </div>
                <button className="btn-sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            </div>

            {msg && <FlashMsg msg={msg} />}

            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Withdrawn">Withdrawn</option>
                </select>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} requests</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                        <AlertTriangle size={28} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : statusFilter === 'Pending' ? 'No pending discount requests — sales floor is happy.' : 'No matches.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Proposed</Th><Th>Booking #</Th><Th>Customer</Th><Th>Variant</Th>
                                <Th align="right">Standard</Th><Th align="right">Proposed</Th>
                                <Th align="right">Discount</Th><Th>Reason</Th>
                                <Th>Proposer</Th><Th>Status</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(n => {
                                const colour = n.Status === 'Pending' ? '#92400e' : n.Status === 'Approved' ? '#15803d' : n.Status === 'Rejected' ? '#b91c1c' : '#64748b';
                                const bg     = n.Status === 'Pending' ? '#fef3c7' : n.Status === 'Approved' ? '#dcfce7' : n.Status === 'Rejected' ? '#fee2e2' : '#e2e8f0';
                                return (
                                    <tr key={n.RequestID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td style={{ fontSize: '0.75rem' }}>{new Date(n.ProposedAt).toLocaleString()}</Td>
                                        <Td mono color="#1e40af">{n.BookingNo}</Td>
                                        <Td>{n.PartyName}</Td>
                                        <Td><strong>{n.VariantCode}</strong><div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{n.VariantName}</div></Td>
                                        <Td align="right">{fmtN(n.StandardPrice)}</Td>
                                        <Td align="right" style={{ fontWeight: 600 }}>{fmtN(n.ProposedPrice)}</Td>
                                        <Td align="right" style={{ color: '#b91c1c', fontWeight: 600 }}>
                                            {fmtN(n.DiscountAmount)}
                                            <div style={{ fontSize: '0.7rem' }}>{Number(n.DiscountPct).toFixed(2)}%</div>
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem', maxWidth: 280 }}>{n.Reason}</Td>
                                        <Td style={{ fontSize: '0.78rem' }}>{n.ProposerName}</Td>
                                        <Td><Pill bg={bg} col={colour}>{n.Status}</Pill></Td>
                                        <Td>
                                            {n.Status === 'Pending' && canApprove && (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button className="btn-icon" onClick={() => { setActionItem(n); setActionMode('approve'); }} title="Approve" style={{ color: '#15803d' }}><CheckCircle2 size={14} /></button>
                                                    <button className="btn-icon" onClick={() => { setActionItem(n); setActionMode('reject'); }} title="Reject" style={{ color: '#b91c1c' }}><XCircle size={14} /></button>
                                                </div>
                                            )}
                                        </Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {actionItem && (
                <DecisionModal item={actionItem} mode={actionMode}
                    onClose={() => { setActionItem(null); setActionMode(null); }}
                    onDone={() => { setActionItem(null); setActionMode(null); flash('ok', actionMode === 'approve' ? 'Approved' : 'Rejected'); load(); }} />
            )}
        </div>
    );
}

function DecisionModal({ item, mode, onClose, onDone }) {
    const [comments, setComments] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const submit = async () => {
        if (mode === 'reject' && !comments.trim()) { setErr('Rejection reason is required.'); return; }
        setBusy(true); setErr(null);
        try {
            const path = mode === 'approve' ? 'approve' : 'reject';
            const body = mode === 'approve' ? { Comments: comments } : { Reason: comments.trim() };
            await axios.post(`${API}/sales/negotiations/${item.RequestID}/${path}`, body);
            onDone();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={`${mode === 'approve' ? 'Approve' : 'Reject'} discount on ${item.BookingNo}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>{item.PartyName} · {item.VariantName}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>Standard: <strong>PKR {fmtN(item.StandardPrice)}</strong> → Proposed: <strong>PKR {fmtN(item.ProposedPrice)}</strong></div>
                <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 600, marginTop: 4 }}>Discount: PKR {fmtN(item.DiscountAmount)} ({Number(item.DiscountPct).toFixed(2)}%)</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 6 }}><em>Proposer reason:</em> {item.Reason}</div>
            </div>
            <Field label={mode === 'approve' ? 'Comments (optional)' : 'Rejection reason *'}>
                <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)}
                    placeholder={mode === 'approve' ? 'Optional approver notes' : 'Why are you rejecting?'}
                    style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button className="btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding: '8px 16px', background: mode === 'approve' ? '#15803d' : '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                    {busy ? <Loader2 size={12} className="animate-spin" /> : mode === 'approve' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {' '}{mode === 'approve' ? 'Approve' : 'Reject'}
                </button>
            </div>
        </Shell>
    );
}
