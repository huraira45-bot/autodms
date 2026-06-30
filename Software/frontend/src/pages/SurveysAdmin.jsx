/**
 * Admin Surveys — list + actions.
 *
 * Capabilities:
 *   - Filter by status / type / search
 *   - Open the public link in a new tab (to QA the customer experience)
 *   - Copy the public link to clipboard (so CRO agent can paste into WhatsApp/SMS)
 *   - "Mark Sent" once dispatched
 *   - Capture-by-phone modal (CRO officer fills the form during a call)
 *   - Cancel a survey
 *
 * Gated by cro_workspace / cro_admin / cro_reports.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    ClipboardList, RefreshCw, Loader2, Search, Send, Copy, ExternalLink,
    XCircle, Phone, Star, MessageSquare, Plus, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SurveyCapturePanel from '../components/SurveyCapturePanel';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api';

const STATUS_STYLE = {
    Triggered: { bg: '#fef3c7', col: '#92400e' },
    Sent:      { bg: '#dbeafe', col: '#1e40af' },
    Responded: { bg: '#dcfce7', col: '#15803d' },
    Expired:   { bg: '#fee2e2', col: '#b91c1c' },
    Cancelled: { bg: '#e2e8f0', col: '#475569' },
};

const TYPE_LABEL = {
    PostJobCard:   'Post Job Card',
    PostComplaint: 'Post Complaint',
    PostCampaign:  'Post Campaign',
};

function StatusBadge({ s }) {
    const sty = STATUS_STYLE[s] || STATUS_STYLE.Triggered;
    return <span style={{ background: sty.bg, color: sty.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>{s}</span>;
}

export default function SurveysAdmin() {
    const { hasModule } = useAuth();
    const { confirm: confirmAction } = useFeedback();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [search, setSearch] = useState('');
    const [captureItem, setCaptureItem] = useState(null);
    const [editItem, setEditItem]       = useState(null);
    const [showCreate, setShowCreate]   = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (typeFilter) params.type = typeFilter;
            if (search) params.search = search;
            const r = await axios.get(`${API}/cro/surveys`, { params });
            setRows(r.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [statusFilter, typeFilter, search]);

    useEffect(() => { load(); }, [load]);

    const copyLink = async (id) => {
        try {
            const r = await axios.get(`${API}/cro/surveys/${id}`);
            const tok = r.data.ResponseToken;
            const url = `${window.location.origin}/survey/${tok}`;
            await navigator.clipboard.writeText(url);
            flash('ok', 'Link copied to clipboard');
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const openLink = async (id) => {
        try {
            const r = await axios.get(`${API}/cro/surveys/${id}`);
            window.open(`${window.location.origin}/survey/${r.data.ResponseToken}`, '_blank');
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const markSent = async (id) => {
        try {
            await axios.post(`${API}/cro/surveys/${id}/mark-sent`, { SentVia: 'Manual' });
            flash('ok', 'Marked sent');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const deleteSurvey = async (id) => {
        const ok = await confirmAction({
            title: 'Delete survey?',
            message: 'This permanently deletes the survey row and cannot be undone.',
            confirmLabel: 'Delete',
            tone: 'danger'
        });
        if (!ok) return;
        try {
            await axios.delete(`${API}/cro/surveys/${id}`);
            flash('ok', 'Deleted');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const cancelSurvey = async (id) => {
        const ok = await confirmAction({
            title: 'Cancel survey?',
            message: 'The customer will no longer be able to respond to this survey.',
            confirmLabel: 'Cancel survey',
            tone: 'warning'
        });
        if (!ok) return;
        try {
            await axios.post(`${API}/cro/surveys/${id}/cancel`);
            flash('ok', 'Cancelled');
            await load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Surveys</h1>
                    <p className="page-subtitle">Post-JC + post-Complaint feedback. Send a link, or capture answers over a phone call.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {(hasModule('cro_workspace') || hasModule('cro_admin')) && (
                        <button className="btn" onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> Create Survey
                        </button>
                    )}
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            </div>

            {msg && (
                <div style={{ padding: 10, borderRadius: 8, fontSize: '0.875rem',
                    background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
                    color:      msg.kind === 'ok' ? '#15803d' : '#b91c1c',
                    border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca') }}>
                    {msg.text}
                </div>
            )}

            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, height: 38, minWidth: 240 }}>
                    <Search size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search JC#, complaint#, phone…"
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All statuses</option>
                    <option value="Triggered">Triggered</option>
                    <option value="Sent">Sent</option>
                    <option value="Responded">Responded</option>
                    <option value="Expired">Expired</option>
                    <option value="Cancelled">Cancelled</option>
                </select>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All types</option>
                    <option value="PostJobCard">Post Job Card</option>
                    <option value="PostComplaint">Post Complaint</option>
                </select>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} surveys</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <ClipboardList size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No surveys match the filter.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Type</Th><Th>Source</Th><Th>Advisor</Th>
                                <Th>Phone</Th><Th>Status</Th><Th align="right">Rating</Th>
                                <Th align="right">Triggered</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.SurveyID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td mono color="#475569">#{r.SurveyID}</Td>
                                    <Td>{TYPE_LABEL[r.SurveyType] || r.SurveyType}</Td>
                                    <Td mono color="#475569">{r.JobCardNo || r.ComplaintNo || '—'}</Td>
                                    <Td>{r.ServiceAdvisorName ? r.ServiceAdvisorName.trim() : <span style={{ color: '#94a3b8' }}>—</span>}</Td>
                                    <Td mono>{r.ContactPhone || '—'}</Td>
                                    <Td><StatusBadge s={r.Status} /></Td>
                                    <Td align="right">
                                        {r.OverallRating != null ? (
                                            <span style={{ color: '#92400e', fontWeight: 600 }}>
                                                <Star size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} fill="#f59e0b" />
                                                {r.OverallRating}
                                            </span>
                                        ) : '—'}
                                    </Td>
                                    <Td align="right" style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {new Date(r.TriggeredAt).toLocaleDateString()}
                                    </Td>
                                    <Td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {r.Status !== 'Responded' && r.Status !== 'Cancelled' && (
                                                <>
                                                    <button onClick={() => copyLink(r.SurveyID)} title="Copy public link" className="btn-icon"><Copy size={14} /></button>
                                                    <button onClick={() => openLink(r.SurveyID)} title="Open public link" className="btn-icon"><ExternalLink size={14} /></button>
                                                    {r.Status === 'Triggered' && (
                                                        <button onClick={() => markSent(r.SurveyID)} title="Mark sent" className="btn-icon"><Send size={14} /></button>
                                                    )}
                                                    {(hasModule('cro_workspace') || hasModule('cro_admin')) && (
                                                        <button onClick={() => setCaptureItem(r)} title="Capture by phone" className="btn-icon"><Phone size={14} /></button>
                                                    )}
                                                </>
                                            )}
                                            {/* Edit + delete are available in any state for cro_admin (delete) / cro_workspace (edit) */}
                                            {(hasModule('cro_workspace') || hasModule('cro_admin')) && (
                                                <button onClick={() => setEditItem(r)} title={r.Status === 'Responded' ? 'Edit responses' : 'Edit phone / expiry'} className="btn-icon" style={{ color: '#1e40af' }}><Pencil size={14} /></button>
                                            )}
                                            {hasModule('cro_admin') && r.Status !== 'Responded' && r.Status !== 'Cancelled' && (
                                                <button onClick={() => cancelSurvey(r.SurveyID)} title="Cancel" className="btn-icon" style={{ color: '#b45309' }}><XCircle size={14} /></button>
                                            )}
                                            {hasModule('cro_admin') && (
                                                <button onClick={() => deleteSurvey(r.SurveyID)} title="Delete permanently" className="btn-icon" style={{ color: '#b91c1c' }}><Trash2 size={14} /></button>
                                            )}
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {captureItem && (
                <CaptureModal item={captureItem}
                    onClose={() => setCaptureItem(null)}
                    onSaved={() => { setCaptureItem(null); flash('ok', 'Responses captured'); load(); }} />
            )}
            {showCreate && (
                <CreateModal
                    onClose={() => setShowCreate(false)}
                    onCreated={(out) => { setShowCreate(false); flash('ok', `Survey ${out.SurveyID} created`); load(); }} />
            )}
            {editItem && (
                <EditModal item={editItem}
                    onClose={() => setEditItem(null)}
                    onSaved={() => { setEditItem(null); flash('ok', 'Survey updated'); load(); }} />
            )}
        </div>
    );
}

