/**
 * Vehicle History — search a vehicle by Reg #, Chassis #, or Engine # and
 * see every Job Card ever booked against it, newest first. Each JC expands
 * to show the actual labour / sublet / parts lines performed.
 * Owner ask 2026-07-03.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Search, Loader2, Eye, Car, Lock, ChevronDown, ChevronRight, Wrench, Package, ExternalLink } from 'lucide-react';
import { fmtDate } from '../utils/datetime';
import { ErpControlPanel } from '../components/erp';

const API = '/api/workshop';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VehicleHistory() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [regNo, setRegNo] = useState(params.get('regNo') || '');
    const [chassis, setChassis] = useState(params.get('chassis') || '');
    const [engine, setEngine] = useState(params.get('engine') || '');
    const [excludeJc] = useState(params.get('excludeJc') || '');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    // Expanded JC set — controlled by the caret at the start of each row.
    const [expanded, setExpanded] = useState(() => new Set());
    const toggle = (id) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const load = useCallback(async () => {
        const r = regNo.trim(), c = chassis.trim(), e = engine.trim();
        if (!r && !c && !e) { setData(null); return; }
        setLoading(true); setErr('');
        try {
            const res = await axios.get(`${API}/vehicle-history`, {
                params: { regNo: r, chassis: c, engine: e, excludeJc },
            });
            setData(res.data);
            // Auto-expand the newest JC so the page is useful at first glance
            if (res.data.rows?.length) setExpanded(new Set([res.data.rows[0].JobCardId]));
        } catch (ex) { setErr(ex.response?.data?.error || ex.message); setData(null); }
        setLoading(false);
    }, [regNo, chassis, engine, excludeJc]);

    useEffect(() => {
        if (regNo || chassis || engine) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runSearch = (e) => {
        e?.preventDefault?.();
        setParams({ regNo, chassis, engine, ...(excludeJc ? { excludeJc } : {}) });
        load();
    };

    const expandAll   = () => data && setExpanded(new Set(data.rows.map(r => r.JobCardId)));
    const collapseAll = () => setExpanded(new Set());

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Car size={14} color="var(--erp-brand)" /> Vehicle History</span>}
                subtitle="Every Job Card ever posted against the vehicle — click a row to see the labour, sublet, and parts performed."
            />

            <form onSubmit={runSearch} className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 12, alignItems: 'end' }}>
                <div className="form-group">
                    <label>Registration #</label>
                    <input type="text" value={regNo} onChange={e => setRegNo(e.target.value)} placeholder="e.g. BGF-523" />
                </div>
                <div className="form-group">
                    <label>Chassis #</label>
                    <input type="text" value={chassis} onChange={e => setChassis(e.target.value)} placeholder="e.g. NKMASE2E9S1004582" />
                </div>
                <div className="form-group">
                    <label>Engine #</label>
                    <input type="text" value={engine} onChange={e => setEngine(e.target.value)} placeholder="e.g. 506861" />
                </div>
                <button type="submit" disabled={loading} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40 }}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search
                </button>
            </form>

            {err && <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: 12 }}>{err}</div>}

            {data && (
                <>
                    <div className="card" style={{ padding: 12, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Stat label="Job Cards" value={data.count} />
                        <Stat label="Labour" value={'PKR ' + fmt(data.totals.labour)} />
                        <Stat label="Parts"  value={'PKR ' + fmt(data.totals.parts)} />
                        <Stat label="Sublet" value={'PKR ' + fmt(data.totals.sublet)} />
                        <Stat label="Total"  value={'PKR ' + fmt(data.totals.total)} strong />
                        <div style={{ flex: 1 }} />
                        <button className="btn" type="button" onClick={expandAll}   style={{ fontSize: 12 }}>Expand All</button>
                        <button className="btn" type="button" onClick={collapseAll} style={{ fontSize: 12, background: '#e2e8f0', color: '#475569' }}>Collapse All</button>
                    </div>

                    {data.rows.length === 0 && (
                        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                            No prior job cards for this vehicle.
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {data.rows.map(jc => (
                            <JCCard key={jc.JobCardId} jc={jc} open={expanded.has(jc.JobCardId)}
                                    onToggle={() => toggle(jc.JobCardId)}
                                    onOpen={() => navigate(`/workshop/jobs/${jc.JobCardId}`)} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function JCCard({ jc, open, onToggle, onOpen }) {
    const badge = jc.IsFinalized
        ? { label: 'Finalized', bg: '#d1fae5', color: '#065f46' }
        : { label: 'Draft',     bg: '#fef3c7', color: '#92400e' };
    return (
        <div className="card" style={{
            padding: 0, overflow: 'hidden',
            ...(jc.IsLegacy ? { borderLeft: '4px solid #f59e0b', background: '#fffbeb' } : {}),
        }}>
            <div onClick={onToggle}
                 style={{ padding: '12px 14px', display: 'grid',
                          gridTemplateColumns: '24px 1fr auto', gap: 12, alignItems: 'center',
                          cursor: 'pointer', background: open ? '#f8fafc' : 'white',
                          borderBottom: open ? '1px solid #e2e8f0' : 'none' }}>
                {open ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.95rem' }}>{jc.JobCardNo}</strong>
                    <span style={{ fontSize: '0.85rem', color: '#475569' }}>{fmtDate(jc.JobCardDate)}</span>
                    <span style={{ fontSize: '0.85rem', color: '#334155' }}>{jc.JobTypeCode ? `${jc.JobTypeCode} — ${jc.JobTypeName}` : ''}</span>
                    <span style={{ fontSize: '0.85rem', color: '#334155' }}>{jc.CustomerName || '—'}</span>
                    {jc.Odometer > 0 && (
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>KM: {Number(jc.Odometer).toLocaleString()}</span>
                    )}
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {jc.IsFinalized && <Lock size={10} />} {badge.label}
                    </span>
                    {!!jc.IsLegacy && (
                        <span title="Imported from the legacy FIS system — read only."
                              style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e', letterSpacing: 0.5, border: '1px solid #fde68a' }}>
                            LEGACY
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>PKR {fmt(jc.TotalAmount)}</div>
                    {jc.IsLegacy !== 1 && (
                        <button onClick={e => { e.stopPropagation(); onOpen(); }} title="Open Job Card"
                                style={{ background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#475569' }}>
                            <ExternalLink size={14} />
                        </button>
                    )}
                </div>
            </div>

            {open && (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, background: '#fafafa' }}>
                    <MiniTable
                        title="Labour / Services"
                        icon={<Wrench size={14} />}
                        rows={jc.LabourLines || []}
                        columns={[
                            { key: 'Description', label: 'Description', style: { minWidth: 300 } },
                            { key: 'Price',       label: 'Price',    align: 'right', mono: true, fmt: fmt },
                            { key: 'Quantity',    label: 'Qty',      align: 'right' },
                            { key: 'DiscAmt',     label: 'Discount', align: 'right', mono: true, fmt: fmt },
                            { key: 'TaxAmount',   label: 'PST',      align: 'right', mono: true, fmt: fmt, color: '#1d4ed8' },
                            { key: '_net', label: 'Net', align: 'right', mono: true, bold: true,
                              derive: r => fmt((Number(r.Price)||0)*(Number(r.Quantity)||1) - (Number(r.DiscAmt)||0) + (Number(r.TaxAmount)||0)) },
                        ]}
                        emptyLabel="No labour lines"
                    />
                    <MiniTable
                        title="Sublet"
                        icon={<ExternalLink size={14} />}
                        rows={jc.SubletLines || []}
                        columns={[
                            { key: 'Description',   label: 'Description', style: { minWidth: 300 } },
                            { key: 'InvoiceAmount', label: 'Invoice', align: 'right', mono: true, fmt: fmt },
                            { key: 'PayableAmount', label: 'Payable', align: 'right', mono: true, fmt: fmt },
                            { key: 'TaxAmount',     label: 'PST',     align: 'right', mono: true, fmt: fmt, color: '#1d4ed8' },
                        ]}
                        emptyLabel="No sublet lines"
                    />
                    <MiniTable
                        title="Parts / Spares"
                        icon={<Package size={14} />}
                        rows={jc.PartsLines || []}
                        columns={[
                            { key: 'ItemNumber', label: 'Part #',     mono: true },
                            { key: 'ItemName',   label: 'Item',       style: { minWidth: 260 } },
                            { key: 'IssueQuantity', label: 'Qty',     align: 'right' },
                            { key: 'ItemRate',   label: 'Rate',       align: 'right', mono: true, fmt: fmt },
                            { key: 'TaxAmount',  label: 'GST',        align: 'right', mono: true, fmt: fmt, color: '#1d4ed8' },
                            { key: '_net', label: 'Amount w/ GST', align: 'right', mono: true, bold: true,
                              derive: r => fmt((Number(r.IssueQuantity)||0)*(Number(r.ItemRate)||0) + (Number(r.TaxAmount)||0)) },
                        ]}
                        emptyLabel="No parts issued"
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                                  padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                        <Kv label="Labour Total" value={'PKR ' + fmt(jc.LabourAmount)} />
                        <Kv label="Parts Total"  value={'PKR ' + fmt(jc.PartsAmount)} />
                        <Kv label="Sublet Total" value={'PKR ' + fmt(jc.SubletAmount)} />
                        <Kv label="JC Total"     value={'PKR ' + fmt(jc.TotalAmount)} strong />
                    </div>
                </div>
            )}
        </div>
    );
}

function MiniTable({ title, icon, rows, columns, emptyLabel }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#334155', fontWeight: 700, marginBottom: 4 }}>
                {icon}{title} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({rows.length})</span>
            </div>
            {rows.length === 0 ? (
                <div style={{ padding: 12, fontSize: '0.8rem', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    {emptyLabel}
                </div>
            ) : (
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                                {columns.map(c => (
                                    <th key={c.key} style={{ padding: '6px 10px', textAlign: c.align || 'left', ...(c.style || {}) }}>{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    {columns.map(c => {
                                        const raw = c.derive ? c.derive(r) : (c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '—'));
                                        return (
                                            <td key={c.key} style={{
                                                padding: '6px 10px',
                                                textAlign: c.align || 'left',
                                                fontFamily: c.mono ? 'monospace' : undefined,
                                                fontWeight: c.bold ? 700 : undefined,
                                                color: c.color,
                                            }}>{raw}</td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function Kv({ label, value, strong }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
            <span style={{ fontSize: strong ? '0.95rem' : '0.85rem', fontWeight: strong ? 800 : 600, color: '#0f172a' }}>{value}</span>
        </div>
    );
}

function Stat({ label, value, strong }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
            <span style={{ fontSize: strong ? '1.05rem' : '0.95rem', fontWeight: strong ? 800 : 600, color: '#0f172a' }}>{value}</span>
        </div>
    );
}
