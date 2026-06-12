import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

const STATUS_STYLE = {
    PENDING:     { bg: '#fef3c7', color: '#92400e', label: 'Pending AM' },
    AM_APPROVED: { bg: '#dbeafe', color: '#1e40af', label: 'AM Approved' },
    COMPLETED:   { bg: '#dcfce7', color: '#166534', label: 'Unfinalized' },
    REJECTED:    { bg: '#fee2e2', color: '#b91c1c', label: 'Rejected' },
};

const ENTITY_LABEL = { JOBCARD: 'Job Card', GRN: 'GRN', GRTN: 'GRTN' };

export default function UnfinalizeRequests() {
    const { hasModule } = useAuth();
    const isAM    = hasModule('am_approve');
    const isAdmin = hasModule('admin_unfinalize');

    const [requests, setRequests] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [rejectModal, setRejectModal] = useState(null); // { requestId }
    const [rejectReason, setRejectReason] = useState('');
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const r = await axios.get('/api/finalize/requests');
            setRequests(r.data);
        } catch { }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const flash = (m, isErr = false) => {
        isErr ? setErr(m) : setMsg(m);
        setTimeout(() => { setMsg(''); setErr(''); }, 3000);
    };

    const amApprove = async (id) => {
        try {
            await axios.put(`/api/finalize/requests/${id}/am-approve`);
            flash('Request approved — forwarded to Admin queue');
            load();
        } catch (e) { flash(e.response?.data?.error || 'Error', true); }
    };

    const adminUnfinalize = async (id) => {
        try {
            await axios.put(`/api/finalize/requests/${id}/admin-unfinalize`);
            flash('Record unfinalized successfully');
            load();
        } catch (e) { flash(e.response?.data?.error || 'Error', true); }
    };

    const reject = async () => {
        try {
            await axios.put(`/api/finalize/requests/${rejectModal}/reject`, { reason: rejectReason });
            flash('Request rejected');
            setRejectModal(null); setRejectReason('');
            load();
        } catch (e) { flash(e.response?.data?.error || 'Error', true); }
    };

    const pending  = requests.filter(r => r.Status === 'PENDING');
    const amQueue  = requests.filter(r => r.Status === 'AM_APPROVED');
    const history  = requests.filter(r => ['COMPLETED','REJECTED'].includes(r.Status));

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Unfinalize Requests</h1>
            </div>

            {msg && <div style={notif('#dcfce7','#166534')}>{msg}</div>}
            {err && <div style={notif('#fee2e2','#b91c1c')}>{err}</div>}

            {/* AM Section */}
            {isAM && (
                <Section title="Pending AM Approval" icon={<Clock size={18} />} color="#92400e" bg="#fef3c7" count={pending.length}>
                    {pending.length === 0
                        ? <Empty text="No pending requests" />
                        : pending.map(r => (
                            <Card key={r.RequestID} r={r}>
                                <button className="btn-primary" style={{ marginRight: 8 }} onClick={() => amApprove(r.RequestID)}>
                                    <CheckCircle2 size={14} style={{ marginRight: 4 }} /> Approve
                                </button>
                                <button className="btn-secondary" style={{ color: '#dc2626' }} onClick={() => { setRejectModal(r.RequestID); setRejectReason(''); }}>
                                    <XCircle size={14} style={{ marginRight: 4 }} /> Reject
                                </button>
                            </Card>
                        ))
                    }
                </Section>
            )}

            {/* Admin Section */}
            {isAdmin && (
                <Section title="Admin Queue — AM Approved" icon={<AlertTriangle size={18} />} color="#1e40af" bg="#dbeafe" count={amQueue.length}>
                    {amQueue.length === 0
                        ? <Empty text="No requests awaiting admin action" />
                        : amQueue.map(r => (
                            <Card key={r.RequestID} r={r}>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                                    AM approved by <strong>{r.AMApprovedByName}</strong> on {r.AMApprovedAt ? new Date(r.AMApprovedAt).toLocaleDateString() : '—'}
                                </div>
                                <button className="btn-primary" style={{ marginRight: 8, background: '#16a34a' }} onClick={() => adminUnfinalize(r.RequestID)}>
                                    <CheckCircle2 size={14} style={{ marginRight: 4 }} /> Unfinalize
                                </button>
                                <button className="btn-secondary" style={{ color: '#dc2626' }} onClick={() => { setRejectModal(r.RequestID); setRejectReason(''); }}>
                                    <XCircle size={14} style={{ marginRight: 4 }} /> Reject
                                </button>
                            </Card>
                        ))
                    }
                </Section>
            )}

            {/* History */}
            {(isAM || isAdmin) && history.length > 0 && (
                <Section title="History (Last 30)" icon={null} color="#475569" bg="#f1f5f9" count={null}>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr><th>Type</th><th>Ref</th><th>Requested By</th><th>Reason</th><th>Status</th><th>Date</th></tr>
                            </thead>
                            <tbody>
                                {history.slice(0, 30).map(r => {
                                    const st = STATUS_STYLE[r.Status] || {};
                                    return (
                                        <tr key={r.RequestID}>
                                            <td><span style={badge(st.bg, st.color)}>{ENTITY_LABEL[r.EntityType] || r.EntityType}</span></td>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.EntityRef || r.EntityID}</td>
                                            <td>{r.RequestedByName}</td>
                                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Reason}</td>
                                            <td><span style={badge(st.bg, st.color)}>{st.label}</span></td>
                                            <td style={{ fontSize: 12, color: '#64748b' }}>{new Date(r.RequestedAt).toLocaleDateString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}

            {/* Reject Modal */}
            {rejectModal && (
                <div style={overlay}>
                    <div style={modalBox}>
                        <h3 style={{ marginBottom: 12 }}>Reject Request</h3>
                        <div style={{ marginBottom: 12 }}>
                            <label style={labelStyle}>Reason for rejection</label>
                            <textarea className="form-input" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn-primary" style={{ background: '#dc2626' }} onClick={reject}>Reject</button>
                            <button className="btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Section({ title, icon, color, bg, count, children }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: bg, borderRadius: '8px 8px 0 0', borderBottom: `2px solid ${color}20` }}>
                {icon && <span style={{ color }}>{icon}</span>}
                <strong style={{ color, fontSize: 14 }}>{title}</strong>
                {count !== null && <span style={{ ...badge(color + '22', color), marginLeft: 'auto' }}>{count}</span>}
            </div>
            <div style={{ border: `1px solid ${color}30`, borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 14 }}>
                {children}
            </div>
        </div>
    );
}

function Card({ r, children }) {
    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 10, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                    <span style={badge('#f1f5f9', '#475569')}>{ENTITY_LABEL[r.EntityType] || r.EntityType}</span>
                    <strong style={{ marginLeft: 8, fontFamily: 'monospace' }}>{r.EntityRef || `#${r.EntityID}`}</strong>
                </div>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(r.RequestedAt).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                <strong>Requested by:</strong> {r.RequestedByName}
            </div>
            <div style={{ fontSize: 13, color: '#1e293b', background: '#f8fafc', padding: '8px 12px', borderRadius: 6, marginBottom: 10, borderLeft: '3px solid #cbd5e1' }}>
                {r.Reason}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
        </div>
    );
}

function Empty({ text }) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{text}</div>;
}

const notif = (bg, color) => ({ background: bg, color, padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13 });
const badge = (bg, color) => ({ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: bg, color, display: 'inline-flex', alignItems: 'center' });
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox = { background: '#fff', borderRadius: 10, padding: 24, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' };