function CreateModal({ onClose, onCreated }) {
    const [type, setType]         = useState('PostJobCard');
    const [jcId, setJcId]         = useState('');
    const [cmpId, setCmpId]       = useState('');
    const [phone, setPhone]       = useState('');
    const [ttl, setTtl]           = useState(30);
    const [busy, setBusy]         = useState(false);
    const [err, setErr]           = useState(null);

    const create = async () => {
        setBusy(true); setErr(null);
        try {
            const body = { SurveyType: type, TtlDays: Number(ttl) };
            if (type === 'PostJobCard') body.JobCardID = Number(jcId);
            else body.ComplaintID = Number(cmpId);
            if (phone) body.ContactPhone = phone;
            const r = await axios.post(`${API}/cro/surveys`, body);
            onCreated(r.data);
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const valid = (type === 'PostJobCard' ? !!jcId : !!cmpId);

    return (
        <ModalShell title="Create survey" onClose={onClose}>
            {err && <ErrBox>{err}</ErrBox>}
            <Field label="Type">
                <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                    <option value="PostJobCard">Post Job Card</option>
                    <option value="PostComplaint">Post Complaint</option>
                </select>
            </Field>
            {type === 'PostJobCard' ? (
                <Field label="Job Card ID *">
                    <input type="number" value={jcId} onChange={e => setJcId(e.target.value)} placeholder="e.g. 2006" style={inputStyle} />
                </Field>
            ) : (
                <Field label="Complaint ID *">
                    <input type="number" value={cmpId} onChange={e => setCmpId(e.target.value)} placeholder="e.g. 9" style={inputStyle} />
                </Field>
            )}
            <Field label="Contact phone (optional — defaults to JC/complaint contact)">
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="03001234567" style={inputStyle} />
            </Field>
            <Field label="Link expires in (days)">
                <input type="number" min={1} max={365} value={ttl} onChange={e => setTtl(e.target.value)} style={inputStyle} />
            </Field>
            <Actions onCancel={onClose} onConfirm={create} confirmLabel="Create" busy={busy} disabled={!valid} />
        </ModalShell>
    );
}

function EditModal({ item, onClose, onSaved }) {
    const [phone, setPhone]   = useState(item.ContactPhone || '');
    const [busy, setBusy]     = useState(false);
    const [err, setErr]       = useState(null);
    const isResponded = item.Status === 'Responded';

    const savePhone = async () => {
        setBusy(true); setErr(null);
        try {
            await axios.put(`${API}/cro/surveys/${item.SurveyID}`, { ContactPhone: phone });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <ModalShell title={`Edit survey #${item.SurveyID}`} onClose={onClose}>
            {err && <ErrBox>{err}</ErrBox>}
            <Field label="Contact phone">
                <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ marginTop: 4, marginBottom: 12, textAlign: 'right' }}>
                <button onClick={savePhone} disabled={busy}
                    style={{ padding: '6px 12px', background: '#475569', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                    {busy ? <Loader2 size={12} className="animate-spin" style={{ display: 'inline', verticalAlign: 'middle' }} /> : null} Save phone
                </button>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 8 }}>
                    {isResponded ? 'Edit responses' : 'Take responses now'}
                </div>
                <SurveyCapturePanel surveyId={item.SurveyID} compact onSaved={() => onSaved()} onError={setErr} />
            </div>

            <div style={{ marginTop: 14, textAlign: 'right' }}>
                <button onClick={onClose} className="btn-sm">Close</button>
            </div>
        </ModalShell>
    );
}

const inputStyle = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' };
function Field({ label, children }) { return (
    <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#475569' }}>{label}</label>
        {children}
    </div>
);}
function ErrBox({ children }) { return <div style={{ padding: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 10, fontSize: '0.85rem' }}>{children}</div>; }
function Actions({ onCancel, onConfirm, confirmLabel, busy, disabled }) {
    return (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
            <button onClick={onConfirm} disabled={busy || disabled}
                style={{ padding: '8px 16px', background: disabled ? '#cbd5e1' : '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.875rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : null} {confirmLabel}
            </button>
        </div>
    );
}
function ModalShell({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 10, width: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>{title}</div>
                    <button onClick={onClose} className="btn-icon"><XCircle size={18} /></button>
                </div>
                <div style={{ padding: 18 }}>{children}</div>
            </div>
        </div>
    );
}

function CaptureModal({ item, onClose, onSaved }) {
    const [survey, setSurvey] = useState(null);
    const [answers, setAnswers] = useState({});
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/cro/surveys/${item.SurveyID}`);
                setSurvey(r.data);
                setAnswers({});
            } catch (e) { setErr(e.response?.data?.error || e.message); }
        })();
    }, [item.SurveyID]);

    const questions = survey ? JSON.parse(survey.QuestionsJSON || '[]') : [];

    const allRequired = (() => {
        for (const q of questions) {
            if (q.type === 'text') continue;
            if (answers[q.id] === undefined || answers[q.id] === '') return false;
        }
        return questions.length > 0;
    })();

    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const responses = questions.map(q => ({ id: q.id, answer: answers[q.id] ?? '' }));
            await axios.post(`${API}/cro/surveys/${item.SurveyID}/capture`, { responses });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 10, width: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 700 }}>Capture by phone — Survey #{item.SurveyID}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{TYPE_LABEL[item.SurveyType]} · {item.JobCardNo || item.ComplaintNo}</div>
                    </div>
                    <button onClick={onClose} className="btn-icon"><XCircle size={18} /></button>
                </div>
                <div style={{ padding: 18 }}>
                    {err && <div style={{ padding: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>{err}</div>}
                    {!survey ? <Loader2 size={20} className="animate-spin" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {questions.map((q, i) => (
                                <div key={q.id}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
                                        {i + 1}. {q.text}
                                        {q.type !== 'text' && <span style={{ color: '#dc2626' }}> *</span>}
                                    </div>
                                    {q.type === 'rating' && (
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {Array.from({ length: q.scale || 5 }, (_, i) => i + 1).map(n => {
                                                const active = Number(answers[q.id]) >= n;
                                                return (
                                                    <button key={n} type="button" onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}
                                                        style={{ flex: 1, padding: 8, border: '2px solid ' + (active ? '#f59e0b' : '#e2e8f0'), background: active ? '#fef3c7' : 'white', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                                                        {n}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {q.type === 'yesno' && (
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {['yes', 'no'].map(v => {
                                                const active = answers[q.id] === v;
                                                const c = v === 'yes' ? '#15803d' : '#b91c1c';
                                                return (
                                                    <button key={v} type="button" onClick={() => setAnswers(a => ({ ...a, [q.id]: v }))}
                                                        style={{ flex: 1, padding: 8, border: '2px solid ' + (active ? c : '#e2e8f0'), background: active ? (v === 'yes' ? '#dcfce7' : '#fee2e2') : 'white', borderRadius: 6, fontWeight: 600, cursor: 'pointer', color: active ? c : '#475569' }}>
                                                        {v === 'yes' ? 'Yes' : 'No'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {q.type === 'text' && (
                                        <textarea rows={2} value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                                            style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.875rem', boxSizing: 'border-box' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn-sm" onClick={onClose}>Cancel</button>
                    <button className="btn" onClick={submit} disabled={busy || !allRequired} style={{ background: '#1e40af' }}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                        Save Responses
                    </button>
                </div>
            </div>
        </div>
    );
}

const Th = ({ children, align = 'left' }) => (
    <th style={{ padding: 10, textAlign: align, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{children}</th>
);
const Td = ({ children, align = 'left', mono, color, style = {} }) => (
    <td style={{ padding: '10px 12px', textAlign: align, fontFamily: mono ? 'monospace' : undefined, color, ...style }}>
        {children}
    </td>
);
