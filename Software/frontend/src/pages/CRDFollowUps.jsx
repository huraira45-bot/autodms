import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
    Headphones, Phone, AlertTriangle, CheckCircle2, Clock, X,
    Search, Loader2, RefreshCw, Save, MessageCircle, Star, ClipboardList,
} from 'lucide-react';
import SurveyCapturePanel from '../components/SurveyCapturePanel';

const API_BASE = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK');

const STATUS_STYLE = {
    Pending:    { bg: '#fef3c7', col: '#92400e', label: 'Pending' },
    Contacted:  { bg: '#dcfce7', col: '#15803d', label: 'Contacted' },
    NoResponse: { bg: '#fee2e2', col: '#b91c1c', label: 'No Response' },
    Closed:     { bg: '#e2e8f0', col: '#475569', label: 'Closed' }
};

const OUTCOME_STYLE = {
    Satisfied:      { bg: '#dcfce7', col: '#15803d' },
    Complaint:      { bg: '#fee2e2', col: '#b91c1c' },
    NeedsAttention: { bg: '#fef3c7', col: '#92400e' },
    NoAnswer:       { bg: '#e2e8f0', col: '#475569' }
};

function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.Pending;
    return (
        <span style={{ background: s.bg, color: s.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {s.label}
        </span>
    );
}

function OutcomeBadge({ outcome }) {
    if (!outcome) return <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>;
    const s = OUTCOME_STYLE[outcome] || {};
    return (
        <span style={{ background: s.bg, color: s.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600 }}>
            {outcome}
        </span>
    );
}

function KPI({ label, value, icon: Icon, color }) {
    return (
        <div className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: '1.4rem', color }}>{fmt(value)}</div>
            </div>
            <Icon size={28} color={color} style={{ opacity: 0.6 }} />
        </div>
    );
}

