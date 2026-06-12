import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
    FileBarChart, RefreshCw, Loader2, AlertTriangle, Clock,
    Headphones, Flame, Building, ChevronRight,
    User, TrendingDown, Users, ThumbsDown, Star, Bell, ShieldAlert, Megaphone,
    UserSearch, GitBranch,
} from 'lucide-react';

const API = '/api';
const fmtH = (h) => h == null ? '—' : `${Number(h).toFixed(1)}h`;
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

const SEV_COLOR = {
    Critical: '#dc2626',
    High:     '#b45309',
    Normal:   '#475569',
    Low:      '#64748b',
};
const STATUS_COLOR = {
    Assigned:         '#92400e',
    InProgress:       '#9a3412',
    PendingCROVerify: '#1e40af',
    ReOpened:         '#b91c1c',
    Closed:           '#15803d',
};

function Section({ icon: Icon, title, subtitle, children, right }) {
    return (
        <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Icon size={18} color="#1e40af" />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</div>
                    {subtitle && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{subtitle}</div>}
                </div>
                {right}
            </div>
            {children}
        </div>
    );
}

function BreakdownBars({ rows, colorFor, total }) {
    if (!rows?.length) return <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No data.</div>;
    const max = Math.max(...rows.map(r => r.count), 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => (
                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem' }}>
                    <div style={{ width: 90, color: '#475569', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.key}</div>
                    <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0,
                            width: `${(r.count / max) * 100}%`,
                            background: colorFor ? colorFor(r.key) : '#3b82f6',
                            borderRadius: 4,
                        }} />
                    </div>
                    <div style={{ width: 60, textAlign: 'right', fontWeight: 600 }}>
                        {fmtN(r.count)}
                        {total ? <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: 4 }}>({Math.round(r.count / total * 100)}%)</span> : null}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ----- Report 1 -----
function OpenDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await axios.get(`${API}/cro/reports/open-dashboard`); setData(r.data); }
        catch { setData(null); }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    if (!data) return <Section icon={Headphones} title="Open Complaints Dashboard">
        <div style={{ color: '#94a3b8' }}>{loading ? 'Loading…' : 'No data.'}</div>
    </Section>;

    return (
        <Section
            icon={Headphones}
            title="Open Complaints Dashboard"
            subtitle={`${data.totalOpen} currently open complaints — breakdown by status, severity, age, dept`}
            right={<button className="btn-sm" onClick={load} disabled={loading}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>}
        >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 8, fontWeight: 600 }}>By Status</div>
                    <BreakdownBars rows={data.byStatus} total={data.totalOpen} colorFor={k => STATUS_COLOR[k] || '#475569'} />
                </div>
                <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 8, fontWeight: 600 }}>By Severity</div>
                    <BreakdownBars rows={data.bySeverity} total={data.totalOpen} colorFor={k => SEV_COLOR[k] || '#475569'} />
                </div>
                <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 8, fontWeight: 600 }}>By Age</div>
                    <BreakdownBars rows={data.byAge} total={data.totalOpen} colorFor={k => k === '7d+' ? '#dc2626' : k === '96h-7d' ? '#b45309' : k === '72-96h' ? '#f59e0b' : '#3b82f6'} />
                </div>
                <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 8, fontWeight: 600 }}>By Escalation Level</div>
                    <BreakdownBars rows={data.byLevel.map(r => ({ ...r, key: `L${r.key}` }))} total={data.totalOpen} colorFor={k => k === 'L2' ? '#dc2626' : k === 'L1' ? '#b45309' : '#475569'} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 8, fontWeight: 600 }}>By Assigned Department</div>
                    <BreakdownBars rows={data.byDept} total={data.totalOpen} colorFor={() => '#3b82f6'} />
                </div>
            </div>
        </Section>
    );
}

