/**
 * CRO Inquiries — walk-in / phone / online questions that haven't become
 * either a JC or a complaint yet. Routes to department by category.
 * Convertable to a complaint or linkable to a JC.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
    MessageCircle, Plus, RefreshCw, Loader2, Search, XCircle,
    CheckCircle2, ArrowRight, Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api';

const CATEGORY_STYLE = {
    ServiceQuery:    { bg: '#fef3c7', col: '#92400e' },
    PartsPriceCheck: { bg: '#dbeafe', col: '#1e40af' },
    AccessoryQuery:  { bg: '#fed7aa', col: '#9a3412' },
    ProductInfo:     { bg: '#e0e7ff', col: '#3730a3' },
    Complaint:       { bg: '#fee2e2', col: '#b91c1c' },
    Other:           { bg: '#e2e8f0', col: '#475569' },
};

const STATUS_STYLE = {
    Open:       { bg: '#fef3c7', col: '#92400e' },
    InProgress: { bg: '#dbeafe', col: '#1e40af' },
    Resolved:   { bg: '#dcfce7', col: '#15803d' },
    Closed:     { bg: '#e2e8f0', col: '#475569' },
    Converted:  { bg: '#f3e8ff', col: '#6b21a8' },
};

export default function InquiriesAdmin() {
    const { hasModule } = useAuth();
    const { confirm: confirmAction } = useFeedback();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('Open');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [convertItem, setConvertItem] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter)   params.status = statusFilter;
            if (categoryFilter) params.category = categoryFilter;
            if (search)         params.search = search;
            const r = await axios.get(`${API}/cro/inquiries`, { params });
            setRows(r.data);
        } catch { /* noop */ }
        setLoading(false);
    }, [statusFilter, categoryFilter, search]);

    useEffect(() => { load(); }, [load]);

    const updateStatus = async (id, status) => {
        try { await axios.put(`${API}/cro/inquiries/${id}`, { Status: status }); flash('ok', `Set ${status}`); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const remove = async (id) => {
        const ok = await confirmAction({
            title: 'Delete inquiry?',
            message: 'This permanently removes the inquiry record.',
            confirmLabel: 'Delete',
            tone: 'danger'
        });
        if (!ok) return;
        try { await axios.delete(`${API}/cro/inquiries/${id}`); flash('ok', 'Deleted'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Inquiries</h1>
                    <p className="page-subtitle">Walk-in / phone / online questions before they become a JC or complaint. Routes to a department by category.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {(hasModule('cro_workspace') || hasModule('cro_admin')) && (
                        <button className="btn" onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> Log Inquiry
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
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subject / customer / phone…"
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All statuses</option>
                    <option value="Open">Open</option>
                    <option value="InProgress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Closed">Closed</option>
                    <option value="Converted">Converted</option>
                </select>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All categories</option>
                    <option value="ServiceQuery">Service Query</option>
                    <option value="PartsPriceCheck">Parts Price Check</option>
                    <option value="AccessoryQuery">Accessory Query</option>
                    <option value="ProductInfo">Product Info</option>
                    <option value="Complaint">Complaint</option>
                    <option value="Other">Other</option>
                </select>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} inquiries</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <MessageCircle size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No inquiries match.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Category</Th><Th>Subject</Th><Th>Customer</Th>
                                <Th>Routed to</Th><Th>Status</Th><Th>Linked</Th>
                                <Th align="right">Age</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const cat = CATEGORY_STYLE[r.Category] || CATEGORY_STYLE.Other;
                                const sta = STATUS_STYLE[r.Status] || STATUS_STYLE.Open;
                                return (
                                    <tr key={r.InquiryID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td mono color="#475569">#{r.InquiryID}</Td>
                                        <Td><span style={{ background: cat.bg, color: cat.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{r.Category}</span></Td>
                                        <Td>
                                            <div style={{ fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Subject}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.Source}</div>
                                        </Td>
                                        <Td>
                                            {r.ContactName}
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.ContactPhone}</div>
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem', color: '#475569' }}>{r.DepartmentName || '—'}</Td>
                                        <Td><span style={{ background: sta.bg, color: sta.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{r.Status}</span></Td>
                                        <Td>
                                            {r.LinkedComplaintNo && <Link to={`/cro/complaints/${r.LinkedComplaintID}`} style={{ color: '#b91c1c', textDecoration: 'underline', fontSize: '0.78rem' }}>{r.LinkedComplaintNo}</Link>}
                                            {r.LinkedJobCardNo && <div style={{ fontSize: '0.78rem', color: '#1e40af', fontFamily: 'monospace' }}>{r.LinkedJobCardNo}</div>}
                                            {!r.LinkedComplaintNo && !r.LinkedJobCardNo && '—'}
                                        </Td>
                                        <Td align="right" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{r.AgeHours}h</Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {['Open', 'InProgress'].includes(r.Status) && !r.LinkedComplaintID && (
                                                    <button className="btn-icon" title="Convert to complaint" onClick={() => setConvertItem(r)}>
                                                        <ArrowRight size={14} style={{ color: '#b91c1c' }} />
                                                    </button>
                                                )}
                                                {r.Status === 'Open' && (
                                                    <button className="btn-icon" title="Mark in progress" onClick={() => updateStatus(r.InquiryID, 'InProgress')}>
                                                        <RefreshCw size={14} />
                                                    </button>
                                                )}
                                                {['Open', 'InProgress'].includes(r.Status) && (
                                                    <button className="btn-icon" title="Mark resolved" onClick={() => updateStatus(r.InquiryID, 'Resolved')}>
                                                        <CheckCircle2 size={14} style={{ color: '#15803d' }} />
                                                    </button>
                                                )}
                                                {hasModule('cro_admin') && (
                                                    <button className="btn-icon" onClick={() => remove(r.InquiryID)} title="Delete"><Trash2 size={14} style={{ color: '#b91c1c' }} /></button>
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

            {showCreate && (
                <CreateInquiryModal onClose={() => setShowCreate(false)}
                    onSaved={() => { setShowCreate(false); flash('ok', 'Inquiry logged'); load(); }} />
            )}
            {convertItem && (
                <ConvertModal item={convertItem}
                    onClose={() => setConvertItem(null)}
                    onSaved={(out) => { setConvertItem(null); flash('ok', `Converted to ${out.ComplaintNo}`); load(); }} />
            )}
        </div>
    );
}

function CreateInquiryModal({ onClose, onSaved }) {
    const [category, setCategory] = useState('ServiceQuery');
    const [source, setSource]     = useState('Phone');
    const [subject, setSubject]   = useState('');
    const [body, setBody]         = useState('');
    const [name, setName]         = useState('');
    const [phone, setPhone]       = useState('');
    const [email, setEmail]       = useState('');
    const [busy, setBusy]         = useState(false);
    const [err, setErr]           = useState(null);

    const ready = subject.trim() && name.trim() && phone.trim();
    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/cro/inquiries`, {
                Category: category, Source: source,
                Subject: subject.trim(), Body: body.trim() || undefined,
                ContactName: name.trim(), ContactPhone: phone.trim(),
                ContactEmail: email.trim() || undefined,
            });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title="Log Inquiry" onClose={onClose}>
            {err && <Err>{err}</Err>}
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <Field label="Category *" flex>
                    <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                        <option value="ServiceQuery">Service Query → After Sale</option>
                        <option value="PartsPriceCheck">Parts Price Check → Parts</option>
                        <option value="AccessoryQuery">Accessory Query → Accessories</option>
                        <option value="ProductInfo">Product Info → Sales</option>
                        <option value="Complaint">Complaint → CRO</option>
                        <option value="Other">Other → CRO triage</option>
                    </select>
                </Field>
                <Field label="Source *" flex>
                    <select value={source} onChange={e => setSource(e.target.value)} style={inputStyle}>
                        <option value="Phone">Phone</option>
                        <option value="WalkIn">Walk-In</option>
                        <option value="Online">Online</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Email">Email</option>
                    </select>
                </Field>
            </div>
            <Field label="Subject *"><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="One-line summary" style={inputStyle} /></Field>
            <Field label="Details"><textarea rows={3} value={body} onChange={e => setBody(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Customer Name *" flex><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
                <Field label="Phone *" flex><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></Field>
            </div>
            <Field label="Email"><input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Log" busy={busy} disabled={!ready} />
        </Shell>
    );
}

function ConvertModal({ item, onClose, onSaved }) {
    const [jcId, setJcId] = useState('');
    const [type, setType] = useState('Service');
    const [sev, setSev]   = useState('Normal');
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);

    const save = async () => {
        if (!jcId) return;
        setBusy(true); setErr(null);
        try {
            const r = await axios.post(`${API}/cro/inquiries/${item.InquiryID}/convert-to-complaint`, {
                JobCardID: Number(jcId), ComplaintType: type, Severity: sev,
            });
            onSaved(r.data);
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={`Convert inquiry #${item.InquiryID} to complaint`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 10 }}>
                <strong>{item.Subject}</strong><br />
                Customer: {item.ContactName} ({item.ContactPhone})
            </p>
            <Field label="Job Card ID * (complaint must reference a JC, decision #1)">
                <input type="number" value={jcId} onChange={e => setJcId(e.target.value)} placeholder="e.g. 2006" style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Type" flex>
                    <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                        <option value="Service">Service</option>
                        <option value="Product">Product</option>
                    </select>
                </Field>
                <Field label="Severity" flex>
                    <select value={sev} onChange={e => setSev(e.target.value)} style={inputStyle}>
                        <option value="Low">Low</option>
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                    </select>
                </Field>
            </div>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Convert" busy={busy} disabled={!jcId} />
        </Shell>
    );
}

const inputStyle = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' };
function Field({ label, children, flex }) { return (
    <div style={{ marginBottom: 10, flex: flex ? 1 : undefined }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#475569' }}>{label}</label>
        {children}
    </div>
);}
function Err({ children }) { return <div style={{ padding: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 10, fontSize: '0.85rem' }}>{children}</div>; }
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
function Shell({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 10, width: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>{title}</div>
                    <button onClick={onClose} className="btn-icon"><XCircle size={18} /></button>
                </div>
                <div style={{ padding: 18 }}>{children}</div>
            </div>
        </div>
    );
}
const Th = ({ children, align = 'left' }) => (
    <th style={{ padding: 10, textAlign: align, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{children}</th>
);
const Td = ({ children, align = 'left', mono, color, style = {} }) => (
    <td style={{ padding: '10px 12px', textAlign: align, fontFamily: mono ? 'monospace' : undefined, color, ...style }}>{children}</td>
);
