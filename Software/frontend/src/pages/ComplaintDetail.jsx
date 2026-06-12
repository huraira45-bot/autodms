import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowLeft, Loader2, Upload, RefreshCw, CheckCircle2, XCircle,
    AlertTriangle, MessageSquare, Camera, Send, ClipboardCheck, Shield,
    Phone, MapPin, Hash, Calendar, User, Briefcase, ArrowUp, UserPlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = '/api';

const STATUS_STYLE = {
    New:               { bg: '#e0e7ff', col: '#3730a3', label: 'NEW' },
    Assigned:          { bg: '#fef3c7', col: '#92400e', label: 'ASSIGNED' },
    InProgress:        { bg: '#fed7aa', col: '#9a3412', label: 'IN PROGRESS' },
    PendingCROVerify:  { bg: '#dbeafe', col: '#1e40af', label: 'PENDING CRO VERIFY' },
    Closed:            { bg: '#dcfce7', col: '#15803d', label: 'CLOSED' },
    ReOpened:          { bg: '#fee2e2', col: '#b91c1c', label: 'RE-OPENED' },
};

const ACTION_ICONS = {
    Note:                  { icon: MessageSquare, color: '#475569' },
    Routed:                { icon: Send,          color: '#1e40af' },
    Resolved:              { icon: CheckCircle2,  color: '#15803d' },
    WhatsAppProof:         { icon: Camera,        color: '#15803d' },
    WhatsAppProofOverride: { icon: Shield,        color: '#b45309' },
    CROCallLogged:         { icon: Phone,         color: '#1e40af' },
    CustomerVerdict:       { icon: ClipboardCheck, color: '#7c3aed' },
    Escalated:             { icon: AlertTriangle, color: '#b91c1c' },
    Reassigned:            { icon: RefreshCw,     color: '#1e40af' },
    ReOpened:              { icon: XCircle,       color: '#b91c1c' },
    Closed:                { icon: CheckCircle2,  color: '#15803d' },
};