function SurveyInlineBlock({ followUp, survey, busy, expanded, onExpand, onCollapse, onCreate, onSaved, onError }) {
    // Display states:
    //   - JC not present       → hide
    //   - Survey not loaded    → loader
    //   - found && Responded   → "Already responded ★ X" + Edit responses
    //   - found && !Responded  → "Take Survey" button → expand inline
    //   - !found               → "Create + Take Survey" button → POST then expand
    if (!followUp.JobCardID) return null;
    if (survey === null) return (
        <div style={{ padding: 8, color: '#94a3b8', fontSize: '0.78rem', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={12} className="animate-spin" /> Checking related survey…
        </div>
    );

    const s = survey.survey;
    const responded = s?.Status === 'Responded';

    return (
        <div style={{ padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: expanded ? 10 : 0 }}>
                <ClipboardList size={18} color="#1e40af" />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>Satisfaction Survey</div>
                    {survey.found ? (
                        <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                            {responded ? (
                                <>
                                    Responded {s.OverallRating != null && <span style={{ color: '#92400e', fontWeight: 600 }}><Star size={11} fill="#f59e0b" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />{s.OverallRating}</span>}
                                </>
                            ) : (
                                <>Pending · Status: {s.Status}</>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.78rem', color: '#475569' }}>No survey on file for this JC yet.</div>
                    )}
                </div>
                <div>
                    {survey.found && !expanded && (
                        <button type="button" onClick={onExpand}
                            style={{ padding: '6px 12px', background: responded ? '#cbd5e1' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                            {responded ? 'Edit responses' : 'Take Survey'}
                        </button>
                    )}
                    {!survey.found && (
                        <button type="button" onClick={onCreate} disabled={busy}
                            style={{ padding: '6px 12px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <ClipboardList size={12} />}
                            Create + Take Survey
                        </button>
                    )}
                    {survey.found && expanded && (
                        <button type="button" onClick={onCollapse}
                            style={{ padding: '6px 12px', background: 'transparent', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                            Hide
                        </button>
                    )}
                </div>
            </div>

            {survey.found && expanded && (
                <div style={{ background: 'white', padding: 12, borderRadius: 6, border: '1px solid #e0e7ff' }}>
                    <SurveyCapturePanel surveyId={s.SurveyID} compact onSaved={onSaved} onError={onError} />
                </div>
            )}
        </div>
    );
}

function ContactModal({ followUp, onClose, onSaved }) {
    const [notes, setNotes] = useState(followUp.Notes || '');
    const [outcome, setOutcome] = useState(followUp.Outcome || '');
    const [status, setStatus] = useState(followUp.Status || 'Pending');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    // Extra fields surfaced when Outcome=Complaint (CRD→CRO bridge)
    const [cmpSubject, setCmpSubject]       = useState('');
    const [cmpType,    setCmpType]          = useState('Service');
    const [cmpSeverity, setCmpSeverity]     = useState('Normal');
    const [cmpDescription, setCmpDescription] = useState('');
    // Survey integration
    const [survey, setSurvey] = useState(null);      // null=not loaded, {found, survey?}
    const [surveyExpanded, setSurveyExpanded] = useState(false);
    const [surveyBusy, setSurveyBusy] = useState(false);

    useEffect(() => {
        // Look up the PostJobCard survey for this JC (auto-created on finalize, or absent if not finalized yet)
        if (!followUp.JobCardID) return;
        (async () => {
            try {
                const r = await axios.get(`${API_BASE}/cro/surveys/by-job-card/${followUp.JobCardID}`);
                setSurvey(r.data);
            } catch { setSurvey({ found: false }); }
        })();
    }, [followUp.JobCardID]);

    const createAndOpenSurvey = async () => {
        setSurveyBusy(true);
        try {
            const r = await axios.post(`${API_BASE}/cro/surveys`, {
                SurveyType: 'PostJobCard',
                JobCardID: followUp.JobCardID,
                ContactPhone: followUp.PhoneOne || undefined,
            });
            setSurvey({ found: true, survey: { SurveyID: r.data.SurveyID, Status: 'Triggered' } });
            setSurveyExpanded(true);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        }
        setSurveyBusy(false);
    };

    const alreadyLinked   = !!followUp.LinkedComplaintID;
    const needsComplaint  = outcome === 'Complaint' && !alreadyLinked;
    const complaintReady  = !needsComplaint || cmpSubject.trim().length > 0;

    const save = async (markContacted) => {
        setBusy(true); setErr(null);
        try {
            const body = {
                Status: status,
                Outcome: outcome || null,
                Notes: notes,
                MarkContacted: !!markContacted,
            };
            if (needsComplaint) {
                body.Complaint = {
                    Subject:       cmpSubject.trim(),
                    ComplaintType: cmpType,
                    Severity:      cmpSeverity,
                    Description:   cmpDescription.trim() || undefined,
                };
            }
            const r = await axios.put(`${API_BASE}/crd/follow-ups/${followUp.FollowUpID}`, body);
            onSaved(r.data);
            onClose();
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card" style={{ width: 540 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3 style={{ margin: 0 }}>{followUp.CustomerName}</h3>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                            JC {followUp.JobCardNo} {followUp.VehicleRegNo && `· ${followUp.VehicleRegNo}`}
                            {followUp.PhoneOne && ` · ${followUp.PhoneOne}`}
                        </div>
                    </div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <div style={{ padding: 20 }}>
                    {err && <div style={{ padding: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>{err}</div>}

                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Outcome</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {['Satisfied', 'Complaint', 'NeedsAttention', 'NoAnswer'].map(o => (
                                <button key={o} type="button" onClick={() => setOutcome(outcome === o ? '' : o)}
                                    style={{
                                        padding: '6px 12px', fontSize: '0.85rem', borderRadius: 6, cursor: 'pointer',
                                        border: outcome === o ? '2px solid ' + (OUTCOME_STYLE[o]?.col || '#475569') : '1px solid #cbd5e1',
                                        background: outcome === o ? (OUTCOME_STYLE[o]?.bg || '#f8fafc') : 'white',
                                        color: outcome === o ? OUTCOME_STYLE[o]?.col : '#475569',
                                        fontWeight: outcome === o ? 600 : 400
                                    }}>
                                    {o}
                                </button>
                            ))}
                        </div>
                    </div>

                    {alreadyLinked && (
                        <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 14, fontSize: '0.85rem', color: '#b91c1c' }}>
                            Already linked to complaint <strong>{followUp.LinkedComplaintNo}</strong>. <a href={`/cro/complaints/${followUp.LinkedComplaintID}`} style={{ color: '#b91c1c', textDecoration: 'underline' }}>Open complaint →</a>
                        </div>
                    )}

                    {needsComplaint && (
                        <div style={{ padding: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, marginBottom: 14 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9a3412', marginBottom: 8 }}>
                                ↳ This will create a CRO complaint and link it to this follow-up.
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Complaint subject *</label>
                                <input value={cmpSubject} onChange={e => setCmpSubject(e.target.value)}
                                    placeholder="One-line summary (e.g. 'Brake noise reappeared 3 days after service')"
                                    style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
                                    <select value={cmpType} onChange={e => setCmpType(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }}>
                                        <option value="Service">Service</option>
                                        <option value="Product">Product</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Severity</label>
                                    <select value={cmpSeverity} onChange={e => setCmpSeverity(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }}>
                                        <option value="Low">Low</option>
                                        <option value="Normal">Normal</option>
                                        <option value="High">High</option>
                                        <option value="Critical">Critical</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Description (optional — defaults to your notes)</label>
                                <textarea rows={2} value={cmpDescription} onChange={e => setCmpDescription(e.target.value)}
                                    placeholder="Optional. Leave blank to use Notes."
                                    style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                            <option value="Pending">Pending</option>
                            <option value="Contacted">Contacted</option>
                            <option value="NoResponse">No Response</option>
                            <option value="Closed">Closed</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                        <textarea
                            rows={5}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Conversation summary, complaint details, next steps..."
                            style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                    </div>

                    {/* Satisfaction-survey integration — take the post-JC survey during the same call */}
                    <SurveyInlineBlock
                        followUp={followUp}
                        survey={survey}
                        busy={surveyBusy}
                        expanded={surveyExpanded}
                        onExpand={() => setSurveyExpanded(true)}
                        onCollapse={() => setSurveyExpanded(false)}
                        onCreate={createAndOpenSurvey}
                        onSaved={(r) => { setSurveyExpanded(false); setSurvey({ found: true, survey: { ...survey?.survey, ...r, Status: 'Responded' } }); }}
                        onError={(m) => setErr(m)}
                    />

                    {followUp.ContactedAt && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 14 }}>
                            Last contacted by <strong>{followUp.ContactedByName}</strong> on {new Date(followUp.ContactedAt).toLocaleString()}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
                        <button className="btn-sm" onClick={() => save(false)} disabled={busy || !complaintReady}>
                            <Save size={14} /> Save Notes
                        </button>
                        <button className="btn" onClick={() => save(true)} disabled={busy || !complaintReady} style={{ background: needsComplaint ? '#b91c1c' : '#15803d' }}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {needsComplaint ? 'Mark Contacted + File Complaint' : 'Mark Contacted'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CRDFollowUps() {
    const [rows, setRows]   = useState([]);
    const [stats, setStats] = useState({});
    const [statusFilter, setStatusFilter] = useState('Pending');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [openItem, setOpenItem] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (search) params.search = search;
            const [r1, r2] = await Promise.all([
                axios.get(`${API_BASE}/crd/follow-ups`, { params }),
                axios.get(`${API_BASE}/crd/follow-ups/stats`)
            ]);
            setRows(r1.data);
            setStats(r2.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [statusFilter, search]);

    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">CRD Follow-Ups</h1>
                    <p className="page-subtitle">Customer satisfaction queue. Auto-created when a Job Card is finalized (due next day).</p>
                </div>
                <button className="btn" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Refresh
                </button>
            </div>

            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <KPI label="Overdue"    value={stats.Overdue}    icon={AlertTriangle} color="#dc2626" />
                <KPI label="Due Today"  value={stats.DueToday}   icon={Clock}         color="#b45309" />
                <KPI label="Upcoming"   value={stats.Upcoming}   icon={Phone}         color="#1e40af" />
                <KPI label="Contacted"  value={stats.Contacted}  icon={CheckCircle2}  color="#15803d" />
                <KPI label="No Resp."   value={stats.NoResponse} icon={MessageCircle} color="#dc2626" />
                <KPI label="Closed"     value={stats.Closed}     icon={CheckCircle2}  color="#475569" />
            </div>

            {/* Filter bar */}
            <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="search-box" style={{ width: 260, display: 'flex', alignItems: 'center', gap: 8, background: 'white', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, height: 38 }}>
                    <Search size={16} />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search customer, JC, phone, vehicle..."
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Contacted">Contacted</option>
                    <option value="NoResponse">No Response</option>
                    <option value="Closed">Closed</option>
                </select>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} follow-ups</div>
            </div>

            {/* List */}
            <div className="card">
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <Headphones size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>
                            {loading ? 'Loading...' : 'No follow-ups match the filter.'}
                        </div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Customer</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Job Card</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Vehicle</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Phone</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Due</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Outcome</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const overdue = r.Status === 'Pending' && r.DaysOverdue > 0;
                                    return (
                                        <tr key={r.FollowUpID}
                                            onClick={() => setOpenItem(r)}
                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: overdue ? '#fef2f2' : 'transparent' }}
                                            onMouseEnter={e => { if (!overdue) e.currentTarget.style.background = '#f8fafc'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = overdue ? '#fef2f2' : 'transparent'; }}
                                        >
                                            <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                                                {r.CustomerName}
                                                {r.PartyName && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.PartyName}</div>}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#475569' }}>
                                                <Link to={`/workshop/jobs/${r.JobCardID}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                                                    {r.JobCardNo}
                                                </Link>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>{r.VehicleRegNo || '—'}</td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                {r.PhoneOne ? <a href={`tel:${r.PhoneOne}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--primary)' }}>{r.PhoneOne}</a> : '—'}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {new Date(r.DueDate).toLocaleDateString()}
                                                {overdue && (
                                                    <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600 }}>
                                                        {r.DaysOverdue}d overdue
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}><StatusBadge status={r.Status} /></td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <OutcomeBadge outcome={r.Outcome} />
                                                {r.LinkedComplaintNo && (
                                                    <Link to={`/cro/complaints/${r.LinkedComplaintID}`}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ display: 'block', fontSize: '0.7rem', color: '#b91c1c', textDecoration: 'underline', marginTop: 2 }}>
                                                        → {r.LinkedComplaintNo}
                                                    </Link>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                                                <Phone size={14} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {openItem && (
                <ContactModal
                    followUp={openItem}
                    onClose={() => setOpenItem(null)}
                    onSaved={load}
                />
            )}

            <style>{`
                .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
                .modal-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
                .modal-header { padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; }
                .modal-header button { background: transparent; border: none; cursor: pointer; }
            `}</style>
        </div>
    );
}