// ----- Report 2 -----
function AgedSLABreach() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [breachedOnly, setBreachedOnly] = useState(false);
    const [minLevel, setMinLevel] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (breachedOnly) params.breachedOnly = 1;
            if (minLevel)     params.minLevel = minLevel;
            const r = await axios.get(`${API}/cro/reports/aged`, { params });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [breachedOnly, minLevel]);
    useEffect(() => { load(); }, [load]);

    return (
        <Section
            icon={AlertTriangle}
            title="Aged / SLA-Breach Complaints"
            subtitle={data ? `${data.totalOpen} active, ${data.breachedCount} past their next-level threshold` : 'Loading…'}
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={breachedOnly} onChange={e => setBreachedOnly(e.target.checked)} />
                        Breached only
                    </label>
                    <select value={minLevel} onChange={e => setMinLevel(e.target.value)}
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }}>
                        <option value="">All levels</option>
                        <option value="1">L1+</option>
                        <option value="2">L2+</option>
                    </select>
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.items?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>
                    {loading ? 'Loading…' : 'No complaints match the filter.'}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>#</Th><Th>Subject</Th><Th>JC</Th><Th>Assigned</Th><Th>Sev</Th><Th>Lvl</Th>
                                <Th align="right">Age</Th><Th align="right">Next L</Th><Th align="right">Hours left</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.map(r => (
                                <tr key={r.ComplaintID}
                                    style={{ borderBottom: '1px solid #f1f5f9', background: r.Breached ? '#fef2f2' : 'transparent' }}>
                                    <Td><Link to={`/cro/complaints/${r.ComplaintID}`} style={{ color: '#1e40af', textDecoration: 'none', fontFamily: 'monospace' }}>{r.ComplaintNo}</Link></Td>
                                    <Td><div style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Subject}</div></Td>
                                    <Td mono>{r.JobCardNo || '—'}</Td>
                                    <Td>{r.AssignedEmployeeName ? r.AssignedEmployeeName.trim() : <span style={{ color: '#94a3b8' }}>—</span>}</Td>
                                    <Td><span style={{ color: SEV_COLOR[r.Severity], fontWeight: 600 }}>{r.Severity}</span></Td>
                                    <Td>L{r.CurrentEscalationLevel}</Td>
                                    <Td align="right">{r.AgeHours}h</Td>
                                    <Td align="right">L{r.NextLevel} @ {r.ThresholdHrs}h</Td>
                                    <Td align="right">
                                        <span style={{ color: r.Breached ? '#dc2626' : r.HoursLeft < 12 ? '#b45309' : '#15803d', fontWeight: 600 }}>
                                            {r.Breached ? `${Math.abs(r.HoursLeft)}h over` : `${r.HoursLeft}h`}
                                        </span>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

// ----- Report 3 -----
function ResolutionTimeByDept() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (from) params.from = from;
            if (to)   params.to   = to;
            const r = await axios.get(`${API}/cro/reports/resolution-time`, { params });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [from, to]);
    useEffect(() => { load(); }, [load]);

    return (
        <Section
            icon={Clock}
            title="Resolution Time by Department"
            subtitle={data?.overall ? `${data.overall.ClosedCount} closed in range · avg ${fmtH(data.overall.AvgHours)}, max ${fmtH(data.overall.MaxHours)}` : '—'}
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.byDepartment?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>
                    {loading ? 'Loading…' : 'No closed complaints in the selected range.'}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th><Building size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Department</Th>
                                <Th align="right">Closed</Th>
                                <Th align="right">Avg hours</Th>
                                <Th align="right">P90</Th>
                                <Th align="right">Max</Th>
                                <Th align="right">Min</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.byDepartment.map(r => (
                                <tr key={r.Department} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td>{r.Department}</Td>
                                    <Td align="right">{fmtN(r.ClosedCount)}</Td>
                                    <Td align="right"><strong>{fmtH(r.AvgHours)}</strong></Td>
                                    <Td align="right">{fmtH(r.P90Hours)}</Td>
                                    <Td align="right" style={{ color: '#b45309' }}>{fmtH(r.MaxHours)}</Td>
                                    <Td align="right" style={{ color: '#15803d' }}>{fmtH(r.MinHours)}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

// ----- Report 5 — Service-Reminder Conversion -----
function ReminderConversion() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (from) params.from = from;
            if (to) params.to = to;
            const r = await axios.get(`${API}/cro/reports/reminder-conversion`, { params });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [from, to]);
    useEffect(() => { load(); }, [load]);

    const ov = data?.overall;

    return (
        <Section
            icon={Bell}
            title="Service-Reminder Conversion"
            subtitle={ov ? `${ov.Total} reminders · ${ov.Sent} sent · ${ov.Booked} booked → ${ov.BookRate}% book rate` : '—'}
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!ov || ov.Total === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No reminders in range.'}</div>
            ) : (
                <>
                    {/* Funnel */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <FunnelCard label="Total"        value={ov.Total}        color="#475569" />
                        <FunnelCard label="Sent"         value={ov.Sent}         color="#1e40af" />
                        <FunnelCard label="Acknowledged" value={ov.Acknowledged} color="#b45309" />
                        <FunnelCard label="Booked"       value={ov.Booked}       color="#15803d" big />
                        <FunnelCard label="Ignored"      value={ov.Ignored}      color="#94a3b8" />
                        <FunnelCard label="Cancelled"    value={ov.Cancelled}    color="#64748b" />
                    </div>
                    {/* By type */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Type</Th>
                                <Th align="right">Total</Th><Th align="right">Sent</Th><Th align="right">Booked</Th>
                                <Th align="right">Book rate</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.byType.map(r => (
                                <tr key={r.ReminderType} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td><strong>{r.ReminderType}</strong></Td>
                                    <Td align="right">{fmtN(r.Total)}</Td>
                                    <Td align="right">{fmtN(r.Sent)}</Td>
                                    <Td align="right" style={{ color: '#15803d', fontWeight: 600 }}>{fmtN(r.Booked)}</Td>
                                    <Td align="right" style={{ color: r.BookRate >= 50 ? '#15803d' : r.BookRate >= 25 ? '#b45309' : '#dc2626', fontWeight: 700 }}>
                                        {r.BookRate}%
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </Section>
    );
}

function FunnelCard({ label, value, color, big, sub }) {
    return (
        <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: 'white' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: big ? '1.6rem' : '1.3rem', color }}>{fmtN(value)}</div>
            {sub && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

// ----- Report 4 — Survey Scores by Advisor -----
function SurveyScores() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (from) params.from = from;
            if (to) params.to = to;
            const r = await axios.get(`${API}/cro/reports/survey-scores`, { params });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [from, to]);
    useEffect(() => { load(); }, [load]);

    const renderRows = (rows, idKey, nameKey, label) => (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 6, fontWeight: 600 }}>{label}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <Th>{label}</Th>
                        <Th align="right">Responses</Th>
                        <Th align="right">Avg rating</Th>
                        <Th align="right">Would recommend</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r[idKey] ?? r[nameKey]} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <Td>{r[nameKey] || `#${r[idKey]}`}</Td>
                            <Td align="right">{fmtN(r.n)}</Td>
                            <Td align="right">
                                {r.AvgRating != null ? (
                                    <span style={{ color: r.AvgRating >= 4 ? '#15803d' : r.AvgRating >= 3 ? '#b45309' : '#dc2626', fontWeight: 700 }}>
                                        ★ {r.AvgRating}
                                    </span>
                                ) : '—'}
                            </Td>
                            <Td align="right">
                                {r.RecommendRate != null ? (
                                    <span style={{ color: r.RecommendRate >= 80 ? '#15803d' : r.RecommendRate >= 50 ? '#b45309' : '#dc2626', fontWeight: 600 }}>
                                        {r.RecommendRate}%
                                    </span>
                                ) : '—'}
                            </Td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <Section
            icon={Star}
            title="Survey Scores by Advisor"
            subtitle={data?.overall
                ? `${data.overall.Count} responded PostJobCard surveys${data.overall.NPSLike != null ? ` · "Would recommend": ${data.overall.NPSLike}%` : ''}`
                : '—'}
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.byAdvisor?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>
                    {loading ? 'Loading…' : 'No PostJobCard surveys responded in range yet.'}
                </div>
            ) : (
                <>
                    {renderRows(data.byAdvisor, 'AdvisorID', 'AdvisorName', 'By Service Advisor')}
                    {renderRows(data.byDepartment, 'DepartmentID', 'DepartmentName', 'By Department')}
                </>
            )}
        </Section>
    );
}