export default function ComplaintDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { hasModule } = useAuth();
    const fileRef = useRef();

    const [data, setData]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy]   = useState(false);
    const [msg, setMsg]     = useState(null);
    const [noteText, setNoteText] = useState('');
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
    const [showVerdictModal, setShowVerdictModal] = useState(false);
    const [verdict, setVerdict] = useState('Satisfied');
    const [verdictNotes, setVerdictNotes] = useState('');
    const [showEscalateModal, setShowEscalateModal] = useState(false);
    const [escalateLevel, setEscalateLevel] = useState(1);
    const [escalateReason, setEscalateReason] = useState('');
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [reassignEmpId, setReassignEmpId] = useState('');
    const [reassignReason, setReassignReason] = useState('');
    const [employees, setEmployees] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/cro/complaints/${id}`);
            setData(r.data);
        } catch (e) {
            setMsg({ kind: 'err', text: e.response?.data?.error || e.message });
        }
        setLoading(false);
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const flash = (kind, text) => {
        setMsg({ kind, text });
        setTimeout(() => setMsg(null), 4000);
    };

    const doAddNote = async () => {
        if (!noteText.trim()) return;
        setBusy(true);
        try {
            await axios.post(`${API}/cro/complaints/${id}/actions`, { Notes: noteText, ActionType: 'Note' });
            setNoteText('');
            flash('ok', 'Note added');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const doUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        form.append('AttachmentType', 'WhatsAppScreenshot');
        setBusy(true);
        try {
            await axios.post(`${API}/cro/complaints/${id}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            flash('ok', 'Screenshot uploaded');
            await load();
        } catch (err) { flash('err', err.response?.data?.error || err.message); }
        setBusy(false);
        e.target.value = '';  // reset input so same file can be uploaded again
    };

    const doMarkResolved = async () => {
        if (!window.confirm('Mark this complaint as Resolved? It will move to Pending CRO Verify.')) return;
        setBusy(true);
        try {
            await axios.post(`${API}/cro/complaints/${id}/resolve`);
            flash('ok', 'Marked Resolved — awaiting CRO verification.');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const doOverride = async () => {
        if (!overrideReason.trim()) return;
        setBusy(true);
        try {
            await axios.post(`${API}/cro/complaints/${id}/whatsapp-override`, { Reason: overrideReason });
            flash('ok', 'WhatsApp-proof override granted.');
            setShowOverrideModal(false);
            setOverrideReason('');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const openReassign = async () => {
        if (employees.length === 0) {
            try {
                const r = await axios.get(`${API}/employees`);
                setEmployees(r.data || []);
            } catch (e) { flash('err', `Failed to load employees: ${e.response?.data?.error || e.message}`); return; }
        }
        setShowReassignModal(true);
    };

    const doEscalate = async () => {
        if (!escalateReason.trim()) return;
        setBusy(true);
        try {
            await axios.post(`${API}/cro/complaints/${id}/escalate`, { TargetLevel: escalateLevel, Reason: escalateReason });
            flash('ok', `Escalated to L${escalateLevel}.`);
            setShowEscalateModal(false);
            setEscalateReason('');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const doReassign = async () => {
        if (!reassignEmpId) return;
        setBusy(true);
        try {
            await axios.post(`${API}/cro/complaints/${id}/reassign`, {
                AssignedEmployeeID: parseInt(reassignEmpId),
                Reason: reassignReason || undefined,
            });
            flash('ok', 'Reassigned.');
            setShowReassignModal(false);
            setReassignEmpId('');
            setReassignReason('');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const doVerdict = async () => {
        setBusy(true);
        try {
            const r = await axios.post(`${API}/cro/complaints/${id}/verdict`, { Verdict: verdict, Notes: verdictNotes });
            flash('ok', `Verdict recorded — new status: ${r.data.newStatus}`);
            setShowVerdictModal(false);
            setVerdictNotes('');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" /></div>;
    if (!data) return <div style={{ padding: 40, color: '#dc2626' }}>Complaint not found.</div>;

    const status = STATUS_STYLE[data.Status] || STATUS_STYLE.New;
    const canResolve   = ['Assigned', 'InProgress'].includes(data.Status) && (hasModule('cro_dept_responder') || hasModule('cro_admin'));
    const canVerdict   = data.Status === 'PendingCROVerify'              && (hasModule('cro_workspace') || hasModule('cro_admin'));
    const canOverride  = data.WhatsAppScreenshotCount === 0              && (hasModule('cro_admin'));
    const canUpload    = !['Closed'].includes(data.Status)               && (hasModule('cro_dept_responder') || hasModule('cro_workspace') || hasModule('cro_admin'));
    const canEscalate  = data.Status !== 'Closed' && data.CurrentEscalationLevel < 2 && hasModule('cro_admin');
    const canReassign  = data.Status !== 'Closed' && (hasModule('cro_admin') || hasModule('cro_workspace'));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate('/cro/workspace')} className="btn-sm">
                        <ArrowLeft size={14} /> Back
                    </button>
                    <div>
                        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {data.ComplaintNo}
                            <span style={{ background: status.bg, color: status.col, padding: '4px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>{status.label}</span>
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>L{data.CurrentEscalationLevel}</span>
                        </h1>
                        <p className="page-subtitle" style={{ marginTop: 4 }}>{data.Subject}</p>
                    </div>
                </div>
                <button onClick={load} className="btn-sm"><RefreshCw size={14} /></button>
            </div>

            {msg && (
                <div style={{ padding: 12, borderRadius: 8, fontSize: '0.875rem',
                    background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
                    color:      msg.kind === 'ok' ? '#15803d' : '#b91c1c',
                    border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca') }}>
                    {msg.text}
                </div>
            )}

            {/* Header card — complaint + JC + customer info */}
            <div className="card">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
                    <Block icon={Briefcase} title="Complaint">
                        <div style={kv}>Type: <strong>{data.ComplaintType}</strong></div>
                        <div style={kv}>Severity: <strong>{data.Severity}</strong></div>
                        <div style={kv}>Source: {data.Source}</div>
                        <div style={kv}>Filed: {new Date(data.OpenedAt).toLocaleString()}</div>
                        <div style={kv}>By: {data.CreatedByName}</div>
                    </Block>
                    <Block icon={Hash} title={`Job Card — ${data.JobCardNo}`}>
                        <div style={kv}>{data.BusinessType} — {data.BusinessTypeTitle}</div>
                        <div style={kv}>{data.VehicleRegNo}</div>
                        {data.JC_Chasis && <div style={kv}>Chassis: <code style={{ fontSize: '0.75rem' }}>{data.JC_Chasis}</code></div>}
                        <div style={kv}>Advisor: {data.ServiceAdvisorName || <em style={{ color: '#94a3b8' }}>unassigned</em>}</div>
                        <div style={kv}>BU Manager: {data.BUManagerName || <em style={{ color: '#94a3b8' }}>unassigned</em>}</div>
                    </Block>
                    <Block icon={User} title="Contact">
                        <div style={kv}>{data.ContactName}</div>
                        <div style={kv}><a href={`tel:${data.ContactPhone}`} style={{ color: 'var(--primary)' }}>{data.ContactPhone}</a></div>
                        {data.PartyName && <div style={kv}>Party: {data.PartyName}</div>}
                        <div style={kv}>Assigned to: <strong>{data.AssignedEmployeeName || 'unassigned'}</strong></div>
                    </Block>
                </div>
                {data.Description && (
                    <div style={{ marginTop: 14, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: '0.9rem' }}>
                        {data.Description}
                    </div>
                )}
            </div>

            {/* Actions row */}
            <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={doUpload} style={{ display: 'none' }} />
                {canUpload && (
                    <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy} style={{ background: '#0891b2' }}>
                        <Camera size={14} /> Upload WhatsApp screenshot
                    </button>
                )}
                {canResolve && (
                    <button className="btn" onClick={doMarkResolved} disabled={busy} style={{ background: '#15803d' }}>
                        <CheckCircle2 size={14} /> Mark Resolved
                    </button>
                )}
                {canOverride && (
                    <button className="btn" onClick={() => setShowOverrideModal(true)} disabled={busy} style={{ background: '#b45309' }}>
                        <Shield size={14} /> Grant proof override
                    </button>
                )}
                {canVerdict && (
                    <button className="btn" onClick={() => setShowVerdictModal(true)} disabled={busy} style={{ background: '#7c3aed' }}>
                        <ClipboardCheck size={14} /> Record customer verdict
                    </button>
                )}
                {canEscalate && (
                    <button className="btn" onClick={() => { setEscalateLevel(Math.min(data.CurrentEscalationLevel + 1, 2)); setShowEscalateModal(true); }} disabled={busy} style={{ background: '#b91c1c' }}>
                        <ArrowUp size={14} /> Escalate
                    </button>
                )}
                {canReassign && (
                    <button className="btn" onClick={openReassign} disabled={busy} style={{ background: '#475569' }}>
                        <UserPlus size={14} /> Reassign
                    </button>
                )}
                <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b' }}>
                    {data.WhatsAppScreenshotCount} WhatsApp screenshot{data.WhatsAppScreenshotCount === 1 ? '' : 's'} on file
                </div>
            </div>

            {/* Add note + attachments grid + timeline — 2-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card">
                        <div style={{ fontWeight: 600, marginBottom: 10 }}>Add a note</div>
                        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                            placeholder="What did you find / discuss / decide?"
                            style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                            <button className="btn" onClick={doAddNote} disabled={busy || !noteText.trim()}>
                                <MessageSquare size={14} /> Add note
                            </button>
                        </div>
                    </div>

                    <div className="card">
                        <div style={{ fontWeight: 600, marginBottom: 10 }}>WhatsApp Screenshots ({data.attachments.filter(a => a.AttachmentType === 'WhatsAppScreenshot').length})</div>
                        {data.attachments.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No screenshots yet.</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                            {data.attachments.map(a => (
                                <a key={a.AttachmentID}
                                   href={`${API}/cro/complaints/${id}/attachments/${a.AttachmentID}/download`}
                                   target="_blank" rel="noreferrer"
                                   style={{ display: 'block', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, textDecoration: 'none', color: 'inherit', fontSize: '0.75rem' }}>
                                    <Camera size={20} color="#0891b2" />
                                    <div style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.OriginalFileName}</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>by {a.UploadedByName}</div>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div style={{ fontWeight: 600, marginBottom: 12 }}>Activity Timeline ({data.actions.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {data.actions.map(a => {
                            const ai = ACTION_ICONS[a.ActionType] || ACTION_ICONS.Note;
                            const Icon = ai.icon;
                            return (
                                <div key={a.ActionID} style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 99, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon size={16} color={ai.color} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: ai.color }}>
                                            {a.ActionType}
                                            {a.CustomerVerdict && <span style={{ marginLeft: 6, fontWeight: 400, color: '#475569' }}>· {a.CustomerVerdict}</span>}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                                            {a.PerformedByName || 'system'} · {new Date(a.PerformedAt).toLocaleString()}
                                            {(a.EscalationLevelAfter != null && a.EscalationLevelBefore != null) &&
                                                ` · L${a.EscalationLevelBefore}→L${a.EscalationLevelAfter}`}
                                        </div>
                                        {a.Notes && <div style={{ fontSize: '0.85rem', marginTop: 4, color: '#0f172a' }}>{a.Notes}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Override modal */}
            {showOverrideModal && (
                <Modal onClose={() => setShowOverrideModal(false)} title="Grant WhatsApp-proof override">
                    <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 12 }}>
                        Use sparingly — only when the customer has no WhatsApp and is verified by phone.
                        Each override is audited and counted in CRO reports.
                    </p>
                    <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={4}
                        placeholder="Reason (e.g. 'Customer 67 years old, no smartphone; verified by phone call to listed mobile.')"
                        style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-sm" onClick={() => setShowOverrideModal(false)}>Cancel</button>
                        <button className="btn" onClick={doOverride} disabled={busy || !overrideReason.trim()} style={{ background: '#b45309' }}>
                            Grant Override
                        </button>
                    </div>
                </Modal>
            )}

            {/* Verdict modal */}
            {showVerdictModal && (
                <Modal onClose={() => setShowVerdictModal(false)} title="Record customer verdict">
                    <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 12 }}>
                        Calling the customer and recording what they said.
                        <strong> NotSatisfied forces L2 escalation immediately</strong> (decision #5).
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                        {['Satisfied', 'NotSatisfied', 'NoResponse'].map(v => (
                            <button key={v} type="button" onClick={() => setVerdict(v)}
                                style={{
                                    padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                                    border: '2px solid ' + (verdict === v ?
                                        (v === 'Satisfied' ? '#15803d' : v === 'NotSatisfied' ? '#b91c1c' : '#64748b')
                                        : '#cbd5e1'),
                                    background: verdict === v ?
                                        (v === 'Satisfied' ? '#dcfce7' : v === 'NotSatisfied' ? '#fee2e2' : '#f1f5f9')
                                        : 'white',
                                    fontWeight: 600,
                                    color: verdict === v ?
                                        (v === 'Satisfied' ? '#15803d' : v === 'NotSatisfied' ? '#b91c1c' : '#475569')
                                        : '#0f172a',
                                }}>
                                {v}
                            </button>
                        ))}
                    </div>
                    <textarea value={verdictNotes} onChange={e => setVerdictNotes(e.target.value)} rows={3}
                        placeholder="Customer's exact words / any follow-up needed…"
                        style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-sm" onClick={() => setShowVerdictModal(false)}>Cancel</button>
                        <button className="btn" onClick={doVerdict} disabled={busy} style={{ background: '#7c3aed' }}>
                            Record Verdict
                        </button>
                    </div>
                </Modal>
            )}

            {/* Escalate modal */}
            {showEscalateModal && (
                <Modal onClose={() => setShowEscalateModal(false)} title={`Manually escalate ${data.ComplaintNo}`}>
                    <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 12 }}>
                        Currently at <strong>L{data.CurrentEscalationLevel}</strong>. Choose the new level — this fires notifications to the additional recipients in the chain.
                    </p>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        {[1, 2].filter(lvl => lvl > data.CurrentEscalationLevel).map(lvl => (
                            <button key={lvl} type="button" onClick={() => setEscalateLevel(lvl)}
                                style={{
                                    padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
                                    border: '2px solid ' + (escalateLevel === lvl ? '#b91c1c' : '#cbd5e1'),
                                    background: escalateLevel === lvl ? '#fee2e2' : 'white',
                                    fontWeight: 600,
                                    color: escalateLevel === lvl ? '#b91c1c' : '#0f172a',
                                }}>
                                L{lvl} {lvl === 1 ? '— + CRO Manager' : '— + Executive (max)'}
                            </button>
                        ))}
                    </div>
                    <textarea value={escalateReason} onChange={e => setEscalateReason(e.target.value)} rows={3}
                        placeholder="Reason for manual escalation (mandatory) — what is the customer/stakeholder pushing on?"
                        style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-sm" onClick={() => setShowEscalateModal(false)}>Cancel</button>
                        <button className="btn" onClick={doEscalate} disabled={busy || !escalateReason.trim()} style={{ background: '#b91c1c' }}>
                            Escalate to L{escalateLevel}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Reassign modal */}
            {showReassignModal && (
                <Modal onClose={() => setShowReassignModal(false)} title={`Reassign ${data.ComplaintNo}`}>
                    <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 12 }}>
                        Currently assigned to <strong>{data.AssignedEmployeeName || '—'}</strong> ({data.AssignedDepartmentName || '—'}). Pick a new responder.
                    </p>
                    <select value={reassignEmpId} onChange={e => setReassignEmpId(e.target.value)}
                        style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, marginBottom: 10, fontFamily: 'inherit' }}>
                        <option value="">— Select employee —</option>
                        {employees.map(e => (
                            <option key={e.EmployeeID} value={e.EmployeeID}>
                                {(e.EmployeeName || '').trim()} {e.DepartmentName ? `· ${e.DepartmentName}` : ''}
                            </option>
                        ))}
                    </select>
                    <textarea value={reassignReason} onChange={e => setReassignReason(e.target.value)} rows={2}
                        placeholder="Optional reason for the reassignment"
                        style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-sm" onClick={() => setShowReassignModal(false)}>Cancel</button>
                        <button className="btn" onClick={doReassign} disabled={busy || !reassignEmpId} style={{ background: '#475569' }}>
                            Reassign
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

const kv = { fontSize: '0.85rem', color: '#475569', marginBottom: 4 };

function Block({ icon: Icon, title, children }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                <Icon size={14} /> {title}
            </div>
            {children}
        </div>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 12, width: 480, padding: 20, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h3>
                {children}
            </div>
        </div>
    );
}
