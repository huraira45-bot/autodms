/**
 * CRO Campaigns — list, build, preview, send.
 *
 * Workflow:
 *   1. Click "+ New Campaign" → build modal opens with segment-rule builder
 *   2. Adjust rules → click "Preview" → see count + 10-sample
 *   3. Add message template (with {{name}}, {{brand}}, {{vehicle}} variables)
 *   4. Save as Draft (or schedule for later)
 *   5. From the list, click "Send Now" — backend runs throttled in background
 *   6. Watch the status row update; click into detail to see per-recipient sends
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Megaphone, Plus, RefreshCw, Loader2, Search, XCircle, Send,
    Eye, Pencil, Trash2, Pause, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api';

const STATUS_STYLE = {
    Draft:     { bg: '#e2e8f0', col: '#475569' },
    Scheduled: { bg: '#e0e7ff', col: '#3730a3' },
    Sending:   { bg: '#fef3c7', col: '#92400e' },
    Sent:      { bg: '#dcfce7', col: '#15803d' },
    Cancelled: { bg: '#fee2e2', col: '#b91c1c' },
    Failed:    { bg: '#fee2e2', col: '#b91c1c' },
};

export default function CampaignsAdmin() {
    const { hasModule } = useAuth();
    const { confirm: confirmAction } = useFeedback();
    const canEdit = hasModule('cro_admin');

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showBuild, setShowBuild] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [detailItem, setDetailItem] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (search)       params.search = search;
            const r = await axios.get(`${API}/cro/campaigns`, { params });
            setRows(r.data);
        } catch { /* noop */ }
        setLoading(false);
    }, [statusFilter, search]);

    useEffect(() => { load(); }, [load]);
    // Refresh every 5s while any campaign is Sending so the progress is visible
    useEffect(() => {
        if (!rows.some(r => r.Status === 'Sending')) return;
        const t = setInterval(load, 5000);
        return () => clearInterval(t);
    }, [rows, load]);

    const sendNow = async (id) => {
        const ok = await confirmAction({
            title: 'Start campaign send?',
            message: 'This starts the campaign sending process. In real mode it invokes the WhatsApp provider.',
            confirmLabel: 'Send now',
            tone: 'warning'
        });
        if (!ok) return;
        try { await axios.post(`${API}/cro/campaigns/${id}/send-now`); flash('ok', 'Send started — refreshing'); setTimeout(load, 1500); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };
    const cancel = async (id) => {
        const ok = await confirmAction({
            title: 'Cancel campaign?',
            message: 'Cancelled campaigns stop sending and cannot continue.',
            confirmLabel: 'Cancel campaign',
            tone: 'warning'
        });
        if (!ok) return;
        try { await axios.post(`${API}/cro/campaigns/${id}/cancel`); flash('ok', 'Cancelled'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };
    const remove = async (id) => {
        const ok = await confirmAction({
            title: 'Delete draft campaign?',
            message: 'This permanently deletes the draft campaign.',
            confirmLabel: 'Delete',
            tone: 'danger'
        });
        if (!ok) return;
        try { await axios.delete(`${API}/cro/campaigns/${id}`); flash('ok', 'Deleted'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Campaigns</h1>
                    <p className="page-subtitle">Bulk WhatsApp blasts to segmented customers — pick a rule, preview the recipient count, fill the template, send.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canEdit && (
                        <button className="btn" onClick={() => setShowBuild(true)}>
                            <Plus size={16} /> New Campaign
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
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name…"
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Sending">Sending</option>
                    <option value="Sent">Sent</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Failed">Failed</option>
                </select>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} campaigns</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <Megaphone size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No campaigns yet. Click + New Campaign to start.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Name</Th><Th>Channel</Th><Th>Status</Th>
                                <Th align="right">Recipients</Th><Th align="right">Sent</Th><Th align="right">Responded</Th>
                                <Th>Created</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const sty = STATUS_STYLE[r.Status] || STATUS_STYLE.Draft;
                                const progress = r.TotalRecipients ? Math.round((r.SentCount || 0) / r.TotalRecipients * 100) : 0;
                                return (
                                    <tr key={r.CampaignID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td mono color="#475569">#{r.CampaignID}</Td>
                                        <Td><div style={{ fontWeight: 500 }}>{r.Name}</div></Td>
                                        <Td>{r.Channel}</Td>
                                        <Td>
                                            <span style={{ background: sty.bg, color: sty.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{r.Status}</span>
                                            {r.Status === 'Sending' && <div style={{ marginTop: 4, height: 4, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                                                <div style={{ width: `${progress}%`, height: '100%', background: '#1e40af' }} />
                                            </div>}
                                        </Td>
                                        <Td align="right">{r.TotalRecipients ?? '—'}</Td>
                                        <Td align="right" style={{ color: '#15803d', fontWeight: 600 }}>{r.SentCount ?? 0}</Td>
                                        <Td align="right" style={{ color: '#1e40af' }}>{r.RespondedCount ?? 0}</Td>
                                        <Td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                            {new Date(r.CreatedAt).toLocaleDateString()}<br />
                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.CreatedByName}</span>
                                        </Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn-icon" onClick={() => setDetailItem(r)} title="View details"><Eye size={14} /></button>
                                                {canEdit && ['Draft', 'Scheduled'].includes(r.Status) && (
                                                    <>
                                                        <button className="btn-icon" onClick={() => setEditItem(r)} title="Edit"><Pencil size={14} /></button>
                                                        <button className="btn-icon" onClick={() => sendNow(r.CampaignID)} title="Send now" style={{ color: '#15803d' }}><Send size={14} /></button>
                                                    </>
                                                )}
                                                {canEdit && ['Scheduled', 'Sending'].includes(r.Status) && (
                                                    <button className="btn-icon" onClick={() => cancel(r.CampaignID)} title="Cancel" style={{ color: '#b45309' }}><Pause size={14} /></button>
                                                )}
                                                {canEdit && r.Status === 'Draft' && (
                                                    <button className="btn-icon" onClick={() => remove(r.CampaignID)} title="Delete" style={{ color: '#b91c1c' }}><Trash2 size={14} /></button>
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

            {(showBuild || editItem) && (
                <CampaignBuilder
                    item={editItem}
                    onClose={() => { setShowBuild(false); setEditItem(null); }}
                    onSaved={() => { setShowBuild(false); setEditItem(null); flash('ok', 'Saved'); load(); }}
                />
            )}
            {detailItem && (
                <CampaignDetail
                    campaignId={detailItem.CampaignID}
                    onClose={() => setDetailItem(null)}
                />
            )}
        </div>
    );
}

function CampaignBuilder({ item, onClose, onSaved }) {
    const isEdit = !!item;
    const [name, setName]         = useState(item?.Name || '');
    const [channel, setChannel]   = useState(item?.Channel || 'WhatsApp');
    const [vehicleBrand, setVehicleBrand]   = useState('');
    const [vehicleCode, setVehicleCode]     = useState('');
    const [noJCSinceDays, setNoJCSinceDays] = useState('');
    const [hasJCEver, setHasJCEver]         = useState('any');
    const [limit, setLimit]                 = useState(1000);
    const [messageTemplate, setMessageTemplate] = useState(item?.MessageTemplate || 'Hi {{name}}, your {{brand}} service is due. Reply YES to book.');
    const [templateSid, setTemplateSid]     = useState(item?.TemplateSid || '');
    const [scheduledAt, setScheduledAt]     = useState(item?.ScheduledAt ? item.ScheduledAt.slice(0, 16) : '');
    const [preview, setPreview]             = useState(null);
    const [busy, setBusy]                   = useState(false);
    const [err, setErr]                     = useState(null);

    // Load existing rules on edit
    useEffect(() => {
        if (!item?.CampaignID) return;
        axios.get(`${API}/cro/campaigns/${item.CampaignID}`).then(r => {
            const rules = safeJSON(r.data.SegmentRulesJSON);
            setVehicleBrand(rules.vehicleBrand || '');
            setVehicleCode(rules.vehicleCode || '');
            setNoJCSinceDays(rules.noJCSinceDays || '');
            setHasJCEver(rules.hasJCEver === true ? 'yes' : rules.hasJCEver === false ? 'no' : 'any');
            setLimit(rules.limit || 1000);
        }).catch(() => {});
    }, [item?.CampaignID]);

    const buildRules = () => {
        const r = {};
        if (vehicleBrand.trim())  r.vehicleBrand = vehicleBrand.trim();
        if (vehicleCode.trim())   r.vehicleCode  = vehicleCode.trim();
        if (noJCSinceDays && parseInt(noJCSinceDays) > 0) r.noJCSinceDays = parseInt(noJCSinceDays);
        if (hasJCEver === 'yes')  r.hasJCEver = true;
        if (hasJCEver === 'no')   r.hasJCEver = false;
        if (limit) r.limit = parseInt(limit);
        return r;
    };

    const doPreview = async () => {
        setBusy(true); setErr(null);
        try {
            const r = await axios.post(`${API}/cro/campaigns/preview`, { SegmentRules: buildRules() });
            setPreview(r.data);
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const save = async () => {
        if (!name.trim()) { setErr('Name is required'); return; }
        if (!messageTemplate.trim() && !templateSid.trim()) { setErr('Provide a message template or a TemplateSid'); return; }
        setBusy(true); setErr(null);
        try {
            const body = {
                Name: name.trim(), Channel: channel,
                SegmentRules: buildRules(),
                MessageTemplate: messageTemplate.trim() || null,
                TemplateSid: templateSid.trim() || null,
                ScheduledAt: scheduledAt || null,
            };
            if (isEdit) await axios.put(`${API}/cro/campaigns/${item.CampaignID}`, body);
            else        await axios.post(`${API}/cro/campaigns`, body);
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={isEdit ? `Edit campaign #${item.CampaignID}` : 'New campaign'} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <Field label="Name *"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. June 2026 — Toyota service reminder" /></Field>
            <Field label="Channel"><select value={channel} onChange={e => setChannel(e.target.value)} style={inputStyle}><option>WhatsApp</option><option>SMS</option></select></Field>

            <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>Segment rules</div>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Field label="Vehicle brand" flex><input value={vehicleBrand} onChange={e => setVehicleBrand(e.target.value)} placeholder="e.g. Changan, Toyota, suzuki" style={inputStyle} /></Field>
                    <Field label="Vehicle code" flex><input value={vehicleCode} onChange={e => setVehicleCode(e.target.value)} placeholder="e.g. CT, BP" style={inputStyle} /></Field>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Field label="No JC in last N days" flex><input type="number" value={noJCSinceDays} onChange={e => setNoJCSinceDays(e.target.value)} placeholder="e.g. 90" style={inputStyle} /></Field>
                    <Field label="Has any past JC?" flex>
                        <select value={hasJCEver} onChange={e => setHasJCEver(e.target.value)} style={inputStyle}>
                            <option value="any">Any</option>
                            <option value="yes">Yes (existing customers only)</option>
                            <option value="no">No (never serviced with us)</option>
                        </select>
                    </Field>
                    <Field label="Max recipients" flex><input type="number" value={limit} onChange={e => setLimit(e.target.value)} style={inputStyle} /></Field>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <button onClick={doPreview} disabled={busy} className="btn-sm"><Eye size={14} /> Preview match</button>
                    {preview && (
                        <span style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 600 }}>
                            <Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                            {preview.count} customer{preview.count === 1 ? '' : 's'} match
                            {preview.cappedCount < preview.count && <span style={{ color: '#b45309' }}> · capped to {preview.cappedCount}</span>}
                        </span>
                    )}
                </div>
                {preview?.sample?.length > 0 && (
                    <div style={{ marginTop: 8, padding: 8, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.78rem', maxHeight: 140, overflowY: 'auto' }}>
                        {preview.sample.map(s => (
                            <div key={s.ProfileID} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <span>{s.endUserName} · {s.BrandName} · {s.RegistrationNo || '—'}</span>
                                <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{s.PhoneNo}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Field label="Message template (use {{name}}, {{brand}}, {{vehicle}})">
                <textarea rows={3} value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>
            <Field label="Twilio Template SID (optional — required for approved WhatsApp templates)">
                <input value={templateSid} onChange={e => setTemplateSid(e.target.value)} placeholder="HXxxxxxx (from Twilio Content Builder)" style={inputStyle} />
            </Field>
            <Field label="Schedule for (optional — leave blank for Draft)">
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inputStyle} />
            </Field>

            <Actions onCancel={onClose} onConfirm={save} confirmLabel={isEdit ? 'Save' : 'Create'} busy={busy} disabled={!name.trim()} />
        </Shell>
    );
}

function CampaignDetail({ campaignId, onClose }) {
    const [camp, setCamp] = useState(null);
    const [sends, setSends] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [a, b] = await Promise.all([
                axios.get(`${API}/cro/campaigns/${campaignId}`),
                axios.get(`${API}/cro/campaigns/${campaignId}/sends`, { params: { limit: 200 } }),
            ]);
            setCamp(a.data); setSends(b.data);
        } catch { /* noop */ }
        setLoading(false);
    }, [campaignId]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (camp?.Status !== 'Sending') return;
        const t = setInterval(load, 4000);
        return () => clearInterval(t);
    }, [camp?.Status, load]);

    return (
        <Shell title={camp ? `Campaign #${camp.CampaignID} — ${camp.Name}` : 'Campaign'} onClose={onClose} width={720}>
            {loading || !camp ? <Loader2 className="animate-spin" /> : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <Stat label="Recipients" value={camp.stats?.TotalQueued ?? camp.TotalRecipients} />
                        <Stat label="Delivered"  value={camp.stats?.Delivered}  color="#15803d" />
                        <Stat label="Failed"     value={camp.stats?.Failed}     color="#b91c1c" />
                        <Stat label="Responded"  value={camp.stats?.Responded}  color="#1e40af" />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Message template</div>
                        <div style={{ marginTop: 4, padding: 8, background: '#f8fafc', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'monospace' }}>
                            {camp.MessageTemplate || `(template SID: ${camp.TemplateSid})`}
                        </div>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Sends ({sends.length})</div>
                    <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead><tr style={{ background: '#f8fafc' }}>
                                <Th>Customer</Th><Th>Phone</Th><Th>Status</Th><Th>Sent</Th><Th>Error</Th>
                            </tr></thead>
                            <tbody>
                                {sends.map(s => (
                                    <tr key={s.SendID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td>{s.CustomerName || '—'}</Td>
                                        <Td mono>{s.ContactPhone}</Td>
                                        <Td><span style={{ color: s.DeliveryStatus === 'Failed' ? '#b91c1c' : s.DeliveryStatus === 'Sent' ? '#15803d' : '#475569' }}>{s.DeliveryStatus}</span></Td>
                                        <Td style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.SentAt ? new Date(s.SentAt).toLocaleString() : '—'}</Td>
                                        <Td style={{ fontSize: '0.7rem', color: '#b91c1c' }}>{s.ErrorMessage || ''}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            <div style={{ marginTop: 14, textAlign: 'right' }}>
                <button className="btn-sm" onClick={onClose}>Close</button>
            </div>
        </Shell>
    );
}

function Stat({ label, value, color = '#475569' }) {
    return (
        <div style={{ padding: 10, border: '1px solid #e2e8f0', borderRadius: 6, background: 'white' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '1.3rem', color }}>{value ?? '—'}</div>
        </div>
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
function Shell({ title, onClose, children, width = 580 }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 10, width, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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
    <td style={{ padding: '8px 12px', textAlign: align, fontFamily: mono ? 'monospace' : undefined, color, ...style }}>{children}</td>
);

function safeJSON(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
