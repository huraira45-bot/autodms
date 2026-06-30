import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Percent, Loader2, RefreshCw, Printer } from 'lucide-react';
import { PrintHeader } from './reports/ReportShell';

const API_BASE = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPES = [
    { key: 'GST_OUTPUT', label: 'GST Output (Collected)', role: 'GST_PAYABLE' },
    { key: 'GST_INPUT',  label: 'GST Input (Paid)',       role: 'INPUT_GST' },
    { key: 'PST_OUTPUT', label: 'PST Output (Collected)', role: 'PST_PAYABLE' }
];

export default function TaxSummary() {
    const [params, setParams] = useSearchParams();
    const initialType = (params.get('type') || 'GST_OUTPUT').toUpperCase();
    const [type, setType] = useState(TYPES.find(t => t.key === initialType) ? initialType : 'GST_OUTPUT');
    const [from, setFrom] = useState(params.get('from') || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
    const [to, setTo]     = useState(params.get('to')   || new Date().toISOString().slice(0, 10));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const res = await axios.get(`${API_BASE}/reports/tax-summary`, { params: { type, from, to } });
            setData(res.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setData(null);
        }
        setLoading(false);
    }, [type, from, to]);

    useEffect(() => { load(); }, [load]);

    const isInput = type === 'GST_INPUT';
    const netLabel = isInput ? 'Net Input (Recoverable)' : 'Net Output (Payable)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PrintHeader title="Tax Summary"
                subtitle={TYPES.find(t => t.key === type)?.label}
                printedAt={new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                filterSummary={`Period: ${from} → ${to}`} />
            <div className="card-header">
                <div>
                    <h1 className="page-title">Tax Summary</h1>
                    <p className="page-subtitle">GST collected, GST paid (input), and PST collected — for FBR returns.</p>
                </div>
                <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={type} onChange={e => setType(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                        {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        From:
                        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        To:
                        <input type="date" value={to} onChange={e => setTo(e.target.value)}
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                    </label>
                    <button className="btn" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                    <button className="btn" onClick={() => window.print()} disabled={loading || !data}
                        style={{ background: '#0f766e' }}>
                        <Printer size={16} /> Print
                    </button>
                </div>
            </div>

            {err && <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>{err}</div>}

            {data && (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Account</div>
                            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                                <span style={{ fontFamily: 'monospace', color: '#475569', marginRight: 8 }}>{data.account.GLCode}</span>
                                {data.account.GLTitle}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                                Period: <strong>{data.from}</strong> → <strong>{data.to}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Debits</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.totals.debit)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Credits</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.totals.credit)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{netLabel}</div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e40af' }}>PKR {fmt(data.totals.net)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--primary)' }}>
                            <Percent size={20} />
                            <strong>Lines ({data.lines.length})</strong>
                        </div>
                        {data.lines.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No tax lines in this period.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Voucher</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Narration / Party</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Debit</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.lines.map((l, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(l.VoucherDate).toLocaleDateString()}</td>
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
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(l.Debit)  ? fmt(l.Debit)  : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(l.Credit) ? fmt(l.Credit) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                            <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Totals</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(data.totals.debit)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(data.totals.credit)}</td>
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
