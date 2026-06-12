import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Headphones, Plus, RefreshCw, Loader2, Search,
    AlertTriangle, Clock, CheckCircle2, XCircle, MessageSquare, Flame
} from 'lucide-react';
import NewComplaintModal from '../components/NewComplaintModal';

const API_BASE = '/api';

const STATUS_STYLE = {
    New:               { bg: '#e0e7ff', col: '#3730a3', label: 'New' },
    Assigned:          { bg: '#fef3c7', col: '#92400e', label: 'Assigned' },
    InProgress:        { bg: '#fed7aa', col: '#9a3412', label: 'In Progress' },
    PendingCROVerify:  { bg: '#dbeafe', col: '#1e40af', label: 'Pending CRO Verify' },
    Closed:            { bg: '#dcfce7', col: '#15803d', label: 'Closed' },
    ReOpened:          { bg: '#fee2e2', col: '#b91c1c', label: 'Re-Opened' },
};
const SEV_STYLE = {
    Low:      { col: '#64748b' },
    Normal:   { col: '#475569' },
    High:     { col: '#b45309' },
    Critical: { col: '#dc2626' },
};
const LEVEL_BADGE = lvl => ({
    0: { bg: '#f1f5f9', col: '#475569', text: 'L0' },
    1: { bg: '#fef3c7', col: '#92400e', text: 'L1' },
    2: { bg: '#fee2e2', col: '#b91c1c', text: 'L2' },
}[lvl] || { bg: '#f1f5f9', col: '#475569', text: `L${lvl}` });

function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.New;
    return (
        <span style={{ background: s.bg, color: s.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {s.label}
        </span>
    );
}

function KPI({ label, value, icon: Icon, color }) {
    return (
        <div className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: '1.4rem', color }}>{value ?? 0}</div>
            </div>
            <Icon size={28} color={color} style={{ opacity: 0.6 }} />
        </div>
    );
}

export default function CROWorkspace() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [stats, setStats] = useState({});
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [assignedToMe, setAssignedToMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showNew, setShowNew] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter)  params.status = statusFilter;
            if (search)        params.search = search;
            if (assignedToMe)  params.assignedToMe = 1;
            const [r1, r2] = await Promise.all([
                axios.get(`${API_BASE}/cro/complaints`, { params }),
                axios.get(`${API_BASE}/cro/complaints/stats`)
            ]);
            setRows(r1.data);
            setStats(r2.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [statusFilter, search, assignedToMe]);

    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">CRO Workspace</h1>
                    <p className="page-subtitle">Complaint queue. Resolution loop: department resolves → WhatsApp proof → CRO verifies → close or re-escalate.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                    <button className="btn" onClick={() => setShowNew(true)}>
                        <Plus size={16} /> New Complaint
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <KPI label="Open"          value={stats.OpenCount}          icon={Headphones}    color="#1e40af" />
                <KPI label="Pending Verify" value={stats.PendingVerifyCount} icon={Clock}         color="#b45309" />
                <KPI label="Re-Opened"     value={stats.ReOpenedCount}      icon={XCircle}       color="#b91c1c" />
                <KPI label="Escalated"     value={stats.EscalatedCount}     icon={AlertTriangle} color="#dc2626" />
                <KPI label="Critical"      value={stats.CriticalCount}      icon={Flame}         color="#dc2626" />
                <KPI label="Closed"        value={stats.ClosedCount}        icon={CheckCircle2}  color="#15803d" />
            </div>

            {/* Filter bar */}
            <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8, height: 38, minWidth: 260 }}>
                    <Search size={16} />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search complaint #, subject, customer, phone..."
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }}
                    />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All statuses</option>
                    <option value="Assigned">Assigned</option>
                    <option value="InProgress">In Progress</option>
                    <option value="PendingCROVerify">Pending CRO Verify</option>
                    <option value="ReOpened">Re-Opened</option>
                    <option value="Closed">Closed</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={assignedToMe} onChange={e => setAssignedToMe(e.target.checked)} />
                    Assigned to me
                </label>
                <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>{rows.length} complaints</div>
            </div>

            {/* List */}
            <div className="card">
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <MessageSquare size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>
                            {loading ? 'Loading…' : 'No complaints match the filter.'}
                        </div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <Th>#</Th>
                                    <Th>Subject</Th>
                                    <Th>Type</Th>
                                    <Th>JC</Th>
                                    <Th>Customer</Th>
                                    <Th>Assigned</Th>
                                    <Th>Status</Th>
                                    <Th>Level</Th>
                                    <Th>Sev</Th>
                                    <Th align="right">Age</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const lvl = LEVEL_BADGE(r.CurrentEscalationLevel);
                                    const sev = SEV_STYLE[r.Severity] || SEV_STYLE.Normal;
                                    return (
                                    <tr key={r.ComplaintID}
                                        onClick={() => navigate(`/cro/complaints/${r.ComplaintID}`)}
                                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <Td mono color="#475569">{r.ComplaintNo}</Td>
                                        <Td>
                                            <div style={{ fontWeight: 500 }}>{r.Subject}</div>
                                            {r.PartyName && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.PartyName}</div>}
                                        </Td>
                                        <Td>{r.ComplaintType}</Td>
                                        <Td mono color="#475569">{r.JobCardNo} {r.BusinessType && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>· {r.BusinessType}</span>}</Td>
                                        <Td>
                                            {r.ContactName}
                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.ContactPhone}</div>
                                        </Td>
                                        <Td>{r.AssignedEmployee || <span style={{ color: '#94a3b8' }}>—</span>}</Td>
                                        <Td><StatusBadge status={r.Status} /></Td>
                                        <Td>
                                            <span style={{ background: lvl.bg, color: lvl.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>
                                                {lvl.text}
                                            </span>
                                        </Td>
                                        <Td><span style={{ color: sev.col, fontWeight: 600, fontSize: '0.8rem' }}>{r.Severity}</span></Td>
                                        <Td align="right">{r.AgeHours}h</Td>
                                    </tr>
                                );})}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showNew && (
                <NewComplaintModal
                    onClose={() => setShowNew(false)}
                    onCreated={(complaint) => {
                        setShowNew(false);
                        navigate(`/cro/complaints/${complaint.ComplaintID}`);
                    }}
                />
            )}
        </div>
    );
}

const Th = ({ children, align = 'left' }) => (
    <th style={{ padding: 10, textAlign: align, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{children}</th>
);
const Td = ({ children, align = 'left', mono, color }) => (
    <td style={{ padding: '10px 12px', textAlign: align, fontFamily: mono ? 'monospace' : undefined, color, whiteSpace: align === 'right' ? 'nowrap' : undefined }}>
        {children}
    </td>
);
