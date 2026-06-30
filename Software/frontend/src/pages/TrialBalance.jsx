import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FileBarChart, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Search, ChevronRight, Printer } from 'lucide-react';
import { PrintHeader } from './reports/ReportShell';

const API_BASE = '/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CLASS_LABELS = {
    '1': 'ASSETS',
    '2': 'LIABILITIES',
    '3': 'EQUITY',
    '4': 'REVENUE',
    '5': 'EXPENSES'
};

export default function TrialBalance() {
    const navigate = useNavigate();
    const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
    const [data, setData] = useState({ rows: [], totals: { debit: 0, credit: 0, diff: 0 } });
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await axios.get(`${API_BASE}/reports/trial-balance`, { params: { asOf } });
            setData(res.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        }
        setLoading(false);
    }, [asOf]);

    useEffect(() => { load(); }, [load]);

    // Group leaf rows by class root (1/2/3/4/5) for collapsible sections
    const grouped = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? data.rows.filter(r =>
                r.GLCode.toLowerCase().includes(q) || r.GLTitle.toLowerCase().includes(q))
            : data.rows;
        const out = {};
        for (const r of filtered) {
            const k = r.ClassRoot;
            if (!out[k]) out[k] = { label: CLASS_LABELS[k] || `Class ${k}`, rows: [], dr: 0, cr: 0 };
            out[k].rows.push(r);
            out[k].dr += Number(r.TotalDebit);
            out[k].cr += Number(r.TotalCredit);
        }
        return out;
    }, [data.rows, search]);

    const balanced = Math.abs(data.totals.diff) < 0.01;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PrintHeader title="Trial Balance" subtitle={`As of ${asOf}`}
                printedAt={new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                filterSummary={`As of: ${asOf}${search ? `  •  Filter: "${search}"` : ''}`} />
            <div className="card-header">
                <div>
                    <h1 className="page-title">Trial Balance</h1>
                    <p className="page-subtitle">All GL accounts with non-zero balance as of a chosen date. Click any row to drill into GL Detail.</p>
                </div>
                <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className="search-box" style={{ width: 240 }}>
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Filter code/title..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                        As of:
                        <input
                            type="date"
                            value={asOf}
                            onChange={e => setAsOf(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6 }}
                        />
                    </label>
                    <button className="btn" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                    <button className="btn" onClick={() => window.print()} disabled={loading || data.rows.length === 0}
                        style={{ background: '#0f766e' }}>
                        <Printer size={16} /> Print
                    </button>
                </div>
            </div>

            {/* Balance status banner */}
            <div className="card" style={{
                background: balanced ? '#f0fdf4' : '#fef2f2',
                border: '1px solid ' + (balanced ? '#bbf7d0' : '#fecaca'),
                padding: 16, display: 'flex', alignItems: 'center', gap: 12
            }}>
                {balanced ? <CheckCircle2 color="#16a34a" size={22} /> : <AlertTriangle color="#dc2626" size={22} />}
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: balanced ? '#15803d' : '#b91c1c' }}>
                        {balanced ? 'Trial Balance is balanced' : `Out of balance by PKR ${fmt(data.totals.diff)}`}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                        Total Debits: <strong>PKR {fmt(data.totals.debit)}</strong>
                        {'  '}—  Total Credits: <strong>PKR {fmt(data.totals.credit)}</strong>
                    </div>
                </div>
            </div>

            {err && (
                <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                    {err}
                </div>
            )}

            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: 'var(--primary)' }}>
                    <FileBarChart size={20} />
                    <strong>Account Balances</strong>
                    {loading && <Loader2 size={14} className="animate-spin" />}
                </div>

                {data.rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        {loading ? 'Loading...' : 'No posted transactions yet for the selected date.'}
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Code</th>
                                    <th style={{ padding: 10, textAlign: 'left', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Account</th>
                                    <th style={{ padding: 10, textAlign: 'right', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Debit</th>
                                    <th style={{ padding: 10, textAlign: 'right', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Credit</th>
                                    <th style={{ padding: 10, textAlign: 'right', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Balance</th>
                                    <th style={{ padding: 10, width: 30 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cls, g]) => (
                                    <React.Fragment key={cls}>
                                        <tr style={{ background: '#eff6ff' }}>
                                            <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                                                {cls} — {g.label}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{fmt(g.dr)}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{fmt(g.cr)}</td>
                                            <td colSpan={2}></td>
                                        </tr>
                                        {g.rows.map(r => (
                                            <tr
                                                key={r.GLCAID}
                                                onClick={() => navigate(`/reports/gl-detail?glcaid=${r.GLCAID}&to=${asOf}`)}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#64748b' }}>{r.GLCode}</td>
                                                <td style={{ padding: '8px 12px' }}>{r.GLTitle}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(r.TotalDebit) ? fmt(r.TotalDebit) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(r.TotalCredit) ? fmt(r.TotalCredit) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(Math.abs(r.Balance))} {Number(r.Balance) < 0 ? '(CR)' : ''}</td>
                                                <td style={{ padding: '8px 12px', color: '#94a3b8' }}><ChevronRight size={14} /></td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                    <td colSpan={2} style={{ padding: 12, fontWeight: 700 }}>Grand Total</td>
                                    <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(data.totals.debit)}</td>
                                    <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(data.totals.credit)}</td>
                                    <td colSpan={2} style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: balanced ? '#16a34a' : '#dc2626' }}>
                                        Diff: {fmt(data.totals.diff)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
