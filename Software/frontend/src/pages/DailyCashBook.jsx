import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Wallet, Loader2, RefreshCw, ArrowDown, ArrowUp } from 'lucide-react';

const API_BASE = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DailyCashBook() {
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const res = await axios.get(`${API_BASE}/reports/daily-cash-book`, { params: { date } });
            setData(res.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setData(null);
        }
        setLoading(false);
    }, [date]);

    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Daily Cash Book</h1>
                    <p className="page-subtitle">All cash movements for one day, with running till balance.</p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                        Date:
                        <input type="date" value={date} onChange={e => setDate(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                    </label>
                    <button className="btn" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                </div>
            </div>

            {err && <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>{err}</div>}

            {data && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                        <div className="card" style={{ background: '#f8fafc' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Opening</div>
                            <div style={{ fontWeight: 700, fontSize: '1.25rem', marginTop: 4 }}>PKR {fmt(data.opening)}</div>
                        </div>
                        <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                            <div style={{ fontSize: '0.7rem', color: '#15803d', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ArrowDown size={12} /> Cash In
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '1.25rem', marginTop: 4, color: '#15803d' }}>PKR {fmt(data.totalIn)}</div>
                        </div>
                        <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                            <div style={{ fontSize: '0.7rem', color: '#b91c1c', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ArrowUp size={12} /> Cash Out
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '1.25rem', marginTop: 4, color: '#b91c1c' }}>PKR {fmt(data.totalOut)}</div>
                        </div>
                        <div className="card" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                            <div style={{ fontSize: '0.7rem', color: '#1e40af', textTransform: 'uppercase' }}>Closing (Till)</div>
                            <div style={{ fontWeight: 700, fontSize: '1.25rem', marginTop: 4, color: '#1e40af' }}>PKR {fmt(data.closing)}</div>
                        </div>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--primary)' }}>
                            <Wallet size={20} />
                            <strong>Transactions ({data.lines.length})</strong>
                        </div>
                        {data.lines.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No cash movements on this date.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Voucher</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Narration / Party</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>In</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Out</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ background: '#fafafa' }}>
                                            <td colSpan={5} style={{ padding: '8px 12px', fontStyle: 'italic', color: '#64748b' }}>Opening Balance</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(data.opening)}</td>
                                        </tr>
                                        {data.lines.map((l, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#475569' }}>{l.VoucherNo}</td>
                                                <td style={{ padding: '8px 12px' }}>{l.VoucherType}</td>
                                                <td style={{ padding: '8px 12px', color: '#475569' }}>
                                                    {l.Narration}
                                                    {(l.PartyName || l.JobCardNo) && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            {l.PartyName}{l.PartyName && l.JobCardNo ? ' · ' : ''}{l.JobCardNo && `JC: ${l.JobCardNo}`}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#15803d' }}>{Number(l.Debit)  ? fmt(l.Debit)  : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b91c1c' }}>{Number(l.Credit) ? fmt(l.Credit) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(l.RunningBalance)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                            <td colSpan={3} style={{ padding: 12, fontWeight: 700 }}>Totals</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{fmt(data.totalIn)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>{fmt(data.totalOut)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>{fmt(data.closing)}</td>
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
