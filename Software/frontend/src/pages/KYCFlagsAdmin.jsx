/**
 * KYC Flags Register — list + create + acknowledge + resolve.
 *
 * Banner on the JobCardForm reads from `/active-for-chassis/:chasis` and
 * forces the Advisor to acknowledge before they can save the JC.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    ShieldAlert, Plus, RefreshCw, Loader2, Search, XCircle,
    CheckCircle2, Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api';

const TYPE_STYLE = {
    Chronic:     { bg: '#fee2e2', col: '#b91c1c' },
    PaymentRisk: { bg: '#fef3c7', col: '#92400e' },
    Aggressive:  { bg: '#fed7aa', col: '#9a3412' },
    VIP:         { bg: '#dbeafe', col: '#1e40af' },
    Other:       { bg: '#e2e8f0', col: '#475569' },
};

export default function KYCFlagsAdmin() {
    const { hasModule } = useAuth();
    const { confirm: confirmAction } = useFeedback();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openOnly, setOpenOnly] = useState(true);
    const [typeFilter, setTypeFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [resolveItem, setResolveItem] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (openOnly)   params.open = 1;
            if (typeFilter) params.type = typeFilter;
            if (search)     params.search = search;
            const r = await axios.get(`${API}/cro/kyc-flags`, { params });
            setRows(r.data);
        } catch { /* noop */ }
        setLoading(false);
    }, [openOnly, typeFilter, search]);

    useEffect(() => { load(); }, [load]);

    const remove = async (id) => {
        const ok = await confirmAction({
            title: 'Delete KYC flag?',
            message: 'This permanently removes the flag and its acknowledgments.',
            confirmLabel: 'Delete',
            tone: 'danger'
        });
        if (!ok) return;
        try { await axios.delete(`${API}/cro/kyc-flags/${id}`); flash('ok', 'Deleted'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">KYC Flag Register</h1>
                    <p className="page-subtitle">Tag chassis / customers requiring extra caution. Advisors see a banner on the JC form when a flagged chassis is entered, and must acknowledge before saving.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {(hasModule('cro_workspace') || hasModule('cro_admin')) && (
                        <button className="btn" onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> Raise Flag
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
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chassis / engine / notes…"
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All types</option>
                    <option value="Chronic">Chronic</option>
                    <option value="PaymentRisk">Payment Risk</option>
                    <option value="Aggressive">Aggressive</option>
                    <option value="VIP">VIP</option>
                    <option value="Other">Other</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} />
                    Open only
                </label>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} flags</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <ShieldAlert size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No flags.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Type</Th><Th>Chassis</Th><Th>Engine</Th>
                                <Th>Notes</Th><Th>Raised</Th><Th>Status</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const ts = TYPE_STYLE[r.FlagType] || TYPE_STYLE.Other;
                                const open = !r.ResolvedAt;
                                return (
                                    <tr key={r.FlagID} style={{ borderBottom: '1px solid #f1f5f9', background: open && r.FlagType === 'Chronic' ? '#fff7f7' : 'transparent' }}>
                                        <Td mono color="#475569">#{r.FlagID}</Td>
                                        <Td><span style={{ background: ts.bg, color: ts.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{r.FlagType}</span></Td>
                                        <Td mono>{r.ChasisNo || '—'}</Td>
                                        <Td mono>{r.EngineNo || '—'}</Td>
                                        <Td><div style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Notes}</div></Td>
                                        <Td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                            {r.FlaggedByName}<br />
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{new Date(r.FlaggedAt).toLocaleDateString()}</span>
                                        </Td>
                                        <Td>
                                            {open ? (
                                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>OPEN</span>
                                            ) : (
                                                <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>RESOLVED</span>
                                            )}
                                            {r.AckCount > 0 && <div style={{ fontSize: '0.7rem', color: '#1e40af', marginTop: 2 }}>{r.AckCount} ack</div>}
                                        </Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {open && hasModule('cro_admin') && (
                                                    <button className="btn-icon" onClick={() => setResolveItem(r)} title="Resolve"><CheckCircle2 size={14} style={{ color: '#15803d' }} /></button>
                                                )}
                                                {hasModule('cro_admin') && (
                                                    <button className="btn-icon" onClick={() => remove(r.FlagID)} title="Delete"><Trash2 size={14} style={{ color: '#b91c1c' }} /></button>
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
                <CreateFlagModal onClose={() => setShowCreate(false)}
                    onSaved={() => { setShowCreate(false); flash('ok', 'Flag raised'); load(); }} />
            )}
            {resolveItem && (
                <ResolveModal item={resolveItem}
                    onClose={() => setResolveItem(null)}
                    onSaved={() => { setResolveItem(null); flash('ok', 'Resolved'); load(); }} />
            )}
        </div>
    );
}

function CreateFlagModal({ onClose, onSaved }) {
    const [chasis, setChasis] = useState('');
    const [engine, setEngine] = useState('');
    const [type, setType]     = useState('Chronic');
    const [notes, setNotes]   = useState('');
    const [busy, setBusy]     = useState(false);
    const [err, setErr]       = useState(null);

    const save = async () => {
        if ((!chasis && !engine) || !notes.trim()) return;
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/cro/kyc-flags`, {
                ChasisNo: chasis || undefined,
                EngineNo: engine || undefined,
                FlagType: type,
                Notes: notes.trim(),
            });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title="Raise KYC Flag" onClose={onClose}>
            {err && <Err>{err}</Err>}
            <Field label="Chassis number (or fill engine number)">
                <input value={chasis} onChange={e => setChasis(e.target.value)} style={inputStyle} placeholder="e.g. ABC123XYZ" />
            </Field>
            <Field label="Engine number">
                <input value={engine} onChange={e => setEngine(e.target.value)} style={inputStyle} placeholder="optional" />
            </Field>
            <Field label="Flag type *">
                <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                    <option value="Chronic">Chronic — repeat problems / repeat complaints</option>
                    <option value="PaymentRisk">Payment Risk — slow payer / disputes</option>
                    <option value="Aggressive">Aggressive — abusive customer behavior</option>
                    <option value="VIP">VIP — high-priority handling</option>
                    <option value="Other">Other</option>
                </select>
            </Field>
            <Field label="Notes *">
                <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Specific incidents / handling instructions / what the next advisor should know"
                    style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Raise flag" busy={busy} disabled={(!chasis && !engine) || !notes.trim()} />
        </Shell>
    );
}

function ResolveModal({ item, onClose, onSaved }) {
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        if (!notes.trim()) return;
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/cro/kyc-flags/${item.FlagID}/resolve`, { ResolutionNotes: notes.trim() });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={`Resolve Flag #${item.FlagID}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 10 }}>
                <strong>{item.FlagType}</strong> · chassis <code>{item.ChasisNo || '—'}</code>
            </p>
            <Field label="Resolution notes *">
                <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Why are you resolving this? Was the issue handled, or no longer relevant?"
                    style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Resolve" busy={busy} disabled={!notes.trim()} />
        </Shell>
    );
}

const inputStyle = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' };
function Field({ label, children }) { return (
    <div style={{ marginBottom: 10 }}>
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
                style={{ padding: '8px 16px', background: disabled ? '#cbd5e1' : '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.875rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : null} {confirmLabel}
            </button>
        </div>
    );
}
function Shell({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 10, width: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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
