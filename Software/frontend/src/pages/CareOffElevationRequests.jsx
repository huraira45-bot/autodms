// Care-Off cap elevation approval queue. Users with
// `careoff_approve_elevation` can approve/reject pending requests. Users
// with only `careoff_request_elevation` can see their own history.
// Owner ask 2026-07-23.
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { ShieldCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { ErpControlPanel } from '../components/erp';

const STATUS_META = {
    PENDING:  { label: 'Pending',  bg: '#fef3c7', color: '#92400e', Icon: Clock },
    APPROVED: { label: 'Approved', bg: '#dcfce7', color: '#166534', Icon: CheckCircle2 },
    REJECTED: { label: 'Rejected', bg: '#fee2e2', color: '#991b1b', Icon: XCircle },
};

const fmtDT = (v) => v ? new Date(v).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '';

export default function CareOffElevationRequests() {
    const { hasModule } = useAuth();
    const { notify, confirm } = useFeedback();
    const canApprove = hasModule('careoff_approve_elevation');

    const [status, setStatus] = useState('PENDING');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [rejectFor, setRejectFor] = useState(null);
    const [rejectReason, setRejectReason] = useState('');

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get('/api/careoff-elevations', { params: { status } });
            setRows(r.data || []);
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        }
        setLoading(false);
    }, [status, notify]);
    useEffect(() => { fetchRows(); }, [fetchRows]);

    const handleApprove = async (row) => {
        const ok = await confirm({
            title: 'Approve cap elevation?',
            message: `Raise ${row.CareOffEmployeeName || row.CareOffEmployeeCurrentName || 'the care-off'}'s cap on ${row.JobCardNo || 'JC #' + row.JobCardID} from ${row.OriginalCapPct}% to ${row.RequestedCapPct}%.`,
            confirmLabel: 'Approve',
            tone: 'primary',
        });
        if (!ok) return;
        try {
            await axios.patch(`/api/careoff-elevations/${row.RequestID}/approve`);
            notify({ type: 'success', title: 'Approved', message: `${row.CareOffEmployeeName}: cap raised to ${row.RequestedCapPct}%.` });
            fetchRows();
        } catch (err) {
            notify({ type: 'error', title: 'Approve failed', message: err.response?.data?.error || err.message });
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) {
            notify({ type: 'warning', title: 'Reason required', message: 'Explain why the elevation is being rejected.' });
            return;
        }
        try {
            await axios.patch(`/api/careoff-elevations/${rejectFor.RequestID}/reject`, { DecisionReason: rejectReason });
            notify({ type: 'success', title: 'Rejected', message: 'Request rejected.' });
            setRejectFor(null);
            setRejectReason('');
            fetchRows();
        } catch (err) {
            notify({ type: 'error', title: 'Reject failed', message: err.response?.data?.error || err.message });
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={16} /> Care-Off Cap Elevations</span>}
                subtitle="Requests to raise a specific JC's care-off discount cap above the assigned employee's normal limit."
                actions={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map(s => (
                            <button key={s}
                                    className={`btn-sm ${s === status ? 'btn' : ''}`}
                                    style={s === status ? { background: '#0f172a', color: 'white' } : {}}
                                    onClick={() => setStatus(s)}>
                                {s.charAt(0) + s.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                } />

            <div className="card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <Th>Requested</Th>
                            <Th>Job Card</Th>
                            <Th>Care-Off Employee</Th>
                            <Th align="right">From</Th>
                            <Th align="right">To</Th>
                            <Th>Reason</Th>
                            <Th>Requested By</Th>
                            <Th>Status</Th>
                            <Th>Decision</Th>
                            <Th></Th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</td></tr>}
                        {!loading && rows.length === 0 && <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No requests.</td></tr>}
                        {rows.map(r => {
                            const meta = STATUS_META[r.Status] || {};
                            const StatusIcon = meta.Icon;
                            return (
                                <tr key={r.RequestID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td>{fmtDT(r.RequestedAt)}</Td>
                                    <Td mono color="#1e40af">{r.JobCardNo || r.jobCode || `JC-${r.JobCardID}`}<br/><span style={{ color: '#64748b', fontSize: '0.75rem' }}>{r.VehicleRegNo}</span></Td>
                                    <Td>{r.CareOffEmployeeName || r.CareOffEmployeeCurrentName || '—'}</Td>
                                    <Td align="right" mono>{r.OriginalCapPct}%</Td>
                                    <Td align="right" mono bold color="#166534">{r.RequestedCapPct}%</Td>
                                    <Td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{r.Reason || <span style={{ color: '#94a3b8' }}>—</span>}</Td>
                                    <Td>{r.RequestedByName || '—'}</Td>
                                    <Td>
                                        <span style={{ background: meta.bg, color: meta.color,
                                                        padding: '2px 8px', borderRadius: 12,
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                        display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            {StatusIcon && <StatusIcon size={12} />}
                                            {meta.label || r.Status}
                                        </span>
                                    </Td>
                                    <Td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {r.DecidedAt && (
                                            <>
                                                {fmtDT(r.DecidedAt)}<br/>
                                                by {r.DecidedByName}<br/>
                                                {r.DecisionReason && <span style={{ color: r.Status === 'REJECTED' ? '#991b1b' : '#334155' }}>"{r.DecisionReason}"</span>}
                                            </>
                                        )}
                                    </Td>
                                    <Td>
                                        {r.Status === 'PENDING' && canApprove && (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn-sm" style={{ background: '#16a34a', color: 'white' }}
                                                        onClick={() => handleApprove(r)}>Approve</button>
                                                <button className="btn-sm" style={{ background: '#ef4444', color: 'white' }}
                                                        onClick={() => { setRejectFor(r); setRejectReason(''); }}>Reject</button>
                                            </div>
                                        )}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {rejectFor && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', borderRadius: 12, width: 480, padding: 20 }}>
                        <h3 style={{ marginTop: 0 }}>Reject elevation request</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                            Request #{rejectFor.RequestID} — {rejectFor.CareOffEmployeeName} on {rejectFor.JobCardNo || 'JC-' + rejectFor.JobCardID}.
                        </p>
                        <label style={{ display: 'block', marginTop: 12, fontSize: '0.85rem', fontWeight: 600 }}>
                            Reason (required)
                            <textarea rows={4} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                      style={{ width: '100%', marginTop: 4, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical' }} />
                        </label>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                            <button className="btn" style={{ background: '#e2e8f0', color: '#475569' }} onClick={() => setRejectFor(null)}>Cancel</button>
                            <button className="btn" style={{ background: '#ef4444', color: 'white' }} onClick={handleReject}>Reject Request</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Th({ children, align = 'left' }) {
    return <th style={{ padding: '8px 10px', textAlign: align, fontWeight: 700, color: '#334155', fontSize: '0.78rem' }}>{children}</th>;
}
function Td({ children, align = 'left', mono, bold, color, style }) {
    return <td style={{
        padding: '8px 10px', textAlign: align,
        fontFamily: mono ? 'monospace' : undefined,
        fontWeight: bold ? 700 : undefined,
        color, ...(style || {}),
    }}>{children}</td>;
}
