import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, BarChart3, Clock, TrendingUp } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (d) => d ? new Date(d).toLocaleDateString('en-PK') : '';

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export default function SalesReportsV2() {
    const { notify } = useFeedback();
    const [tab, setTab] = useState('pipeline');
    const [from, setFrom] = useState(monthStartISO());
    const [to, setTo]     = useState(todayISO());
    const [pipeline, setPipeline] = useState(null);
    const [miAging, setMiAging]   = useState(null);
    const [incAging, setIncAging] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setBusy(true);
        try {
            if (tab === 'pipeline') {
                const r = await axios.get('/api/reports/sales/booking-pipeline', { params: { from, to } });
                setPipeline(r.data);
            } else if (tab === 'miAging') {
                const r = await axios.get('/api/reports/sales/master-invoice-aging');
                setMiAging(r.data);
            } else {
                const r = await axios.get('/api/reports/sales/incentive-receivable-aging');
                setIncAging(r.data);
            }
        } catch (err) { notify(err.response?.data?.error || err.message, 'error'); }
        setBusy(false);
    }, [tab, from, to, notify]);

    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <BarChart3 size={28} color="#1e40af" /> Sales Reports
            </h1>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                    ['pipeline','Booking Pipeline', BarChart3],
                    ['miAging','Master Invoice Aging', Clock],
                    ['incAging','Incentive Receivable Aging', TrendingUp],
                ].map(([key,label,Icon]) => (
                    <button key={key} onClick={() => setTab(key)}
                        style={{ padding: '8px 14px', background: tab===key?'#1e40af':'#f1f5f9', color: tab===key?'white':'#475569', border:'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {tab === 'pipeline' && (
                <>
                    <div className="card" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                        <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={input} /></label>
                        <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} style={input} /></label>
                    </div>
                    {busy ? <Loader2 className="spin" /> : pipeline && (
                        <div className="card">
                            <h3 style={{ marginTop: 0 }}>Funnel — {dt(pipeline.from)} → {dt(pipeline.to)}</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {pipeline.stages.map((s, i) => {
                                    const max = pipeline.stages[0].count || 1;
                                    const width = Math.max(20, (s.count / max) * 100);
                                    return (
                                        <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ width: 130, fontWeight: 600, color: '#475569' }}>{s.stage}</div>
                                            <div style={{ flex: 1, height: 28, background: '#f1f5f9', borderRadius: 4, position: 'relative' }}>
                                                <div style={{ width: `${width}%`, height: '100%', background: '#1e40af', borderRadius: 4 }} />
                                                <div style={{ position: 'absolute', top: 4, left: 8, color: 'white', fontWeight: 700, fontSize: '0.85rem' }}>{s.count}</div>
                                            </div>
                                            <div style={{ width: 100, textAlign: 'right', fontWeight: 600, color: s.conversion == null ? '#94a3b8' : s.conversion >= 50 ? '#15803d' : '#b45309' }}>
                                                {s.conversion != null ? `${s.conversion}%` : '—'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {pipeline.cancelled > 0 && (
                                <div style={{ marginTop: 14, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: '0.85rem' }}>
                                    <strong>{pipeline.cancelled}</strong> bookings cancelled in this window (not part of the funnel above).
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {tab === 'miAging' && (
                busy ? <Loader2 className="spin" /> : miAging && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
                            {['0-7 days','8-14 days','15-30 days','30+ days'].map(b => (
                                <Tile key={b} label={b} value={miAging.buckets[b] || 0} color={b==='30+ days'?'#b91c1c':b==='15-30 days'?'#b45309':'#1e40af'} />
                            ))}
                        </div>
                        <div className="card">
                            <h3 style={{ marginTop: 0 }}>{miAging.total} bookings waiting for Master invoice</h3>
                            <table style={tbl}>
                                <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                    <th style={th}>Booking</th>
                                    <th style={th}>Customer</th>
                                    <th style={th}>Variant</th>
                                    <th style={th}>Chassis</th>
                                    <th style={th}>Allocated</th>
                                    <th style={{...th, textAlign:'right'}}>Days</th>
                                    <th style={th}>Bucket</th>
                                </tr></thead>
                                <tbody>
                                    {miAging.rows.map(r => (
                                        <tr key={r.BookingID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={td}>{r.BookingNo}</td>
                                            <td style={td}>{r.PartyName || '—'}</td>
                                            <td style={td}>{r.VariantName || '—'}</td>
                                            <td style={{...td, fontFamily: 'monospace'}}>{r.AllocatedChasisNo || '—'}</td>
                                            <td style={{...td, color: '#64748b'}}>{dt(r.AllocatedAt)}</td>
                                            <td style={{...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: r.DaysSinceAlloc > 30 ? '#b91c1c' : '#1e40af'}}>{r.DaysSinceAlloc}</td>
                                            <td style={td}>{r.Bucket}</td>
                                        </tr>
                                    ))}
                                    {miAging.rows.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Nothing waiting for Master invoice.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </>
                )
            )}

            {tab === 'incAging' && (
                busy ? <Loader2 className="spin" /> : incAging && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
                            {['0-30 days','31-60 days','61-90 days','90+ days'].map(b => (
                                <Tile key={b} label={b} value={`PKR ${fmt(incAging.buckets[b] || 0)}`} color={b==='90+ days'?'#b91c1c':b==='61-90 days'?'#b45309':'#1e40af'} />
                            ))}
                            <Tile label="Total Outstanding" value={`PKR ${fmt(incAging.total)}`} color="#7c3aed" />
                        </div>
                        <div className="card">
                            <h3 style={{ marginTop: 0 }}>{incAging.rows.length} open Master incentive accruals</h3>
                            <table style={tbl}>
                                <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                    <th style={th}>Accrual</th>
                                    <th style={th}>Booking</th>
                                    <th style={th}>Category</th>
                                    <th style={th}>Chassis</th>
                                    <th style={th}>Accrued</th>
                                    <th style={{...th, textAlign:'right'}}>Outstanding</th>
                                    <th style={{...th, textAlign:'right'}}>Days</th>
                                    <th style={th}>Bucket</th>
                                </tr></thead>
                                <tbody>
                                    {incAging.rows.map(r => (
                                        <tr key={r.AccrualID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={td}>#{r.AccrualID}</td>
                                            <td style={td}>{r.BookingNo || '—'}</td>
                                            <td style={td}>{r.IncentiveCategory}</td>
                                            <td style={{...td, fontFamily: 'monospace'}}>{r.ChasisNo || '—'}</td>
                                            <td style={{...td, color: '#64748b'}}>{dt(r.AccruedAt)}</td>
                                            <td style={{...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700}}>PKR {fmt(r.Outstanding)}</td>
                                            <td style={{...td, textAlign: 'right', color: r.DaysSinceAccrued > 90 ? '#b91c1c' : '#1e40af'}}>{r.DaysSinceAccrued}</td>
                                            <td style={td}>{r.Bucket}</td>
                                        </tr>
                                    ))}
                                    {incAging.rows.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No open Master incentives.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </>
                )
            )}
            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function Tile({ label, value, color }) {
    return (
        <div className="card" style={{ padding: 12, borderLeft: `4px solid ${color}` }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
        </div>
    );
}

const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const th  = { padding: 8, fontWeight: 600, fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 };
const td  = { padding: 8 };
const input = { padding: 6, border: '1px solid #cbd5e1', borderRadius: 6, marginLeft: 6 };
