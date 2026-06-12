/**
 * Service Reminders — daily queue for the CRO team.
 *
 * Reminders are auto-generated when a JC is finalized; the daily 09:00 cron
 * flips them Scheduled → Sent on their DueDate. The CRO officer works the
 * Sent list, calls customers, marks Acknowledged or Booked.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Bell, RefreshCw, Loader2, Search, Phone, CheckCircle2, Calendar,
    XCircle, Wrench, ZapOff, Hammer,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = '/api';

const STATUS_STYLE = {
    Scheduled:    { bg: '#e0e7ff', col: '#3730a3' },
    Sent:         { bg: '#fef3c7', col: '#92400e' },
    Acknowledged: { bg: '#dbeafe', col: '#1e40af' },
    Booked:       { bg: '#dcfce7', col: '#15803d' },
    Cancelled:    { bg: '#e2e8f0', col: '#475569' },
};
const TYPE_STYLE = {
    FFS:     { bg: '#fef3c7', col: '#92400e', label: 'First Free Service' },
    SFS:     { bg: '#fed7aa', col: '#9a3412', label: 'Second Free Service' },
    REGULAR: { bg: '#e0e7ff', col: '#3730a3', label: 'Regular Service' },
};

export default function RemindersAdmin() {
    const { hasModule } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('Sent');
    const [typeFilter, setTypeFilter] = useState('');
    const [search, setSearch] = useState('');
    const [bookItem, setBookItem] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (typeFilter)   params.type = typeFilter;
            if (search)       params.search = search;
            const r = await axios.get(`${API}/cro/reminders`, { params });
            setRows(r.data);
        } catch { /* noop */ }
        setLoading(false);
    }, [statusFilter, typeFilter, search]);

    useEffect(() => { load(); }, [load]);

    const acknowledge = async (id) => {
        try { await axios.post(`${API}/cro/reminders/${id}/acknowledge`); flash('ok', 'Acknowledged'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const cancel = async (id) => {
        if (!window.confirm('Cancel this reminder? It will not be re-sent.')) return;
        try { await axios.post(`${API}/cro/reminders/${id}/cancel`); flash('ok', 'Cancelled'); load(); }
        catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const regenerate = async () => {
        if (!window.confirm('Back-fill reminders for finalized JCs without one? Up to 500 at a time.')) return;
        try {
            const r = await axios.post(`${API}/cro/reminders/regenerate`);
            flash('ok', `Evaluated ${r.data.evaluated}, created ${r.data.created} reminders`);
            load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const fireTick = async () => {
        try {
            const r = await axios.post(`${API}/cro/reminders/debug/tick`);
            flash('ok', `Cron fired — ${r.data.sent ?? 0} reminders marked Sent`);
            load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Service Reminders</h1>
                    <p className="page-subtitle">Upcoming-service queue. Auto-generated when a JC finalizes; flipped to "Sent" on the due date by the 09:00 cron. Work the Sent list — call the customer, book them in.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {hasModule('cro_admin') && (
                        <>
                            <button className="btn-sm" onClick={regenerate}>Back-fill</button>
                            <button className="btn-sm" onClick={fireTick}>Run cron now</button>
                        </>
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
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chassis, reg#, customer, JC#…"
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All statuses</option>
                    <option value="Scheduled">Scheduled (future)</option>
                    <option value="Sent">Sent (today / past)</option>
                    <option value="Acknowledged">Acknowledged</option>
                    <option value="Booked">Booked</option>
                    <option value="Cancelled">Cancelled</option>
                </select>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All types</option>
                    <option value="FFS">FFS</option>
                    <option value="SFS">SFS</option>
                    <option value="REGULAR">Regular</option>
                </select>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} reminders</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <Bell size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No reminders match.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Type</Th><Th>Chassis</Th><Th>Reg#</Th>
                                <Th>Customer</Th><Th>Phone</Th>
                                <Th>Due</Th><Th>Status</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const ts = STATUS_STYLE[r.Status] || STATUS_STYLE.Scheduled;
                                const tt = TYPE_STYLE[r.ReminderType] || { bg: '#f1f5f9', col: '#475569', label: r.ReminderType };
                                const overdue = r.Status === 'Sent' && r.DueDate && (new Date(r.DueDate) < new Date(new Date().toDateString()));
                                return (
                                    <tr key={r.ReminderID} style={{ borderBottom: '1px solid #f1f5f9', background: overdue ? '#fef2f2' : 'transparent' }}>
                                        <Td mono color="#475569">#{r.ReminderID}</Td>
                                        <Td>
                                            <span style={{ background: tt.bg, color: tt.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{r.ReminderType}</span>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{tt.label}</div>
                                        </Td>
                                        <Td mono>{r.ChasisNo || '—'}</Td>
                                        <Td>{r.VehicleRegNo || '—'}</Td>
                                        <Td>{r.CustomerName || '—'}</Td>
                                        <Td mono>{r.CustomerPhone || '—'}</Td>
                                        <Td>
                                            {r.DueDate ? new Date(r.DueDate).toLocaleDateString() : '—'}
                                            {r.DueByKmDate && r.DueByTimeDate && (
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                    km {new Date(r.DueByKmDate).toLocaleDateString()} / time {new Date(r.DueByTimeDate).toLocaleDateString()}
                                                </div>
                                            )}
                                        </Td>
                                        <Td>
                                            <span style={{ background: ts.bg, color: ts.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{r.Status}</span>
                                            {r.BookedJobCardID && <div style={{ fontSize: '0.7rem', color: '#15803d', marginTop: 2 }}>JC #{r.BookedJobCardID}</div>}
                                        </Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {['Sent', 'Scheduled'].includes(r.Status) && (
                                                    <button className="btn-icon" onClick={() => acknowledge(r.ReminderID)} title="Mark acknowledged"><Phone size={14} /></button>
                                                )}
                                                {r.Status !== 'Booked' && r.Status !== 'Cancelled' && (
                                                    <button className="btn-icon" onClick={() => setBookItem(r)} title="Mark booked"><Calendar size={14} style={{ color: '#15803d' }} /></button>
                                                )}
                                                {hasModule('cro_admin') && r.Status !== 'Booked' && r.Status !== 'Cancelled' && (
                                                    <button className="btn-icon" onClick={() => cancel(r.ReminderID)} title="Cancel"><XCircle size={14} style={{ color: '#b91c1c' }} /></button>
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

            {bookItem && (
                <BookModal item={bookItem}
                    onClose={() => setBookItem(null)}
                    onSaved={() => { setBookItem(null); flash('ok', 'Booked'); load(); }} />
            )}
        </div>
    );
}

function BookModal({ item, onClose, onSaved }) {
    const [jcId, setJcId] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const save = async () => {
        if (!jcId) return;
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/cro/reminders/${item.ReminderID}/mark-booked`, { BookedJobCardID: Number(jcId) });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 10, width: 420 }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>Mark Reminder #{item.ReminderID} Booked</div>
                    <button onClick={onClose} className="btn-icon"><XCircle size={18} /></button>
                </div>
                <div style={{ padding: 18 }}>
                    {err && <div style={{ padding: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 10, fontSize: '0.85rem' }}>{err}</div>}
                    <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 10 }}>
                        Customer for chassis <strong>{item.ChasisNo}</strong> booked their {item.ReminderType} service.
                        Enter the new JC# they were booked into:
                    </p>
                    <input type="number" value={jcId} onChange={e => setJcId(e.target.value)} placeholder="JobCardID"
                        style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box' }} />
                    <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
                        <button onClick={save} disabled={busy || !jcId}
                            style={{ padding: '8px 16px', background: '#15803d', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Mark Booked
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const Th = ({ children, align = 'left' }) => (
    <th style={{ padding: 10, textAlign: align, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{children}</th>
);
const Td = ({ children, align = 'left', mono, color }) => (
    <td style={{ padding: '10px 12px', textAlign: align, fontFamily: mono ? 'monospace' : undefined, color }}>{children}</td>
);
