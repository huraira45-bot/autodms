/**
 * Sales — Booking Cancellation Queue
 *
 * Drives the 3-stage cancellation finalization loop for confirmed bookings:
 *   Pending (Executive proposed) → AMApproved (AM signed off) → Executed (Admin executed refund + clawback)
 *   Side-states: AMRejected, Withdrawn
 *
 * Visibility:
 *   - Anyone in SALES_READERS sees the queue.
 *   - am_approve sees AM action buttons on Pending rows.
 *   - admin_unfinalize or sales_admin_settings sees Execute buttons on AMApproved rows.
 *   - The proposer sees a Withdraw button on their own Pending row.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Ban, RefreshCw, Loader2, CheckCircle2, XCircle, Undo2, ExternalLink, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

const STATUS_STYLE = {
    Pending:      { bg: '#fef3c7', col: '#92400e', label: 'Pending AM' },
    AMApproved:   { bg: '#dbeafe', col: '#1e40af', label: 'AM Approved — awaiting admin' },
    Executed:     { bg: '#dcfce7', col: '#15803d', label: 'Executed' },
    AMRejected:   { bg: '#fee2e2', col: '#b91c1c', label: 'AM Rejected' },
    Withdrawn:    { bg: '#e2e8f0', col: '#475569', label: 'Withdrawn' },
};

const TABS = [
    { key: 'open',     label: 'Open',         match: (s) => s === 'Pending' || s === 'AMApproved' },
    { key: 'Pending',  label: 'Pending AM',   match: (s) => s === 'Pending' },
    { key: 'AMApproved', label: 'Awaiting Admin', match: (s) => s === 'AMApproved' },
    { key: 'closed',   label: 'Closed',       match: (s) => ['Executed','AMRejected','Withdrawn'].includes(s) },
    { key: 'all',      label: 'All',          match: () => true },
];

export default function CancellationQueue() {
    const { user, hasModule } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState('open');
    const [msg, setMsg] = useState(null);
    const [actionRow, setActionRow] = useState(null);
    const [actionKind, setActionKind] = useState(null); // 'amApprove' | 'amReject' | 'execute' | 'withdraw'

    const canAM    = hasModule('am_approve');
    const canAdmin = hasModule('admin_unfinalize') || hasModule('sales_admin_settings');

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/sales/cancellations`);
            setRows(r.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const tabDef = TABS.find(t => t.key === tab) || TABS[0];
    const filtered = rows.filter(r => tabDef.match(r.Status));

    const counts = {
        Pending: rows.filter(r => r.Status === 'Pending').length,
        AMApproved: rows.filter(r => r.Status === 'AMApproved').length,
    };

    const openAction = (row, kind) => { setActionRow(row); setActionKind(kind); };
    const closeAction = () => { setActionRow(null); setActionKind(null); };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Cancellation Queue</h1>
                    <p className="page-subtitle">
                        3-stage cancellation loop for confirmed bookings: Executive proposes → AM approves → Admin executes (refund + accrual clawback).
                    </p>
                </div>
                <button className="btn-sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            </div>

            {msg && <FlashMsg msg={msg} />}

            {/* Summary banner */}
            {(counts.Pending > 0 || counts.AMApproved > 0) && (
                <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {counts.Pending > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fef3c7', borderRadius: 6, color: '#92400e', fontSize: '0.85rem' }}>
                            <AlertTriangle size={16} /> <strong>{counts.Pending}</strong> awaiting AM decision
                        </div>
                    )}
                    {counts.AMApproved > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#dbeafe', borderRadius: 6, color: '#1e40af', fontSize: '0.85rem' }}>
                            <AlertTriangle size={16} /> <strong>{counts.AMApproved}</strong> awaiting admin execution
                        </div>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div className="card" style={{ display: 'flex', gap: 4, padding: 6 }}>
                {TABS.map(t => {
                    const n = rows.filter(r => t.match(r.Status)).length;
                    return (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                background: tab === t.key ? '#1e40af' : 'transparent',
                                color:      tab === t.key ? 'white' : '#475569',
                                fontWeight: tab === t.key ? 600 : 500, fontSize: '0.85rem',
                            }}>
                            {t.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({n})</span>
                        </button>
                    );
                })}
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {filtered.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                        <Ban size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No cancellations in this view.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Booking</Th>
                                <Th>Customer / Vehicle</Th>
                                <Th align="right">Negotiated</Th>
                                <Th align="right">Paid</Th>
                                <Th>Proposed by</Th>
                                <Th>Reason</Th>
                                <Th>Status</Th>
                                <Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(r => {
                                const sty = STATUS_STYLE[r.Status] || STATUS_STYLE.Pending;
                                const isProposer = r.ProposerEmployeeID === user?.employeeId;
                                return (
                                    <tr key={r.CancellationID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td>
                                            <Link to={`/sales/bookings/${r.BookingID}`} style={{ color: '#1e40af', fontWeight: 600, textDecoration: 'none' }}>
                                                {r.BookingNo} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                            </Link>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Cancellation #{r.CancellationID}</div>
                                        </Td>
                                        <Td>
                                            <div style={{ fontWeight: 600 }}>{r.PartyName}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.ModelCode} {r.VariantName}</div>
                                        </Td>
                                        <Td align="right">{fmtN(r.NegotiatedPrice)}</Td>
                                        <Td align="right" style={{ color: r.AmountPaidToDate > 0 ? '#15803d' : '#94a3b8', fontWeight: 600 }}>
                                            {fmtN(r.AmountPaidToDate)}
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem' }}>
                                            <div>{r.ProposerName}</div>
                                            <div style={{ color: '#94a3b8' }}>{new Date(r.ProposedAt).toLocaleString()}</div>
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem', maxWidth: 280, color: '#475569' }}>
                                            <div>{r.ProposalReason}</div>
                                            {r.AMDecision && (
                                                <div style={{ marginTop: 4, padding: 4, background: r.AMDecision === 'Rejected' ? '#fef2f2' : '#f0fdf4', borderRadius: 4, fontSize: '0.72rem', color: r.AMDecision === 'Rejected' ? '#b91c1c' : '#15803d' }}>
                                                    <strong>{r.AMName} ({r.AMDecision}):</strong> {r.AMComments}
                                                </div>
                                            )}
                                            {r.AdminNotes && (
                                                <div style={{ marginTop: 4, padding: 4, background: '#eff6ff', borderRadius: 4, fontSize: '0.72rem', color: '#1e40af' }}>
                                                    <strong>{r.AdminName}:</strong> {r.AdminNotes}
                                                    {r.RefundAmount != null && <div>Refund: PKR {fmtN(r.RefundAmount)}</div>}
                                                </div>
                                            )}
                                        </Td>
                                        <Td><Pill bg={sty.bg} col={sty.col}>{sty.label}</Pill></Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {/* AM actions on Pending rows */}
                                                {r.Status === 'Pending' && canAM && (
                                                    <>
                                                        <button className="btn-sm" onClick={() => openAction(r, 'amApprove')} style={{ background: '#15803d', color: 'white', border: 'none' }} title="Approve cancellation">
                                                            <CheckCircle2 size={12} /> Approve
                                                        </button>
                                                        <button className="btn-sm" onClick={() => openAction(r, 'amReject')} style={{ background: '#b91c1c', color: 'white', border: 'none' }} title="Reject cancellation">
                                                            <XCircle size={12} /> Reject
                                                        </button>
                                                    </>
                                                )}
                                                {/* Proposer withdraws their own pending row */}
                                                {r.Status === 'Pending' && isProposer && (
                                                    <button className="btn-sm" onClick={() => openAction(r, 'withdraw')} title="Withdraw your proposal">
                                                        <Undo2 size={12} /> Withdraw
                                                    </button>
                                                )}
                                                {/* Admin executes on AMApproved rows */}
                                                {r.Status === 'AMApproved' && canAdmin && (
                                                    <button className="btn-sm" onClick={() => openAction(r, 'execute')} style={{ background: '#7c3aed', color: 'white', border: 'none' }} title="Execute — final cancel + refund">
                                                        <Ban size={12} /> Execute
                                                    </button>
                                                )}
                                            </div>
                                        </Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {actionRow && actionKind && (
                <ActionModal row={actionRow} kind={actionKind}
                    onClose={closeAction}
                    onSaved={() => { closeAction(); flash('ok', 'Done'); load(); }} />
            )}
        </div>
    );
}

function ActionModal({ row, kind, onClose, onSaved }) {
    const [comments, setComments] = useState('');
    const [refundAmount, setRefundAmount] = useState(row.AmountPaidToDate || 0);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const titles = {
        amApprove: `Approve cancellation — ${row.BookingNo}`,
        amReject:  `Reject cancellation — ${row.BookingNo}`,
        execute:   `Execute cancellation — ${row.BookingNo}`,
        withdraw:  `Withdraw your cancellation request — ${row.BookingNo}`,
    };
    const confirmLabels = { amApprove: 'Approve', amReject: 'Reject', execute: 'Execute Cancel', withdraw: 'Withdraw' };

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            if (kind === 'amApprove') {
                await axios.post(`${API}/sales/cancellations/${row.CancellationID}/am-approve`, { Comments: comments });
            } else if (kind === 'amReject') {
                if (comments.trim().length < 3) { setErr('Reason is required.'); setBusy(false); return; }
                await axios.post(`${API}/sales/cancellations/${row.CancellationID}/am-reject`, { Reason: comments.trim() });
            } else if (kind === 'execute') {
                const rf = refundAmount === '' ? null : Number(refundAmount);
                if (rf != null && (!Number.isFinite(rf) || rf < 0)) { setErr('Refund must be ≥ 0 or blank.'); setBusy(false); return; }
                await axios.post(`${API}/sales/cancellations/${row.CancellationID}/admin-execute`, {
                    RefundAmount: rf, AdminNotes: comments,
                });
            } else if (kind === 'withdraw') {
                await axios.post(`${API}/sales/cancellations/${row.CancellationID}/withdraw`);
            }
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={titles[kind]} onClose={onClose}>
            {err && <Err>{err}</Err>}

            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                <div><strong>Customer:</strong> {row.PartyName}</div>
                <div><strong>Vehicle:</strong> {row.ModelCode} {row.VariantName}</div>
                <div><strong>Negotiated:</strong> PKR {Number(row.NegotiatedPrice || 0).toLocaleString('en-PK')}</div>
                <div><strong>Paid to date:</strong> PKR {Number(row.AmountPaidToDate || 0).toLocaleString('en-PK')}</div>
                <div style={{ marginTop: 6 }}><strong>Reason proposed:</strong> {row.ProposalReason}</div>
            </div>

            {kind === 'execute' && (
                <Field label={`Refund amount (PKR) — default = customer's paid balance`}>
                    <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} style={inputStyle} />
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                        Leave blank if no refund (e.g., admin charge eats the deposit). This stores the amount on the cancellation row — the actual refund voucher is posted manually via Vouchers.
                    </div>
                </Field>
            )}

            {kind !== 'withdraw' && (
                <Field label={kind === 'amReject' ? 'Rejection reason *' : kind === 'execute' ? 'Admin notes (optional)' : 'AM comments (optional)'}>
                    <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)}
                        placeholder={kind === 'amReject' ? 'Why is this cancellation being rejected?' : 'Optional notes'}
                        style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
            )}

            {kind === 'execute' && (
                <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.78rem', color: '#b91c1c', marginBottom: 10 }}>
                    <strong>This will:</strong>
                    <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                        <li>Set booking status → Cancelled</li>
                        <li>Release allocated chassis (if any) back to AtDealer</li>
                        <li>Clawback all staff incentive accruals for this booking</li>
                        <li>Record refund amount on the cancellation row (no auto-voucher — post refund manually via Vouchers)</li>
                    </ul>
                </div>
            )}

            <Actions onCancel={onClose} onConfirm={save} confirmLabel={confirmLabels[kind]} busy={busy} />
        </Shell>
    );
}
