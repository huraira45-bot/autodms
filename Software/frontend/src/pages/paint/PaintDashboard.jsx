/**
 * Paint Lab Dashboard — compact KPI strip + 2-col detail below.
 * Owner ask 2026-07-05: reduce tile height; make everything fit
 * inside 1366×768 without horizontal page scroll.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
    Package, AlertTriangle, Truck, Undo2, Wrench,
    TrendingUp, TrendingDown, Loader2,
} from 'lucide-react';

const fmt  = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const d    = (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';

export default function PaintDashboard() {
    const [d1, setD1]   = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get('/api/paint/dashboard')
            .then(r => setD1(r.data))
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, []);

    if (err) {
        return (
            <div className="paint-page">
                <div className="paint-actionbar">
                    <div className="title">Paint Lab Dashboard</div>
                </div>
                <div className="erp-alert danger"><AlertTriangle size={13} /> {err}</div>
            </div>
        );
    }
    if (!d1) {
        return (
            <div className="paint-page">
                <div className="paint-actionbar">
                    <div className="title">Paint Lab Dashboard</div>
                </div>
                <div className="paint-card muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Loader2 size={13} className="animate-spin" /> Loading KPIs…
                </div>
            </div>
        );
    }

    return (
        <div className="paint-page">
            <div className="paint-actionbar">
                <div className="title">
                    Paint Lab Dashboard
                    <span className="subtitle">Stock, drafts, month-to-date activity, low-stock alerts</span>
                </div>
            </div>

            {/* Compact KPI strip — 5 tiles, ~60px tall each */}
            <div className="paint-kpi-strip">
                <KPI icon={Package}  tone="brand"
                    label="Stock Value" val={fmt(d1.stock?.stockValue)}
                    sub={`${d1.stock?.itemCount || 0} active items`} />
                <KPI icon={AlertTriangle} tone={d1.stock?.lowStockCount ? 'warning' : 'muted'}
                    label="Low Stock" val={String(d1.stock?.lowStockCount || 0)}
                    sub={d1.stock?.lowStockCount ? 'At/below reorder' : 'All above reorder'}
                    to="/paint/reports" />
                <KPI icon={Truck}  tone="muted"
                    label="Draft GRNs" val={String(d1.drafts?.draftGRNs || 0)}
                    to="/paint/grn" />
                <KPI icon={Undo2}  tone="muted"
                    label="Draft GRTNs" val={String(d1.drafts?.draftGRTNs || 0)}
                    to="/paint/grtn" />
                <KPI icon={Wrench} tone="muted"
                    label="Open Issues" val={String(d1.drafts?.openIssues || 0)}
                    sub="JC not finalized" to="/paint/issue" />
            </div>

            {/* Month totals — 3 tiles */}
            <div className="paint-kpi-strip">
                <KPI icon={TrendingUp}   tone="success" label="Purchases (Month)"   val={fmt(d1.month?.monthPurchase)} />
                <KPI icon={TrendingDown} tone="danger"  label="Returns (Month)"     val={fmt(d1.month?.monthReturns)} />
                <KPI icon={Wrench}       tone="brand"   label="Consumption (Month)" val={fmt(d1.month?.monthConsumption)}
                    sub="Drawn against JCs" />
            </div>

            {/* Two-column detail: Recent Issues + Low-Stock */}
            <div className="paint-two-col">
                <div className="paint-card">
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <div className="paint-card-title" style={{ marginBottom: 0, flex: 1 }}>Recent Paint Issues</div>
                        <Link to="/paint/issue" className="hint">Open all →</Link>
                    </div>
                    {d1.recent.length === 0
                        ? <div className="hint" style={{ padding: 6 }}>No issues yet.</div>
                        : <table className="paint-mini-list">
                            <thead><tr>
                                <th>Issue #</th><th>Date</th><th>Job Card</th>
                                <th className="num">Cost</th><th>Status</th>
                            </tr></thead>
                            <tbody>
                                {d1.recent.map(r => (
                                    <tr key={r.PaintIssueID}>
                                        <td><strong>{r.IssueNo}</strong></td>
                                        <td>{d(r.IssueDate)}</td>
                                        <td>{r.JobCardNo} · {r.VehicleRegNo || '—'}</td>
                                        <td className="num">{fmt(r.TotalCost)}</td>
                                        <td>
                                            <span className={`paint-status ${r.Locked ? 'locked' : 'open'}`}>
                                                {r.Locked ? 'Locked' : 'Open'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>}
                </div>

                <div className="paint-card">
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <div className="paint-card-title" style={{ marginBottom: 0, flex: 1 }}>Low-Stock Alerts</div>
                        <Link to="/paint/reports" className="hint">Full report →</Link>
                    </div>
                    {d1.lowStock.length === 0
                        ? <div className="hint" style={{ padding: 6, color: '#059669' }}>Everything is above reorder level.</div>
                        : <table className="paint-mini-list">
                            <thead><tr>
                                <th>Code</th><th>Paint</th>
                                <th className="num">Stock</th><th className="num">Reorder</th><th className="num">Short By</th>
                            </tr></thead>
                            <tbody>
                                {d1.lowStock.map(r => (
                                    <tr key={r.PaintItemID}>
                                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.PaintCode}</td>
                                        <td className="trunc" style={{ maxWidth: 180 }}>{r.PaintName}</td>
                                        <td className="num">{fmtQ(r.StockQty)}</td>
                                        <td className="num">{fmtQ(r.ReorderLevel)}</td>
                                        <td className="num" style={{ color: '#b91c1c', fontWeight: 600 }}>{fmtQ(r.ShortBy)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>}
                </div>
            </div>
        </div>
    );
}

function KPI({ icon: Icon, tone = 'muted', label, val, sub, to }) {
    const inner = (
        <div className={`paint-kpi tone-${tone}`}>
            <div className="icn"><Icon size={16} /></div>
            <div className="body">
                <div className="lbl">{label}</div>
                <div className="val">{val}</div>
                {sub && <div className="sub">{sub}</div>}
            </div>
        </div>
    );
    return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}
