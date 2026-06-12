import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, Filter, Loader2, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';

const API_BASE = '/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Voucher type → route mapping for click-through.
// Auto-posted vouchers (SI / PV / PRV / SS / SSR) open in the JV view since they have no
// dedicated entry route — VoucherEntry handles view-only display for any type.
const TYPE_TO_ROUTE = {
    CPV: '/vouchers/cpv', CRV: '/vouchers/crv', BPV: '/vouchers/bpv',
    BRV: '/vouchers/brv', JV:  '/vouchers/jv'
};

const ALL_TYPES = ['CPV', 'CRV', 'BPV', 'BRV', 'JV', 'SI', 'SS', 'SSR', 'PV', 'PRV'];

const STATUS_BADGE = {
    Draft:    { bg: '#f1f5f9', col: '#475569' },
    Posted:   { bg: '#dcfce7', col: '#15803d' },
    Reversed: { bg: '#fee2e2', col: '#b91c1c' }
};

const todayISO     = () => new Date().toISOString().slice(0, 10);
const yearStartISO = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

export default function VoucherBrowser() {
    const navigate = useNavigate();
    const [filters, setFilters] = useState({
        types: [],
        status: '',
        from: yearStartISO(),
        to: todayISO(),
        q: '',
        minAmount: '',
        maxAmount: ''
    });
    const [data, setData]   = useState({ rows: [], total: 0, limit: 50, offset: 0 });
    const [busy, setBusy]   = useState(false);
    const [err, setErr]     = useState(null);

    const reload = useCallback(async (opts = {}) => {
        const offset = opts.offset !== undefined ? opts.offset : data.offset;
        setBusy(true); setErr(null);
        try {
            const params = {
                type:      filters.types.join(',') || undefined,
                status:    filters.status || undefined,
                from:      filters.from || undefined,
                to:        filters.to || undefined,
                q:         filters.q || undefined,
                minAmount: filters.minAmount || undefined,
                maxAmount: filters.maxAmount || undefined,
                limit:     50,
                offset
            };
            const r = await axios.get(`${API_BASE}/accounts/vouchers/search`, { params });
            setData(r.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setData(d => ({ ...d, rows: [], total: 0 }));
        }
        setBusy(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    useEffect(() => { reload({ offset: 0 }); /* eslint-disable-next-line */ }, [filters]);

    const toggleType = (t) => {
        setFilters(f => ({
            ...f,
            types: f.types.includes(t) ? f.types.filter(x => x !== t) : [...f.types, t]
        }));
    };

    const clearAll = () => setFilters({
        types: [], status: '', from: yearStartISO(), to: todayISO(),
        q: '', minAmount: '', maxAmount: ''
    });

    const openVoucher = (v) => {
        const route = TYPE_TO_ROUTE[v.VoucherType] || '/vouchers/jv';
        navigate(`${route}?id=${v.VoucherID}`);
    };

    const page    = Math.floor(data.offset / data.limit) + 1;
    const lastPage = Math.max(1, Math.ceil(data.total / data.limit));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Voucher Browser</h1>
                    <p className="page-subtitle">Search every voucher across all types, with status / date / amount / party filters and free-text search on number, remarks, and line narration.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" onClick={clearAll}><X size={14} /> Clear</button>
                    <button className="btn-sm" onClick={() => reload({ offset: 0 })} disabled={busy}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--primary)' }}>
                    <Filter size={16} /> <strong>Filters</strong>
                </div>

                {/* Free-text search */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 6, background: 'white', flex: 1, minWidth: 280 }}>
                        <Search size={14} color="#64748b" />
                        <input
                            type="text"
                            value={filters.q}
                            onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                            placeholder="Search number, remarks, or line narration..."
                            style={{ border: 'none', outline: 'none', flex: 1, padding: '8px 0', fontSize: '0.875rem' }}
                        />
                    </div>
                </div>

                {/* Type pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {ALL_TYPES.map(t => (
                        <button
                            key={t}
                            onClick={() => toggleType(t)}
                            style={{
                                padding: '4px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
                                cursor: 'pointer',
                                background: filters.types.includes(t) ? 'var(--primary)' : '#f1f5f9',
                                color: filters.types.includes(t) ? 'white' : '#475569',
                                border: '1px solid ' + (filters.types.includes(t) ? 'var(--primary)' : '#cbd5e1')
                            }}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {/* Status / date / amount row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Status</label>
                        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                            style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }}>
                            <option value="">Any</option>
                            <option value="Draft">Draft</option>
                            <option value="Posted">Posted</option>
                            <option value="Reversed">Reversed</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>From</label>
                        <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>To</label>
                        <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Min Amount</label>
                        <input type="number" step="0.01" value={filters.minAmount} onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value }))}
                            placeholder="0.00"
                            style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Max Amount</label>
                        <input type="number" step="0.01" value={filters.maxAmount} onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
                            placeholder="∞"
                            style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }} />
                    </div>
                </div>
            </div>

            {err && <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>{err}</div>}

            {/* Results */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {busy ? 'Loading...' : `${data.total} matching voucher${data.total === 1 ? '' : 's'} (showing ${data.rows.length})`}
                    </div>
                    {/* Pagination */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                        <button
                            onClick={() => reload({ offset: Math.max(0, data.offset - data.limit) })}
                            disabled={busy || data.offset === 0}
                            className="btn-sm"
                            style={{ opacity: data.offset === 0 ? 0.4 : 1 }}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span>Page {page} of {lastPage}</span>
                        <button
                            onClick={() => reload({ offset: data.offset + data.limit })}
                            disabled={busy || page >= lastPage}
                            className="btn-sm"
                            style={{ opacity: page >= lastPage ? 0.4 : 1 }}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>

                {data.rows.length === 0 && !busy ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                        No vouchers match the current filters.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                                    <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Voucher</th>
                                    <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                                    <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                                    <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Source</th>
                                    <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Remarks / Hit</th>
                                    <th style={{ padding: 10, textAlign: 'left',  fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>By</th>
                                    <th style={{ padding: 10, textAlign: 'right', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.map(v => {
                                    const sb = STATUS_BADGE[v.Status] || STATUS_BADGE.Posted;
                                    return (
                                        <tr key={v.VoucherID}
                                            onClick={() => openVoucher(v)}
                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(v.VoucherDate).toLocaleDateString()}</td>
                                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#475569' }}>{v.VoucherNo}</td>
                                            <td style={{ padding: '8px 12px' }}>{v.VoucherType}</td>
                                            <td style={{ padding: '8px 12px' }}>
                                                <span style={{ background: sb.bg, color: sb.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>
                                                    {v.Status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '0.8rem' }}>
                                                {v.SourceDocType ? `${v.SourceDocType} #${v.SourceDocID}` : '—'}
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#475569', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={v.LineSnippet || v.Remarks || ''}>
                                                {v.LineSnippet || v.Remarks || '—'}
                                            </td>
                                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{v.CreatedByName || '—'}</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(v.TotalAmount)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
