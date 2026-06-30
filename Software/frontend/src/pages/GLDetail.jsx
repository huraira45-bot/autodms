import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ListChecks, Loader2, RefreshCw, Search, ArrowLeft, Printer } from 'lucide-react';
import { PrintHeader } from './reports/ReportShell';

const API_BASE = '/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Account picker — searches COA leaves. Opens a dropdown on focus and stays open
// while typing. Click uses onMouseDown so the option fires before the input's blur
// (which would otherwise close the dropdown and cancel the click).
function AccountPicker({ onSelect }) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (q.length < 2) { setResults([]); setBusy(false); return; }
        let cancelled = false;
        setBusy(true);
        const t = setTimeout(async () => {
            try {
                const res = await axios.get(`${API_BASE}/accounts/coa`, { params: { search: q } });
                if (!cancelled) setResults(res.data.filter(a => !a.isParent));
            } catch (e) {
                console.error('Account search failed:', e);
                if (!cancelled) setResults([]);
            }
            if (!cancelled) setBusy(false);
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [q]);

    const pick = (a) => { onSelect(a); setQ(''); setResults([]); setOpen(false); };

    return (
        <div style={{ position: 'relative', minWidth: 300 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                border: '1px solid ' + (open ? 'var(--primary)' : '#cbd5e1'),
                borderRadius: 6, background: 'white'
            }}>
                <Search size={14} color="#64748b" />
                <input
                    value={q}
                    onChange={e => { setQ(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder="Search account (type 2+ chars)..."
                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem', minWidth: 220 }}
                />
                {busy && <Loader2 size={12} className="animate-spin" />}
            </div>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1000,
                    background: 'white', border: '1px solid #cbd5e1', borderRadius: 6,
                    maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                }}>
                    {q.length < 2 ? (
                        <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                            Type at least 2 characters to search...
                        </div>
                    ) : busy ? (
                        <div style={{ padding: 12, color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
                            <Loader2 size={12} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />
                            Searching...
                        </div>
                    ) : results.length === 0 ? (
                        <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                            No leaf accounts match "{q}".
                        </div>
                    ) : (
                        results.map(a => (
                            <div
                                key={a.GLCAID}
                                onMouseDown={(e) => { e.preventDefault(); pick(a); }}
                                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <span style={{ fontFamily: 'monospace', color: '#64748b', marginRight: 8 }}>{a.GLCode}</span>
                                {a.GLTitle}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export default function GLDetail() {
    const [params, setParams] = useSearchParams();
    const glcaid = params.get('glcaid');
    const [from, setFrom] = useState(params.get('from') || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
    const [to, setTo]     = useState(params.get('to')   || new Date().toISOString().slice(0, 10));

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        if (!glcaid) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await axios.get(`${API_BASE}/reports/gl-detail`, { params: { glcaid, from, to } });
            setData(res.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setData(null);
        }
        setLoading(false);
    }, [glcaid, from, to]);

    useEffect(() => { load(); }, [load]);

    const pickAccount = (a) => {
        setParams({ glcaid: String(a.GLCAID), from, to });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PrintHeader title="General Ledger Detail"
                subtitle={data?.account ? `${data.account.GLCode} — ${data.account.GLTitle}` : null}
                printedAt={new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                filterSummary={`Period: ${from} → ${to}`} />
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Link to="/reports/trial-balance" className="no-print" style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                        <ArrowLeft size={16} /> Trial Balance
                    </Link>
                    <div>
                        <h1 className="page-title">General Ledger Detail</h1>
                        <p className="page-subtitle">All posted lines on the chosen account, with running balance.</p>
                    </div>
                </div>
                <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <AccountPicker onSelect={pickAccount} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        From:
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }}/>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        To:
                        <input type="date" value={to} onChange={e => setTo(e.target.value)}
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }}/>
                    </label>
                    <button className="btn" onClick={load} disabled={loading || !glcaid}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                    <button className="btn" onClick={() => window.print()} disabled={loading || !data}
                        style={{ background: '#0f766e' }}>
                        <Printer size={16} /> Print
                    </button>
                </div>
            </div>

            {!glcaid && (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    Pick an account using the search box above (or click any row from Trial Balance).
                </div>
            )}

            {err && (
                <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                    {err}
                </div>
            )}

            {data && (
                <>
                    {/* Header card */}
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Account</div>
                            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                                <span style={{ fontFamily: 'monospace', color: '#475569', marginRight: 8 }}>{data.account.GLCode}</span>
                                {data.account.GLTitle}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                                Nature: <strong>{data.account.Nature}</strong> · Period: <strong>{data.from}</strong> → <strong>{data.to}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Opening</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.openingBalance)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Period Debits</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.totals.debit)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Period Credits</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.totals.credit)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Closing</div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e40af' }}>{fmt(data.closingBalance)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Lines table */}
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--primary)' }}>
                            <ListChecks size={20} />
                            <strong>Transactions ({data.lines.length})</strong>
                        </div>
                        {data.lines.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                                No transactions in this period.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Voucher</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Narration</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Party / JC</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Debit</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Credit</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ background: '#fafafa' }}>
                                            <td colSpan={7} style={{ padding: '8px 12px', fontStyle: 'italic', color: '#64748b' }}>Opening Balance</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(data.openingBalance)}</td>
                                        </tr>
                                        {data.lines.map((l, i) => {
                                            // Display running per nature
                                            const sign = data.account.Nature === 'Debit' ? 1 : -1;
                                            const dispRun = (l.RunningNetDr * sign).toFixed(2);
                                            return (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(l.VoucherDate).toLocaleDateString()}</td>
                                                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#475569' }}>{l.VoucherNo}</td>
                                                    <td style={{ padding: '8px 12px' }}>{l.VoucherType}</td>
                                                    <td style={{ padding: '8px 12px', color: '#475569' }}>{l.Narration}</td>
                                                    <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#64748b' }}>
                                                        {l.PartyName && <div>{l.PartyName}</div>}
                                                        {l.JobCardNo && <div>JC: {l.JobCardNo}</div>}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(l.Debit)  ? fmt(l.Debit)  : '—'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(l.Credit) ? fmt(l.Credit) : '—'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(dispRun)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                            <td colSpan={5} style={{ padding: 12, fontWeight: 700 }}>Closing Balance</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(data.totals.debit)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(data.totals.credit)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{fmt(data.closingBalance)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
