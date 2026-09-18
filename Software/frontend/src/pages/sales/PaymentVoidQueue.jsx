/**
 * Sales — Payment Void Queue
 *
 * Three-stage loop for undoing a payment recorded by mistake:
 *   Pending (requested) → AMApproved (Accounts Manager) → Executed (Admin)
 *   Side-states: AMRejected, Withdrawn
 *
 * The payment, the booking's paid total and the GL are untouched until an
 * admin executes the last stage.
 *
 * Visibility:
 *   - Anyone in SALES_READERS sees the queue.
 *   - am_approve gets Approve / Reject on Pending rows.
 *   - admin_unfinalize or sales_admin_settings gets Execute on AMApproved rows.
 *   - The requester gets Withdraw on their own Pending row.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Undo2, RefreshCw, Loader2, CheckCircle2, XCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';
import {
    inputStyle, Field, Err, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

const STATUS_STYLE = {
    Pending:    { bg: '#fef3c7', col: '#92400e', label: 'Pending AM' },
    AMApproved: { bg: '#dbeafe', col: '#1e40af', label: 'AM Approved — awaiting admin' },
    Executed:   { bg: '#dcfce7', col: '#15803d', label: 'Voided' },
    AMRejected: { bg: '#fee2e2', col: '#b91c1c', label: 'AM Rejected' },
    Withdrawn:  { bg: '#e2e8f0', col: '#475569', label: 'Withdrawn' },
};

const VOUCHER_ACTION_TEXT = {
    draft_deleted: 'Draft voucher removed',
    missing:       'Voucher no longer existed',
    none:          'No voucher attached',
};

const TABS = [
    { key: 'open',       label: 'Open',            match: (s) => s === 'Pending' || s === 'AMApproved' },
    { key: 'Pending',    label: 'Pending AM',      match: (s) => s === 'Pending' },
    { key: 'AMApproved', label: 'Awaiting Admin',  match: (s) => s === 'AMApproved' },
    { key: 'closed',     label: 'Closed',          match: (s) => ['Executed', 'AMRejected', 'Withdrawn'].includes(s) },
    { key: 'all',        label: 'All',             match: () => true },
];

export default function PaymentVoidQueue() {
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
            const r = await axios.get(`${API}/sales/payment-voids`);
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
            <ErpControlPanel
                title="Payment Void Queue"
                subtitle="Undoing a payment recorded by mistake: requested → Accounts Manager approves → Admin executes. Nothing changes on the booking or in the accounts until the last step."
                actions={
                    <button type="button" className="erp-btn erp-btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                }
            />

            {msg && <FlashMsg msg={msg} />}

            {(counts.Pending > 0 || counts.AMApproved > 0) && (
                <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {counts.Pending > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fef3c7', borderRadius: 6, color: '#92400e', fontSize: '0.85rem' }}>
                            <AlertTriangle size={16} /> <strong>{counts.Pending}</strong> awaiting AM decision
                        </div>
                    )}
                    {counts.AMApproved > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#dbeafe', borderRadius: 6, color: '#1e40af', fontSize: '0.85rem' }}>
                            <AlertTriangle size={16} /> <strong>{counts.AMApproved}</strong> approved, awaiting admin
                        </div>
                    )}
                </div>
            )}

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
                        <Undo2 size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No void requests in this view.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Booking</Th>
                                <Th>Customer</Th>
                                <Th align="right">Payment</Th>
                                <Th>Voucher</Th>
                                <Th>Requested by</Th>
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
                                    <tr key={r.VoidID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td>
                                            <Link to={`/sales/bookings/${r.BookingID}`} style={{ color: '#1e40af', fontWeight: 600, textDecoration: 'none' }}>
                                                {r.BookingNo} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                            </Link>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Void #{r.VoidID} · {r.BookingStatus}</div>
                                        </Td>
                                        <Td>{r.PartyName}</Td>
                                        <Td align="right">
                                            <div style={{ fontWeight: 600 }}>{fmtN(r.Amount)}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                {r.PaymentMode}{r.ReceivedAt ? ` · ${new Date(r.ReceivedAt).toLocaleDateString()}` : ''}
                                            </div>
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem' }}>
                                            {r.VoucherNo || <span style={{ color: '#94a3b8' }}>—</span>}
                                            {r.VoucherStatus && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.VoucherStatus}</div>}
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem' }}>
                                            <div>{r.ProposerName}</div>
                                            <div style={{ color: '#94a3b8' }}>{new Date(r.ProposedAt).toLocaleString()}</div>
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem', maxWidth: 280, color: '#475569' }}>
                                            <div>{r.ProposalReason}</div>
                                            {r.AMDecision && (
                                                <div style={{ marginTop: 4, padding: 4, background: r.AMDecision === 'Rejected' ? '#fef2f2' : '#f0fdf4', borderRadius: 4, fontSize: '0.72rem', color: r.AMDecision === 'Rejected' ? '#b91c1c' : '#15803d' }}>
                                                    <strong>{r.AMName} ({r.AMDecision}):</strong> {r.AMComments || '(no comments)'}
                                                </div>
                                            )}
                                            {r.ExecutedAt && (
                                                <div style={{ marginTop: 4, padding: 4, background: '#eff6ff', borderRadius: 4, fontSize: '0.72rem', color: '#1e40af' }}>
                                                    <strong>{r.AdminName}:</strong> {VOUCHER_ACTION_TEXT[r.VoucherAction] || r.VoucherAction}
                                                    {r.AdminNotes ? ` — ${r.AdminNotes}` : ''}
                                                </div>
                                            )}
                                        </Td>
                                        <Td><Pill bg={sty.bg} col={sty.col}>{sty.label}</Pill></Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {r.Status === 'Pending' && canAM && (
                                                    <>
                                                        <button className="btn-sm" onClick={() => openAction(r, 'amApprove')} style={{ background: '#15803d', color: 'white', border: 'none' }} title="Approve this void">
                                                            <CheckCircle2 size={12} /> Approve
                                                        </button>
                                                        <button className="btn-sm" onClick={() => openAction(r, 'amReject')} style={{ background: '#b91c1c', color: 'white', border: 'none' }} title="Reject this void">
                                                            <XCircle size={12} /> Reject
                                                        </button>
                                                    </>
                                                )}
                                                {r.Status === 'Pending' && isProposer && (
                                                    <button className="btn-sm" onClick={() => openAction(r, 'withdraw')} title="Withdraw your request">
                                                        <Undo2 size={12} /> Withdraw
                                                    </button>
                                                )}
                                                {r.Status === 'AMApproved' && canAdmin && (
                                                    <button className="btn-sm" onClick={() => openAction(r, 'execute')} style={{ background: '#7c3aed', color: 'white', border: 'none' }} title="Execute — void the payment and undo its voucher">
                                                        <Undo2 size={12} /> Execute
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
                    onSaved={(text) => { closeAction(); flash('ok', text || 'Done'); load(); }} />
            )}
        </div>
    );
}

function ActionModal({ row, kind, onClose, onSaved }) {
    const [comments, setComments] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    // A finalized voucher is never voided — the admin cannot execute it.
    const finalized = !!row.VoucherStatus && row.VoucherStatus !== 'Draft';

    const titles = {
        amApprove: `Approve void — ${row.BookingNo}`,
        amReject:  `Reject void — ${row.BookingNo}`,
        execute:   `Execute void — ${row.BookingNo}`,
        withdraw:  `Withdraw your void request — ${row.BookingNo}`,
    };
    const confirmLabels = { amApprove: 'Approve', amReject: 'Reject', execute: 'Void the payment', withdraw: 'Withdraw' };

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            if (kind === 'amApprove') {
                await axios.post(`${API}/sales/payment-voids/${row.VoidID}/am-approve`, { Comments: comments });
                onSaved('Approved — an admin can now execute it.');
            } else if (kind === 'amReject') {
                if (comments.trim().length < 3) { setErr('Reason is required.'); setBusy(false); return; }
                await axios.post(`${API}/sales/payment-voids/${row.VoidID}/am-reject`, { Reason: comments.trim() });
                onSaved('Rejected — the payment stands.');
            } else if (kind === 'execute') {
                const { data } = await axios.post(`${API}/sales/payment-voids/${row.VoidID}/admin-execute`, { AdminNotes: comments });
                onSaved(data.VoucherAction === 'draft_deleted'
                    ? 'Payment voided — its draft voucher was removed.'
                    : 'Payment voided.');
            } else if (kind === 'withdraw') {
                await axios.post(`${API}/sales/payment-voids/${row.VoidID}/withdraw`);
                onSaved('Request withdrawn.');
            }
        } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
    };

    return (
        <Shell title={titles[kind]} onClose={onClose}>
            {err && <Err>{err}</Err>}

            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                <div>Payment: <strong>PKR {fmtN(row.Amount)}</strong> {row.PaymentMode ? `(${row.PaymentMode})` : ''}</div>
                <div>Booking paid to date: <strong>PKR {fmtN(row.AmountPaidToDate)}</strong></div>
                {row.VoucherNo && <div>Voucher: <strong>{row.VoucherNo}</strong>{row.VoucherStatus ? ` · ${row.VoucherStatus}` : ''}</div>}
                <div style={{ marginTop: 6, color: '#64748b' }}>Reason given: {row.ProposalReason}</div>
            </div>

            {kind === 'execute' && (
                finalized ? (
                    <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 12, fontSize: '0.82rem', color: '#b91c1c' }}>
                        Voucher {row.VoucherNo} has been finalized ({row.VoucherStatus}). A finalized voucher is never
                        voided — request an unfinalize for it, or post a reversing entry in Accounting. Reject this
                        request instead.
                    </div>
                ) : (
                    <div style={{ padding: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, marginBottom: 12, fontSize: '0.82rem', color: '#9a3412' }}>
                        This is the step that changes the books. The payment is marked Voided and the booking's paid
                        total drops by PKR {fmtN(row.Amount)}
                        {row.VoucherNo ? `, and draft voucher ${row.VoucherNo} is removed along with its ledger rows` : ''}.
                    </div>
                )
            )}

            <Field label={kind === 'amReject' ? 'Reason for rejecting *' : kind === 'withdraw' ? 'Anything to note (optional)' : 'Comments (optional)'}>
                <textarea rows={3} value={comments} onChange={e => setComments(e.target.value)}
                          style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn" disabled={busy || (kind === 'execute' && finalized)} onClick={save}
                        style={{ background: kind === 'amReject' ? '#b91c1c' : kind === 'execute' ? '#7c3aed' : undefined }}>
                    {busy ? 'Working…' : confirmLabels[kind]}
                </button>
            </div>
        </Shell>
    );
}