// ----- Report 6 — By Responder -----
function ByResponder() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (from) params.from = from;
            if (to) params.to = to;
            const r = await axios.get(`${API}/cro/reports/by-responder`, { params });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [from, to]);
    useEffect(() => { load(); }, [load]);

    return (
        <Section
            icon={User}
            title="Complaints by Responder"
            subtitle="Per-employee volume + outcomes — open vs closed, escalations, NotSatisfied kickbacks, average close time"
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.rows?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No complaints in range.'}</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Employee</Th><Th>Department</Th>
                                <Th align="right">Total</Th><Th align="right">Open</Th><Th align="right">Closed</Th>
                                <Th align="right">Escalated</Th><Th align="right">NotSatisfied</Th><Th align="right">Avg close</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map(r => {
                                const ns = r.NotSatisfiedCount || 0;
                                const esc = r.EscalatedCount || 0;
                                return (
                                    <tr key={r.AssignedEmployeeID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td>{(r.EmployeeName || '').trim() || `#${r.AssignedEmployeeID}`}</Td>
                                        <Td style={{ color: '#64748b' }}>{r.DepartmentName || '—'}</Td>
                                        <Td align="right"><strong>{fmtN(r.TotalComplaints)}</strong></Td>
                                        <Td align="right" style={{ color: r.OpenCount ? '#b45309' : '#94a3b8' }}>{fmtN(r.OpenCount)}</Td>
                                        <Td align="right" style={{ color: '#15803d' }}>{fmtN(r.ClosedCount)}</Td>
                                        <Td align="right" style={{ color: esc ? '#dc2626' : '#94a3b8' }}>{fmtN(esc)}</Td>
                                        <Td align="right" style={{ color: ns ? '#b91c1c' : '#94a3b8', fontWeight: ns ? 600 : 400 }}>{fmtN(ns)}</Td>
                                        <Td align="right">{r.AvgCloseHours != null && r.AvgCloseHours > 0 ? fmtH(r.AvgCloseHours) : '—'}</Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

// ----- Report 7 — Escalation Heatmap -----
function EscalationHeatmap() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (from) params.from = from;
            if (to) params.to = to;
            const r = await axios.get(`${API}/cro/reports/escalation-heatmap`, { params });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [from, to]);
    useEffect(() => { load(); }, [load]);

    const max = Math.max(...(data?.rows || []).map(r => r.TotalEscalations || 0), 1);

    return (
        <Section
            icon={Flame}
            title="Escalation Heatmap"
            subtitle="Which departments hit L1/L2 most often — process-improvement signal. Auto = cron-triggered; Manual = CRO admin override."
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }} />
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.rows?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No escalations in range.'}</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <Th>Department</Th>
                            <Th align="right">L1</Th><Th align="right">L2</Th>
                            <Th align="right">Auto</Th><Th align="right">Manual</Th>
                            <Th>Heat</Th>
                            <Th align="right">Total</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map(r => {
                            const heatPct = (r.TotalEscalations / max) * 100;
                            const heatColor = r.L2Count > r.L1Count ? '#dc2626' : '#b45309';
                            return (
                                <tr key={r.Department} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td>{r.Department}</Td>
                                    <Td align="right">{fmtN(r.L1Count)}</Td>
                                    <Td align="right" style={{ color: r.L2Count ? '#dc2626' : '#94a3b8', fontWeight: r.L2Count ? 600 : 400 }}>{fmtN(r.L2Count)}</Td>
                                    <Td align="right" style={{ color: '#64748b' }}>{fmtN(r.AutoCount)}</Td>
                                    <Td align="right" style={{ color: '#64748b' }}>{fmtN(r.ManualCount)}</Td>
                                    <Td>
                                        <div style={{ width: 180, height: 14, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{ width: `${heatPct}%`, height: '100%', background: heatColor }} />
                                        </div>
                                    </Td>
                                    <Td align="right"><strong>{fmtN(r.TotalEscalations)}</strong></Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </Section>
    );
}

// ----- Report 8 — Repeat Complaints -----
function RepeatComplaints() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [days, setDays] = useState(90);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/cro/reports/repeats`, { params: { windowDays: days } });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [days]);
    useEffect(() => { load(); }, [load]);

    return (
        <Section
            icon={Users}
            title="Repeat Complaints"
            subtitle={`Customers/chassis with ≥2 complaints in the last ${days} days — chronic problem cases`}
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Window:</label>
                    <select value={days} onChange={e => setDays(Number(e.target.value))}
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }}>
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days</option>
                        <option value={180}>180 days</option>
                        <option value={365}>1 year</option>
                    </select>
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.rows?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No repeat complaints in range — good news.'}</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Group key</Th><Th>Chassis</Th><Th>Contact</Th>
                                <Th align="right">Count</Th>
                                <Th>Complaint #s (latest 5)</Th>
                                <Th align="right">Span (days)</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map(r => {
                                const span = Math.ceil((new Date(r.LastOpened) - new Date(r.FirstOpened)) / 86400000);
                                return (
                                    <tr key={r.GroupKey} style={{ borderBottom: '1px solid #f1f5f9', background: r.ComplaintCount >= 4 ? '#fef2f2' : 'transparent' }}>
                                        <Td mono style={{ color: '#475569' }}>{r.GroupKey}</Td>
                                        <Td mono style={{ color: '#64748b' }}>{r.AnyChasis || '—'}</Td>
                                        <Td>{r.AnyContactName || '—'}</Td>
                                        <Td align="right" style={{ color: r.ComplaintCount >= 4 ? '#dc2626' : '#b45309', fontWeight: 700 }}>{r.ComplaintCount}</Td>
                                        <Td style={{ fontSize: '0.78rem', color: '#475569', fontFamily: 'monospace' }}>{r.ComplaintNos}</Td>
                                        <Td align="right">{span}</Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

// ----- Report 12 — Customer Lifetime Touchpoints -----
function CustomerTouchpoints() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [top, setTop] = useState(50);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { top };
            if (search) params.search = search;
            const r = await axios.get(`${API}/cro/reports/customer-touchpoints`, { params });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [top, search]);
    useEffect(() => { load(); }, [load]);

    return (
        <Section
            icon={UserSearch}
            title="Customer Lifetime Touchpoints"
            subtitle={data ? `Top ${data.topCount} customers by total contact across JCs, complaints, surveys, campaigns, reminders, flags` : '—'}
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer / phone / chassis" style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem', width: 180 }} />
                    <select value={top} onChange={e => setTop(Number(e.target.value))}
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }}>
                        <option value={25}>Top 25</option>
                        <option value={50}>Top 50</option>
                        <option value={100}>Top 100</option>
                        <option value={500}>Top 500</option>
                    </select>
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.customers?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No customers.'}</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Customer</Th><Th>Vehicle</Th>
                                <Th align="right">JCs</Th><Th align="right">Cmpts</Th>
                                <Th align="right">Open</Th><Th align="right">Surveys</Th><Th align="right">★ avg</Th>
                                <Th align="right">Camp.</Th><Th align="right">Reminders</Th><Th align="right">Flags</Th>
                                <Th align="right">Total</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.customers.map(c => (
                                <tr key={c.ProfileID} style={{ borderBottom: '1px solid #f1f5f9', background: c.OpenKYCFlags > 0 ? '#fff7f7' : 'transparent' }}>
                                    <Td>
                                        <div style={{ fontWeight: 500 }}>{c.CustomerName}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{c.PhoneNo}</div>
                                    </Td>
                                    <Td><div style={{ fontSize: '0.78rem' }}>{c.BrandName || '—'}</div><div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#64748b' }}>{c.RegistrationNo || c.ChasisNo || ''}</div></Td>
                                    <Td align="right"><strong>{c.TotalJCs}</strong><div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{c.FinalizedJCs} done</div></Td>
                                    <Td align="right"><strong>{c.TotalComplaints}</strong></Td>
                                    <Td align="right" style={{ color: c.OpenComplaints > 0 ? '#b91c1c' : '#94a3b8', fontWeight: c.OpenComplaints > 0 ? 600 : 400 }}>
                                        {c.OpenComplaints}
                                        {c.CriticalComplaints > 0 && <div style={{ fontSize: '0.7rem', color: '#dc2626' }}>{c.CriticalComplaints} crit</div>}
                                    </Td>
                                    <Td align="right">{c.TotalSurveys}<div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{c.RespondedSurveys} resp.</div></Td>
                                    <Td align="right" style={{ color: c.AvgRating != null ? (c.AvgRating >= 4 ? '#15803d' : c.AvgRating >= 3 ? '#b45309' : '#dc2626') : '#94a3b8', fontWeight: 600 }}>
                                        {c.AvgRating != null ? c.AvgRating.toFixed(1) : '—'}
                                    </Td>
                                    <Td align="right">{c.CampaignsReceived}</Td>
                                    <Td align="right">{c.TotalReminders}<div style={{ fontSize: '0.7rem', color: '#15803d' }}>{c.BookedReminders} bk</div></Td>
                                    <Td align="right" style={{ color: c.OpenKYCFlags > 0 ? '#dc2626' : '#94a3b8', fontWeight: c.OpenKYCFlags > 0 ? 700 : 400 }}>
                                        {c.OpenKYCFlags}/{c.TotalKYCFlags}
                                    </Td>
                                    <Td align="right" style={{ fontWeight: 700, color: '#1e40af' }}>{c.TotalTouchpoints}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

// ----- Report 13 — Service-Order Ladder Funnel -----
function ServiceLadder() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await axios.get(`${API}/cro/reports/service-ladder`); setData(r.data); }
        catch { setData(null); }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const ov = data?.overall;
    return (
        <Section
            icon={GitBranch}
            title="Service-Order Ladder Funnel"
            subtitle={ov ? `${ov.TotalChassis} unique chassis tracked across PDI → FFS → SFS → Regular` : '—'}
            right={
                <button className="btn-sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            }
        >
            {!ov || ov.TotalChassis === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No chassis history yet.'}</div>
            ) : (
                <>
                    {/* Overall funnel cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <FunnelCard label="Chassis with PDI"     value={ov.HitPDI}     color="#1e40af" />
                        <FunnelCard label="Reached FFS"          value={ov.HitFFS}     color="#b45309" sub={ov.PdiToFFSRate != null ? `${ov.PdiToFFSRate}% from PDI` : null} />
                        <FunnelCard label="Reached SFS"          value={ov.HitSFS}     color="#9a3412" sub={ov.FFSToSFSRate != null ? `${ov.FFSToSFSRate}% from FFS` : null} />
                        <FunnelCard label="Regular service"      value={ov.HitRegular} color="#15803d" sub={ov.SFSToRegularRate != null ? `${ov.SFSToRegularRate}% from SFS` : null} />
                    </div>

                    {/* Cohort table */}
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 6, fontWeight: 600 }}>By cohort (chassis grouped by first JC month)</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Cohort</Th><Th align="right">Total</Th>
                                <Th align="right">PDI</Th><Th align="right">→ FFS</Th>
                                <Th align="right">→ SFS</Th><Th align="right">→ Regular</Th>
                                <Th align="right">Stopped @ FFS</Th><Th align="right">Stopped @ SFS</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.cohorts.map(c => (
                                <tr key={c.Cohort} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td mono>{c.Cohort}</Td>
                                    <Td align="right"><strong>{fmtN(c.Total)}</strong></Td>
                                    <Td align="right">{fmtN(c.HitPDI)}</Td>
                                    <Td align="right" style={{ color: '#b45309' }}>{fmtN(c.HitFFS)}</Td>
                                    <Td align="right" style={{ color: '#9a3412' }}>{fmtN(c.HitSFS)}</Td>
                                    <Td align="right" style={{ color: '#15803d' }}>{fmtN(c.HitRegular)}</Td>
                                    <Td align="right" style={{ color: c.StoppedAtFFS > 0 ? '#b91c1c' : '#94a3b8' }}>{fmtN(c.StoppedAtFFS)}</Td>
                                    <Td align="right" style={{ color: c.StoppedAtSFS > 0 ? '#b91c1c' : '#94a3b8' }}>{fmtN(c.StoppedAtSFS)}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </Section>
    );
}

// ----- Report 11 — Campaign ROI -----
function CampaignROI() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await axios.get(`${API}/cro/reports/campaign-roi`); setData(r.data); }
        catch { setData(null); }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const ov = data?.overall;
    return (
        <Section
            icon={Megaphone}
            title="Campaign ROI"
            subtitle={ov ? `${data.campaigns.length} campaigns · ${ov.Sent} sent · ${ov.BookedWithin30d} booked JCs within 30d → ${ov.ConversionRate}% conversion` : '—'}
            right={
                <button className="btn-sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            }
        >
            {!data?.campaigns?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No campaigns sent yet.'}</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <Th>#</Th><Th>Campaign</Th>
                            <Th align="right">Recipients</Th><Th align="right">Sent</Th>
                            <Th align="right">Delivered</Th><Th align="right">Failed</Th>
                            <Th align="right">Responded</Th>
                            <Th align="right">Booked &lt;30d</Th>
                            <Th align="right">Conversion</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.campaigns.map(r => (
                            <tr key={r.CampaignID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <Td mono color="#475569">#{r.CampaignID}</Td>
                                <Td><div style={{ fontWeight: 500 }}>{r.Name}</div><div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.Status} · {r.ExecutedAt ? new Date(r.ExecutedAt).toLocaleDateString() : 'pending'}</div></Td>
                                <Td align="right">{fmtN(r.TotalRecipients)}</Td>
                                <Td align="right">{fmtN(r.SentCount)}</Td>
                                <Td align="right" style={{ color: '#15803d' }}>{fmtN(r.DeliveredCount)}</Td>
                                <Td align="right" style={{ color: r.FailedCount ? '#b91c1c' : '#94a3b8' }}>{fmtN(r.FailedCount)}</Td>
                                <Td align="right" style={{ color: '#1e40af' }}>{fmtN(r.RespondedCount)}</Td>
                                <Td align="right" style={{ color: '#15803d', fontWeight: 600 }}>{fmtN(r.BookedWithin30d)}</Td>
                                <Td align="right" style={{ color: r.ConversionRate >= 10 ? '#15803d' : r.ConversionRate >= 3 ? '#b45309' : '#dc2626', fontWeight: 700 }}>
                                    {r.ConversionRate}%
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Section>
    );
}

// ----- Report 9 — KYC Flag Register -----
function KYCRegister() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await axios.get(`${API}/cro/reports/kyc-flags`); setData(r.data); }
        catch { setData(null); }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const ov = data?.overall;
    return (
        <Section
            icon={ShieldAlert}
            title="KYC Flag Register"
            subtitle={ov ? `${ov.Total || 0} flags total · ${ov.OpenTotal || 0} open · ${ov.Acknowledgments || 0} acknowledgments logged` : '—'}
            right={
                <button className="btn-sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            }
        >
            {!data?.byType?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No KYC flags on record.'}</div>
            ) : (
                <>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 6, fontWeight: 600 }}>By Type</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: 16 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Flag Type</Th>
                                <Th align="right">Open</Th><Th align="right">Resolved</Th><Th align="right">Total</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.byType.map(r => (
                                <tr key={r.FlagType} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td><strong>{r.FlagType}</strong></Td>
                                    <Td align="right" style={{ color: r.OpenCount > 0 ? '#b91c1c' : '#94a3b8', fontWeight: 600 }}>{fmtN(r.OpenCount)}</Td>
                                    <Td align="right" style={{ color: '#15803d' }}>{fmtN(r.ResolvedCount)}</Td>
                                    <Td align="right">{fmtN(r.TotalCount)}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {data.oldestOpen?.length > 0 && (
                        <>
                            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Oldest Open (top 20)</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <Th>#</Th><Th>Type</Th><Th>Chassis</Th><Th>Notes</Th>
                                        <Th>Raised by</Th><Th align="right">Age (days)</Th><Th align="right">Acks</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.oldestOpen.map(r => (
                                        <tr key={r.FlagID} style={{ borderBottom: '1px solid #f1f5f9', background: r.AgeDays > 90 ? '#fef2f2' : 'transparent' }}>
                                            <Td mono color="#475569">#{r.FlagID}</Td>
                                            <Td>{r.FlagType}</Td>
                                            <Td mono>{r.ChasisNo || '—'}</Td>
                                            <Td><div style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Notes}</div></Td>
                                            <Td style={{ color: '#64748b', fontSize: '0.78rem' }}>{r.FlaggedByName}</Td>
                                            <Td align="right" style={{ color: r.AgeDays > 90 ? '#dc2626' : r.AgeDays > 30 ? '#b45309' : '#475569', fontWeight: 600 }}>{r.AgeDays}</Td>
                                            <Td align="right">{r.AckCount}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </>
            )}
        </Section>
    );
}

// ----- Report 10 — NotSatisfied Verdict Tracker -----
function VerdictTracker() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [months, setMonths] = useState(12);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/cro/reports/verdict-tracker`, { params: { months } });
            setData(r.data);
        } catch { setData(null); }
        setLoading(false);
    }, [months]);
    useEffect(() => { load(); }, [load]);

    const maxTotal = Math.max(...(data?.rows || []).map(r => r.Total || 0), 1);

    return (
        <Section
            icon={ThumbsDown}
            title="NotSatisfied Verdict Tracker"
            subtitle={data?.overall
                ? `Overall: ${data.overall.Satisfied} satisfied / ${data.overall.NotSatisfied} not / ${data.overall.NoResponse} no-response · kickback rate ${data.overall.KickbackRate}%`
                : '—'}
            right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b' }}>Trailing:</label>
                    <select value={months} onChange={e => setMonths(Number(e.target.value))}
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem' }}>
                        <option value={3}>3 months</option>
                        <option value={6}>6 months</option>
                        <option value={12}>12 months</option>
                        <option value={24}>24 months</option>
                    </select>
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            }
        >
            {!data?.rows?.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 12 }}>{loading ? 'Loading…' : 'No customer verdicts recorded in range.'}</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <Th>Month</Th>
                            <Th align="right">Satisfied</Th><Th align="right">NotSatisfied</Th><Th align="right">NoResponse</Th>
                            <Th>Split</Th>
                            <Th align="right">Kickback %</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map(r => {
                            const sat = r.Satisfied || 0, ns = r.NotSatisfied || 0, nr = r.NoResponse || 0, tot = r.Total || 1;
                            const kb = r.KickbackRate;
                            return (
                                <tr key={r.Month} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td mono>{r.Month}</Td>
                                    <Td align="right" style={{ color: '#15803d' }}>{sat}</Td>
                                    <Td align="right" style={{ color: '#b91c1c', fontWeight: ns ? 600 : 400 }}>{ns}</Td>
                                    <Td align="right" style={{ color: '#64748b' }}>{nr}</Td>
                                    <Td>
                                        <div style={{ display: 'flex', width: 220, height: 14, borderRadius: 4, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                            <div title={`Satisfied ${sat}`}    style={{ width: `${sat/tot*100}%`, background: '#15803d' }} />
                                            <div title={`NotSatisfied ${ns}`}  style={{ width: `${ns/tot*100}%`,  background: '#b91c1c' }} />
                                            <div title={`NoResponse ${nr}`}    style={{ width: `${nr/tot*100}%`,  background: '#94a3b8' }} />
                                        </div>
                                    </Td>
                                    <Td align="right" style={{ color: kb >= 20 ? '#dc2626' : kb >= 10 ? '#b45309' : '#15803d', fontWeight: 600 }}>{kb}%</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </Section>
    );
}

const Th = ({ children, align = 'left' }) => (
    <th style={{ padding: 10, textAlign: align, fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{children}</th>
);
const Td = ({ children, align = 'left', mono, style = {} }) => (
    <td style={{ padding: '8px 12px', textAlign: align, fontFamily: mono ? 'monospace' : undefined, ...style }}>
        {children}
    </td>
);

export default function CROReports() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">CRO Reports</h1>
                    <p className="page-subtitle">v1 daily-use reports. v2 (Complaints-by-Responder, Escalation Heatmap, Repeat Complaints, NotSatisfied tracker) on the backlog. Survey + reminder reports unlock with Phase 5.</p>
                </div>
            </div>

            <OpenDashboard />
            <AgedSLABreach />
            <ResolutionTimeByDept />
            <SurveyScores />
            <ReminderConversion />
            <ByResponder />
            <EscalationHeatmap />
            <RepeatComplaints />
            <VerdictTracker />
            <KYCRegister />
            <CampaignROI />
            <CustomerTouchpoints />
            <ServiceLadder />
        </div>
    );
}
