import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Users, Loader2, RefreshCw, Search, ArrowLeft } from 'lucide-react';

const API_BASE = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PartyPicker({ onSelect }) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancel = false;
        setBusy(true);
        const t = setTimeout(async () => {
            try {
                const r = await axios.get(`${API_BASE}/reports/parties`, { params: { search: q } });
                if (!cancel) setResults(r.data);
            } catch (e) {
                console.error('Party search failed:', e);
                if (!cancel) setResults([]);
            }
            if (!cancel) setBusy(false);
        }, 250);
        return () => { cancel = true; clearTimeout(t); };
    }, [q]);

    const pick = (p) => { onSelect(p); setQ(''); setResults([]); setOpen(false); };

    return (
        <div style={{ position: 'relative', minWidth: 320 }}>
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
                    placeholder="Search party by name / phone / CNIC..."
                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem', minWidth: 240 }}
                />
                {busy && <Loader2 size={12} className="animate-spin" />}
            </div>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1000,
                    background: 'white', border: '1px solid #cbd5e1', borderRadius: 6,
                    maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                }}>
                    {busy ? (
                        <div style={{ padding: 12, color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>Searching...</div>
                    ) : results.length === 0 ? (
                        <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                            {q ? `No parties match "${q}".` : 'Type to search, or pick from the list.'}
                        </div>
                    ) : (
                        results.map(p => (
                            <div
                                key={p.PartyID}
                                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ fontWeight: 500 }}>{p.PartyName}</div>
                                {(p.PhoneOne || p.CNIC) && (
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {p.PhoneOne || ''}{p.PhoneOne && p.CNIC ? ' · ' : ''}{p.CNIC || ''}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export default function PartyStatement({ kind }) {
    const isSupplier = kind === 'supplier';
    const [params, setParams] = useSearchParams();
    const partyId = params.get('partyId');
    const [from, setFrom] = useState(params.get('from') || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
    const [to, setTo]     = useState(params.get('to')   || new Date().toISOString().slice(0, 10));

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        if (!partyId) return;
        setLoading(true); setErr(null);
        try {
            const endpoint = isSupplier ? 'supplier-statement' : 'customer-statement';
            const res = await axios.get(`${API_BASE}/reports/${endpoint}`, { params: { partyId, from, to } });
            setData(res.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setData(null);
        }
        setLoading(false);
    }, [partyId, from, to, isSupplier]);

    useEffect(() => { load(); }, [load]);

    const pick = (p) => setParams({ partyId: String(p.PartyID), from, to });

    const title    = isSupplier ? 'Supplier Statement' : 'Customer Statement';
    const subtitle = isSupplier
        ? 'All transactions and running payable balance for a supplier.'
        : 'All transactions and running receivable balance for a customer.';
    const balanceLabel = isSupplier ? 'Payable' : 'Receivable';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Link to="/reports/trial-balance" style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                        <ArrowLeft size={16} /> Reports
                    </Link>
                    <div>
                        <h1 className="page-title">{title}</h1>
                        <p className="page-subtitle">{subtitle}</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <PartyPicker onSelect={pick} />
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
                    <button className="btn" onClick={load} disabled={loading || !partyId}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                </div>
            </div>

            {!partyId && (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    Pick a {isSupplier ? 'supplier' : 'customer'} above to begin.
                </div>
            )}
            {err && <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>{err}</div>}

            {data && (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Party</div>
                            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{data.party.PartyName}</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                                {data.party.PhoneOne || ''}{data.party.PhoneOne && data.party.CNIC ? ' · ' : ''}{data.party.CNIC || ''}
                                {' · Period '}<strong>{data.from}</strong> → <strong>{data.to}</strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Opening</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.openingBalance)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Debits</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.totals.debit)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Credits</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(data.totals.credit)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{balanceLabel} (Closing)</div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e40af' }}>{fmt(data.closingBalance)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        {data.lines.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No transactions in this period.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Voucher</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                                            <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Narration / JC</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Debit</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Credit</th>
                                            <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ background: '#fafafa' }}>
                                            <td colSpan={6} style={{ padding: '8px 12px', fontStyle: 'italic', color: '#64748b' }}>Opening Balance</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(data.openingBalance)}</td>
                                        </tr>
                                        {data.lines.map((l, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(l.VoucherDate).toLocaleDateString()}</td>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#475569' }}>{l.VoucherNo}</td>
                                                <td style={{ padding: '8px 12px' }}>{l.VoucherType}</td>
                                                <td style={{ padding: '8px 12px', color: '#475569' }}>
                                                    {l.Narration}
                                                    {l.JobCardNo && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>JC: {l.JobCardNo}</div>}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(l.Debit) ? fmt(l.Debit) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(l.Credit) ? fmt(l.Credit) : '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(l.RunningBalance)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                            <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Closing</td>
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
