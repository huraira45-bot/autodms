/**
 * Job Cards list — Odoo-style ERP list view.
 * Owner ask 2026-07-03: Create button, search, filter chips, group by
 * business unit / finalized, dense rows, record count.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Lock, Plus, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    ErpControlPanel, ErpSearchBar, ErpFilterChip, ErpFilterDropdown, ErpGroupByDropdown,
    ErpListView, ErpStatusPill,
} from '../components/erp';

const API = '/api/workshop';

// The Payment Type field is stored on Job Card's Status column in the legacy
// schema (Cash / Credit / POS / Bank Transfer). Map to a status pill tone.
const PAY_TONE = {
    Cash: 'green', Credit: 'amber', POS: 'steel', 'Bank Transfer': 'steel',
};
const TYPE_TONE = { WR: 'amber', BP: 'steel', GR: 'teal' };

export default function JobCardList() {
    const [jobs, setJobs] = useState([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // finalized: '' | 'finalized' | 'not_finalized'
    const [finalizedFilter, setFinalizedFilter] = useState('');
    const [businessType, setBusinessType] = useState('');
    const [jobTypes, setJobTypes] = useState([]);
    const [groupBy, setGroupBy] = useState(''); // '' | 'businessType' | 'finalized' | 'advisor'
    const navigate = useNavigate();

    useEffect(() => {
        axios.get(`${API}/job-types`).then(r => setJobTypes(r.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        let url = `${API}/job-cards?search=${encodeURIComponent(debouncedSearch)}`;
        if (finalizedFilter) url += `&finalized=${finalizedFilter}`;
        if (businessType)    url += `&businessType=${businessType}`;
        axios.get(url).then(r => setJobs(r.data || [])).catch(err => console.error(err));
    }, [debouncedSearch, finalizedFilter, businessType]);

    // Draft/Finalized badge counts — fetched separately (lightweight
    // COUNT query, no row cap) so they stay accurate regardless of the
    // 300-row cap on the main list, and regardless of which chip is
    // currently toggled. Deliberately excludes finalizedFilter from the
    // request so both badges always reflect the full search/business-unit
    // filtered set.
    const [finCounts, setFinCounts] = useState({ f: 0, nf: 0 });
    useEffect(() => {
        let url = `${API}/job-cards/counts?search=${encodeURIComponent(debouncedSearch)}`;
        if (businessType) url += `&businessType=${businessType}`;
        axios.get(url).then(r => setFinCounts({ f: r.data?.finalized || 0, nf: r.data?.draft || 0 })).catch(() => {});
    }, [debouncedSearch, businessType]);

    // ── Columns ────────────────────────────────────────────
    const columns = [
        { key: 'RO', label: 'RO #',
            render: r => <strong className="erp-mono" style={{ color: 'var(--erp-brand)' }}>{r.JobCardNo}</strong> },
        { key: 'Job', label: 'Job #',
            render: r => <span className="erp-mono">{r.jobCode || '—'}</span> },
        { key: 'Type', label: 'Business Unit',
            render: r => (
                <ErpStatusPill tone={TYPE_TONE[r.JobTypeCode] || 'muted'}>
                    {r.JobTypeName || 'N/A'}
                </ErpStatusPill>
            ) },
        { key: 'Customer', label: 'Customer',
            render: r => (
                <div>
                    <div style={{ fontWeight: 500 }}>{r.CustomerName || '—'}</div>
                    {r.CustomerPhone && (
                        <div style={{ fontSize: 11, color: 'var(--erp-text-muted)' }}>{r.CustomerPhone}</div>
                    )}
                </div>
            ) },
        { key: 'Vehicle', label: 'Vehicle',
            render: r => <span className="erp-mono" style={{ fontWeight: 500 }}>{r.VehicleRegNo || '—'}</span> },
        { key: 'Payment', label: 'Payment',
            render: r => (
                <ErpStatusPill tone={PAY_TONE[r.PaymentType] || 'muted'}>
                    {r.PaymentType || 'Cash'}
                </ErpStatusPill>
            ) },
        { key: 'Status', label: 'Status',
            render: r => r.IsFinalized
                ? <ErpStatusPill tone="green" icon={Lock}>Finalized</ErpStatusPill>
                : <ErpStatusPill tone="amber">Draft</ErpStatusPill> },
        { key: 'Date', label: 'Date',
            render: r => (
                <span style={{ fontSize: 12, color: 'var(--erp-text-muted)' }}>
                    {r.CreatedAt ? new Date(r.CreatedAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                </span>
            ) },
        { key: 'By', label: 'By',
            render: r => <span style={{ fontSize: 12, color: 'var(--erp-text-muted)' }}>{r.CreatedByName || '—'}</span> },
    ];

    // ── Grouping ───────────────────────────────────────────
    const groups = useMemo(() => {
        if (!groupBy) return null;
        const key = groupBy === 'businessType' ? (r => r.JobTypeName || 'Unassigned')
            : groupBy === 'finalized' ? (r => r.IsFinalized ? 'Finalized' : 'Draft')
            : (r => r.CreatedByName || 'Unassigned');
        const map = new Map();
        for (const j of jobs) {
            const g = key(j);
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(j);
        }
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [jobs, groupBy]);

    // ── Render ─────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title="Job Cards"
                subtitle="Search, filter and open workshop jobs."
                actions={
                    <button className="erp-btn erp-btn-primary" onClick={() => navigate('/workshop/jobs/new')}>
                        <Plus size={14} /> Create
                    </button>
                }
            >
                <ErpSearchBar value={search} onChange={setSearch}
                    placeholder="RO#, Job No, Customer, Reg No…" width={340} />

                <ErpFilterChip
                    active={finalizedFilter === 'not_finalized'}
                    label={`Draft (${finCounts.nf})`}
                    onClick={() => setFinalizedFilter(prev => prev === 'not_finalized' ? '' : 'not_finalized')}
                />
                <ErpFilterChip
                    active={finalizedFilter === 'finalized'}
                    label={`Finalized (${finCounts.f})`}
                    onClick={() => setFinalizedFilter(prev => prev === 'finalized' ? '' : 'finalized')}
                />

                <ErpFilterDropdown
                    icon={Wrench}
                    label="Business Unit"
                    items={jobTypes.map(t => ({ id: t.JobCardTypeId, label: `${t.CardCode} — ${t.Title}` }))}
                    value={businessType}
                    onChange={setBusinessType}
                />

                <ErpGroupByDropdown
                    items={[
                        { id: 'businessType', label: 'Business Unit' },
                        { id: 'finalized',    label: 'Finalized / Draft' },
                        { id: 'advisor',      label: 'Created By' },
                    ]}
                    value={groupBy}
                    onChange={setGroupBy}
                />
            </ErpControlPanel>

            {groups ? (
                <GroupedList groups={groups} columns={columns} onRowClick={r => navigate(`/workshop/jobs/${r.JobCardId}`)} />
            ) : (
                <ErpListView
                    columns={columns}
                    rows={jobs}
                    rowKey="JobCardId"
                    onRowClick={r => navigate(`/workshop/jobs/${r.JobCardId}`)}
                    emptyLabel="No job cards match this search. Use Create to start a new RO."
                    footerLeft={`${jobs.length} record${jobs.length === 1 ? '' : 's'}${jobs.length === 300 ? ' — showing most recent 300, search to find older ones' : ''}`}
                />
            )}
        </div>
    );
}

// ── Grouped list — collapsible group headers with per-group counts.
function GroupedList({ groups, columns, onRowClick }) {
    const [collapsed, setCollapsed] = useState(() => new Set());
    const toggle = (name) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
    });

    return (
        <div className="erp-list">
            <div style={{ overflowX: 'auto' }}>
                <table>
                    <thead>
                        <tr>
                            {columns.map(c => (
                                <th key={c.key} className={c.align === 'right' ? 'num' : ''}>{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map(([name, rows]) => {
                            const isOpen = !collapsed.has(name);
                            return (
                                <React.Fragment key={name}>
                                    <tr onClick={() => toggle(name)}
                                        style={{ background: 'var(--erp-surface-alt)', cursor: 'pointer' }}>
                                        <td colSpan={columns.length} style={{
                                            padding: '6px 10px', fontSize: 12, fontWeight: 700,
                                            color: 'var(--erp-text)',
                                            borderBottom: '1px solid var(--erp-border)',
                                        }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                {name}
                                                <span style={{ color: 'var(--erp-text-muted)', fontWeight: 500, marginLeft: 4 }}>({rows.length})</span>
                                            </span>
                                        </td>
                                    </tr>
                                    {isOpen && rows.map(r => (
                                        <tr key={r.JobCardId} onClick={() => onRowClick(r)}>
                                            {columns.map(c => (
                                                <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                                                    {c.render ? c.render(r) : r[c.key]}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="erp-list-footer">
                <div>{groups.reduce((s, [, r]) => s + r.length, 0)} record{groups.reduce((s, [, r]) => s + r.length, 0) === 1 ? '' : 's'} in {groups.length} group{groups.length === 1 ? '' : 's'}</div>
            </div>
        </div>
    );
}
