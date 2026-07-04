/**
 * Paint Lab Dashboard — live KPIs (Phase 4).
 *
 * Blocks:
 *   - Stock value + item count + low-stock count
 *   - Open drafts (GRN / GRTN / Issue) — click through to each screen
 *   - Month totals (purchase / returns / consumption)
 *   - Recent Paint Issues (5)
 *   - Top low-stock items (5)
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Package, AlertTriangle, Truck, Undo2, Wrench, TrendingDown, TrendingUp, ExternalLink } from 'lucide-react';
import { ErpControlPanel, ErpPanel, ErpLoadingState } from '../../components/erp';

const fmt  = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const d    = (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';

export default function PaintDashboard() {
    const [d1, setD1]     = useState(null);
    const [err, setErr]   = useState(null);

    useEffect(() => {
        axios.get('/api/paint/dashboard')
            .then(r => setD1(r.data))
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, []);

    if (err) return <div className="erp-alert danger" style={{ margin: 20 }}><AlertTriangle size={14} /> {err}</div>;
    if (!d1) return <ErpLoadingState message="Loading Paint Lab KPIs…" />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel title="Paint Lab Dashboard" subtitle="Stock, drafts, month-to-date activity, and low-stock alerts." />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <KPI icon={Package} tone="brand" label="Stock Value" primary={fmt(d1.stock?.stockValue)} secondary={`${d1.stock?.itemCount || 0} active items`} />
                <KPI icon={AlertTriangle} tone={d1.stock?.lowStockCount ? 'warning' : 'muted'}
                    label="Low Stock" primary={String(d1.stock?.lowStockCount || 0)}
                    secondary={d1.stock?.lowStockCount ? 'At or below reorder' : 'All above reorder'} to="/paint/reports" />
                <KPI icon={Truck} tone="muted" label="Draft GRNs" primary={String(d1.drafts?.draftGRNs || 0)} to="/paint/grn" />
                <KPI icon={Undo2} tone="muted" label="Draft GRTNs" primary={String(d1.drafts?.draftGRTNs || 0)} to="/paint/grtn" />
                <KPI icon={Wrench} tone="muted" label="Open Paint Issues" primary={String(d1.drafts?.openIssues || 0)}
                    secondary="Editable (JC not finalized)" to="/paint/issue" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                <KPI icon={TrendingUp} tone="success" label="Purchases (Month)" primary={fmt(d1.month?.monthPurchase)} />
                <KPI icon={TrendingDown} tone="danger" label="Returns (Month)" primary={fmt(d1.month?.monthReturns)} />
                <KPI icon={Wrench} tone="brand" label="Consumption (Month)" primary={fmt(d1.month?.monthConsumption)}
                    secondary="Paint drawn against JCs (finalized or not)" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
                <ErpPanel title="Recent Paint Issues"
                    action={<Link to="/paint/issue" style={{ fontSize: 12 }}>Open all →</Link>}>
                    {d1.recent.length === 0
                        ? <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>No issues yet.</div>
                        : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr style={{ background: '#f8fafc' }}>
                                <th style={th}>Issue #</th>
                                <th style={th}>Date</th>
                                <th style={th}>Job Card</th>
                                <th style={{ ...th, textAlign: 'right' }}>Cost</th>
                                <th style={th}></th>
                            </tr></thead>
                            <tbody>
                                {d1.recent.map(r => (
                                    <tr key={r.PaintIssueID} style={{ borderTop: '1px solid #e5e7eb' }}>
                                        <td style={td}><strong>{r.IssueNo}</strong></td>
                                        <td style={td}>{d(r.IssueDate)}</td>
                                        <td style={td}>{r.JobCardNo} · {r.VehicleRegNo || '—'}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmt(r.TotalCost)}</td>
                                        <td style={td}>
                                            {r.Locked
                                                ? <span style={{ fontSize: 11, color: '#059669' }}>Locked</span>
                                                : <span style={{ fontSize: 11, color: '#64748b' }}>Open</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>}
                </ErpPanel>

                <ErpPanel title="Low-Stock Alerts"
                    action={<Link to="/paint/reports" style={{ fontSize: 12 }}>Full report →</Link>}>
                    {d1.lowStock.length === 0
                        ? <div style={{ padding: 12, color: '#059669', fontSize: 13 }}>Everything is above its reorder level. 🎉</div>
                        : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr style={{ background: '#f8fafc' }}>
                                <th style={th}>Code</th>
                                <th style={th}>Paint</th>
                                <th style={{ ...th, textAlign: 'right' }}>Stock</th>
                                <th style={{ ...th, textAlign: 'right' }}>Reorder</th>
                                <th style={{ ...th, textAlign: 'right' }}>Short By</th>
                            </tr></thead>
                            <tbody>
                                {d1.lowStock.map(r => (
                                    <tr key={r.PaintItemID} style={{ borderTop: '1px solid #e5e7eb' }}>
                                        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{r.PaintCode}</td>
                                        <td style={td}>{r.PaintName}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmtQ(r.StockQty)}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmtQ(r.ReorderLevel)}</td>
                                        <td style={{ ...td, textAlign: 'right', color: '#b91c1c', fontWeight: 600 }}>{fmtQ(r.ShortBy)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>}
                </ErpPanel>
            </div>
        </div>
    );
}

function KPI({ icon: Icon, tone = 'muted', label, primary, secondary, to }) {
    const toneColors = {
        brand:   { bg: 'var(--erp-brand-soft)', color: 'var(--erp-brand)' },
        success: { bg: '#f0fdf4', color: '#059669' },
        warning: { bg: '#fef3c7', color: '#b45309' },
        danger:  { bg: '#fef2f2', color: '#b91c1c' },
        muted:   { bg: '#f8fafc', color: '#64748b' },
    }[tone];
    const inner = (
        <div className="erp-panel" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: toneColors.bg, color: toneColors.color }}>
                <Icon size={20} />
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: toneColors.color }}>{primary}</div>
                {secondary && <div style={{ fontSize: 11, color: '#64748b' }}>{secondary}</div>}
            </div>
            {to && <ExternalLink size={14} color="#94a3b8" />}
        </div>
    );
    return to
        ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link>
        : inner;
}

const th = { padding: '6px 8px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#64748b' };
const td = { padding: '5px 8px', fontSize: 13 };
