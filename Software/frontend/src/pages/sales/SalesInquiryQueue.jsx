/**
 * Sales — Inquiry Queue
 *
 * Shows CRO-logged Sales (ProductInfo) inquiries. Managers assign them to
 * executives; executives see their own queue and can either Convert to Booking
 * or Close (no-sale). Decision #20: executives CANNOT self-assign.
 *
 * Tabs:
 *   - Unassigned (managers triage)
 *   - My Queue  (executives' own)
 *   - All Open
 *   - Closed
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
    Headphones, RefreshCw, Loader2, UserCheck, X, Plus, Clock, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';

const STATUS_STYLE = {
    Open:        { bg: '#fef3c7', col: '#92400e' },
    InProgress:  { bg: '#dbeafe', col: '#1e40af' },
    Converted:   { bg: '#dcfce7', col: '#15803d' },
    Closed:      { bg: '#e2e8f0', col: '#475569' },
    Resolved:    { bg: '#e2e8f0', col: '#475569' },
};

const TABS = [
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'mine',       label: 'My Queue' },
    { key: 'open',       label: 'All Open' },
    { key: 'closed',     label: 'Closed' },
];

export default function SalesInquiryQueue() {
    const { hasModule, user } = useAuth();
    const navigate = useNavigate();
    const canAssign = hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_admin_settings');

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState(canAssign ? 'unassigned' : 'mine');
    const [msg, setMsg] = useState(null);
    const [assignFor, setAssignFor] = useState(null);
    const [closeFor, setCloseFor] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/sales/inquiries`, { params: { filter: tab } });
            setRows(r.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [tab]);
    useEffect(() => { load(); }, [load]);

    const drop = async (row) => {
        const reason = window.prompt(`Drop inquiry "${row.Subject}" back to Unassigned. Reason:`);
        if (!reason?.trim()) return;
        try {
            await axios.post(`${API}/sales/inquiries/${row.InquiryID}/drop`, { Reason: reason.trim() });
            flash('ok', 'Dropped'); load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const convertToBooking = (row) => {
        // Navigate to NewBooking with the inquiry pre-filled. The form reads ?inquiryId on mount.
        navigate(`/sales/bookings/new?inquiryId=${row.InquiryID}`);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Sales Inquiries</h1>
                    <p className="page-subtitle">CRO-captured leads ready for a sales executive. Managers assign; executives convert.</p>
                </div>
                <button className="btn-sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            </div>

            {msg && <FlashMsg msg={msg} />}

            {/* Tabs */}
            <div className="card" style={{ display: 'flex', gap: 4, padding: 6 }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{
                            padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: tab === t.key ? '#1e40af' : 'transparent',
                            color:      tab === t.key ? 'white' : '#475569',
                            fontWeight: tab === t.key ? 600 : 500, fontSize: '0.85rem',
                        }}>
                        {t.label}
                    </button>
                ))}
                <div style={{ marginLeft: 'auto', alignSelf: 'center', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} inquiries</div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {rows.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                        <Headphones size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No inquiries in this view.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Inquiry</Th><Th>Customer</Th><Th>Source</Th><Th>Age</Th>
                                <Th>Status</Th><Th>Assignment</Th><Th>Outcome</Th><Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const sty = STATUS_STYLE[r.Status] || STATUS_STYLE.Open;
                                const mine = r.AssignedSalesExecutiveID === user?.employeeId;
                                const slaBreached = (r.AgeHours || 0) > 4 && !r.AssignedSalesExecutiveID;
                                return (
                                    <tr key={r.InquiryID} style={{ borderBottom: '1px solid #f1f5f9', background: slaBreached ? '#fffbeb' : undefined }}>
                                        <Td>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{r.Subject}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: 340 }}>{r.Body}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>Inquiry #{r.InquiryID}</div>
                                        </Td>
                                        <Td>
                                            <div style={{ fontWeight: 600 }}>{r.ContactName}</div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{r.ContactPhone}</div>
                                            {r.ContactEmail && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.ContactEmail}</div>}
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem' }}>{r.Source}</Td>
                                        <Td style={{ fontSize: '0.78rem' }}>
                                            <div style={{ color: slaBreached ? '#b45309' : '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                {slaBreached && <AlertTriangle size={12} />}
                                                <Clock size={12} /> {r.AgeHours}h
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{new Date(r.OpenedAt).toLocaleDateString()}</div>
                                        </Td>
                                        <Td><Pill bg={sty.bg} col={sty.col}>{r.Status}</Pill></Td>
                                        <Td style={{ fontSize: '0.78rem' }}>
                                            {r.AssignedSalesExecutiveID ? (
                                                <>
                                                    <div style={{ fontWeight: 600 }}>{r.AssignedExecutiveName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>by {r.AssignedByName} · {new Date(r.AssignedAt).toLocaleDateString()}</div>
                                                </>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>— unassigned —</span>
                                            )}
                                            {r.AssignmentNotes && <div style={{ marginTop: 4, padding: 4, background: '#f1f5f9', borderRadius: 4, fontSize: '0.7rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{r.AssignmentNotes}</div>}
                                        </Td>
                                        <Td style={{ fontSize: '0.78rem' }}>
                                            {r.ConvertedBookingID ? (
                                                <a href={`/sales/bookings/${r.ConvertedBookingID}`} style={{ color: '#15803d', fontWeight: 600, textDecoration: 'none' }}>
                                                    {r.ConvertedBookingNo} <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.ConvertedBookingStatus}</div>
                                                </a>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>—</span>
                                            )}
                                        </Td>
                                        <Td>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {!r.AssignedSalesExecutiveID && canAssign && r.Status !== 'Converted' && r.Status !== 'Closed' && (
                                                    <button className="btn-sm" onClick={() => setAssignFor(r)} style={{ background: '#1e40af', color: 'white', border: 'none' }}>
                                                        <UserCheck size={12} /> Assign
                                                    </button>
                                                )}
                                                {r.AssignedSalesExecutiveID && canAssign && r.Status !== 'Converted' && r.Status !== 'Closed' && (
                                                    <button className="btn-sm" onClick={() => setAssignFor(r)} title="Reassign">
                                                        <UserCheck size={12} /> Reassign
                                                    </button>
                                                )}
                                                {mine && r.Status !== 'Converted' && r.Status !== 'Closed' && (
                                                    <>
                                                        <button className="btn-sm" onClick={() => convertToBooking(r)} style={{ background: '#15803d', color: 'white', border: 'none' }}>
                                                            <Plus size={12} /> Convert
                                                        </button>
                                                        <button className="btn-sm" onClick={() => setCloseFor(r)} title="Close (no-sale)">
                                                            <X size={12} /> Close
                                                        </button>
                                                        <button className="btn-sm" onClick={() => drop(r)} title="Return to Unassigned">↺</button>
                                                    </>
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

            {assignFor && (
                <AssignModal row={assignFor}
                    onClose={() => setAssignFor(null)}
                    onSaved={() => { setAssignFor(null); flash('ok', 'Assigned'); load(); }} />
            )}
            {closeFor && (
                <CloseModal row={closeFor}
                    onClose={() => setCloseFor(null)}
                    onSaved={() => { setCloseFor(null); flash('ok', 'Closed'); load(); }} />
            )}
        </div>
    );
}

function AssignModal({ row, onClose, onSaved }) {
    const [executives, setExecutives] = useState([]);
    const [exeId, setExeId] = useState(row.AssignedSalesExecutiveID || '');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        // Fetch employees with sales_executive role.
        // Fallback: pull all employees and let the manager pick.
        axios.get(`${API}/employees`)
            .then(r => setExecutives(r.data.filter(e => (e.IsActive === undefined || e.IsActive) && !e.IsResigned)))
            .catch(() => setExecutives([]));
    }, []);

    const save = async () => {
        if (!exeId) return;
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/inquiries/${row.InquiryID}/assign`, { ExecutiveID: Number(exeId), Notes: notes });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={`Assign inquiry — ${row.Subject}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                <div><strong>Customer:</strong> {row.ContactName} ({row.ContactPhone})</div>
                <div style={{ marginTop: 4 }}>{row.Body}</div>
            </div>
            <Field label="Sales Executive *">
                <select value={exeId} onChange={e => setExeId(e.target.value)} style={inputStyle}>
                    <option value="">— Pick executive —</option>
                    {executives.map(e => (
                        <option key={e.EmployeeID} value={e.EmployeeID}>
                            {e.EmployeeName} {e.DesignationName ? `· ${e.DesignationName}` : ''}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Assignment notes (optional)">
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Customer interested in DFSK Glory; budget around 5M; needs callback by Friday."
                    style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel={row.AssignedSalesExecutiveID ? 'Reassign' : 'Assign'} busy={busy} disabled={!exeId} />
        </Shell>
    );
}

function CloseModal({ row, onClose, onSaved }) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        if (reason.trim().length < 3) { setErr('Reason is required.'); return; }
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/inquiries/${row.InquiryID}/close`, { Reason: reason.trim() });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title="Close inquiry (no-sale outcome)" onClose={onClose}>
            {err && <Err>{err}</Err>}
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                Use this when the inquiry won't result in a booking — wrong-number, customer chose competitor, out-of-stock, etc.
                Closed inquiries stay in history.
            </p>
            <Field label="Reason *">
                <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Why didn't this convert?" style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Close inquiry" busy={busy} disabled={reason.trim().length < 3} />
        </Shell>
    );
}
