/**
 * Voucher Browser — Odoo-style ERP list view.
 * Owner ask 2026-07-03: use control panel with filter chips for type/status/
 * date/amount/user + pagination. Keeps all API + navigation behaviour intact.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Loader2, RefreshCw, ChevronLeft, ChevronRight, Printer, User, Wallet,
    ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fmtDate } from '../utils/datetime';
import {
    ErpControlPanel, ErpSearchBar, ErpFilterChip, ErpFilterDropdown,
    ErpListView, ErpStatusPill, ErpEmptyState, ErpLoadingState,
} from '../components/erp';
import ReportPrintHeader from '../components/ReportPrintHeader';

const API_BASE = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Type → route mapping for click-through. Auto-posted vouchers (SI / PV / etc.)
// open in the JV view; VoucherEntry handles read-only display for any type.
const TYPE_TO_ROUTE = {
    CPV: '/vouchers/cpv', CRV: '/vouchers/crv', BPV: '/vouchers/bpv',
    BRV: '/vouchers/brv', JV:  '/vouchers/jv',
};
const ALL_TYPES = ['CPV', 'CRV', 'BPV', 'BRV', 'JV', 'SI', 'SS', 'SSR', 'PV', 'PRV'];

const STATUS_TONE = { Draft: 'muted', Posted: 'green', Reversed: 'red' };

const SOURCE_DOC_LABELS = {
    JOBCARD: 'Job Card', STORE_SALE: 'Store Sale',
    GRN: 'GRN', GRTN: 'GRTN', SSR: 'Store Sale Return',
    SALES_PAYMENT: 'Sales Payment', CHEQUE: 'Cheque',
};

const todayISO     = () => new Date().toISOString().slice(0, 10);
const yearStartISO = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

export default function VoucherBrowser() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [filters, setFilters] = useState({
        types: [],
        status: '',
        from: yearStartISO(),
        to: todayISO(),
        q: '',
        minAmount: '',
        maxAmount: '',
        createdById: '',
    });
    const [data, setData] = useState({ rows: [], total: 0, limit: 50, offset: 0 });
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);

    const reload = useCallback(async (opts = {}) => {
        const offset = opts.offset !== undefined ? opts.offset : data.offset;
        setBusy(true); setErr(null);
        try {
            const params = {
                type:        filters.types.join(',') || undefined,
                status:      filters.status || undefined,
                from:        filters.from || undefined,
                to:          filters.to || undefined,
                q:           filters.q || undefined,
                minAmount:   filters.minAmount || undefined,
                maxAmount:   filters.maxAmount || undefined,
                createdById: filters.createdById || undefined,
                limit: 50, offset,
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

    const toggleType = (t) => setFilters(f => ({
        ...f,
        types: f.types.includes(t) ? f.types.filter(x => x !== t) : [...f.types, t],
    }));

    const toggleMyVouchers = () => {
        if (!user?.userId) return;
        setFilters(f => ({ ...f, createdById: f.createdById ? '' : user.userId }));
    };
    const myVouchersOn = filters.createdById && user?.userId && Number(filters.createdById) === Number(user.userId);

    const openVoucher = (v) => {
        const route = TYPE_TO_ROUTE[v.VoucherType] || '/vouchers/jv';
        navigate(`${route}?id=${v.VoucherID}`);
    };

    const page     = Math.floor(data.offset / data.limit) + 1;
    const lastPage = Math.max(1, Math.ceil(data.total / data.limit));

    // ── Columns ────────────────────────────────────────────
    const columns = [
        { key: 'Date',    label: 'Date',
            render: v => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(v.VoucherDate)}</span> },
        { key: 'Voucher', label: 'Voucher #',
            render: v => <strong className="erp-mono" style={{ color: 'var(--erp-brand)' }}>{v.VoucherNo}</strong> },
        { key: 'Type',    label: 'Type',
            render: v => <ErpStatusPill tone="steel">{v.VoucherType}</ErpStatusPill> },
        { key: 'Status',  label: 'Status',
            render: v => <ErpStatusPill tone={STATUS_TONE[v.Status] || 'muted'}>{v.Status}</ErpStatusPill> },
        { key: 'Source',  label: 'Source',
            render: v => (
                <span style={{ fontSize: 12, color: 'var(--erp-text-muted)' }}>
                    {v.SourceDocType ? `${SOURCE_DOC_LABELS[v.SourceDocType] || v.SourceDocType} #${v.SourceDocID}` : '—'}
                </span>
            ) },
        { key: 'Remarks', label: 'Remarks / Line hit',
            render: v => (
                <span title={v.LineSnippet || v.Remarks || ''}
                    style={{ display: 'inline-block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                    {v.LineSnippet || v.Remarks || '—'}
                </span>
            ) },
        { key: 'By',      label: 'By',
            render: v => <span style={{ fontSize: 12, color: 'var(--erp-text-muted)' }}>{v.CreatedByName || '—'}</span> },
        { key: 'Amount', label: 'Amount', align: 'right',
            render: v => <strong>{fmt(v.TotalAmount)}</strong> },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Print-only header — the ONE shared report header, sourced from
                /api/settings/business-profile so no company details are
                hard-coded here (owner ask 2026-07-03). */}
            <ReportPrintHeader
                title={`Voucher Listing${myVouchersOn ? ` — ${user?.userName || 'My Vouchers'}` : ''}`}
                filterSummary={[
                    `Period: ${filters.from} → ${filters.to}`,
                    filters.types.length ? `Types: ${filters.types.join(', ')}` : null,
                    filters.status ? `Status: ${filters.status}` : null,
                ].filter(Boolean).join('  •  ')}
                printedAt={new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
            />

            <ErpControlPanel
                title="Voucher Browser"
                subtitle="Search every voucher across all types with status / date / amount / party filters."
                actions={
                    <>
                        {user?.userId && (
                            <button type="button" className={`erp-btn erp-btn-sm${myVouchersOn ? ' erp-btn-primary' : ''}`}
                                onClick={toggleMyVouchers}>
                                <User size={14} /> {myVouchersOn ? 'My vouchers' : 'Mine only'}
                            </button>
                        )}
                        <button type="button" className="erp-btn erp-btn-sm" onClick={() => reload({ offset: 0 })} disabled={busy}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Refresh
                        </button>
                        <button type="button" className="erp-btn erp-btn-sm" onClick={() => window.print()}
                            disabled={busy || data.rows.length === 0}>
                            <Printer size={14} /> Print
                        </button>
                    </>
                }
            >
                <ErpSearchBar value={filters.q} onChange={v => setFilters(f => ({ ...f, q: v }))}
                    placeholder="Search number, remarks, or line narration…" width={320} />

                <ErpFilterDropdown
                    icon={ShieldCheck}
                    label="Status"
                    items={[
                        { id: 'Draft', label: 'Draft' },
                        { id: 'Posted', label: 'Posted' },
                        { id: 'Reversed', label: 'Reversed' },
                    ]}
                    value={filters.status}
                    onChange={v => setFilters(f => ({ ...f, status: v }))}
                />

                <input type="date" value={filters.from}
                    onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                    style={dateStyle} title="From" />
                <input type="date" value={filters.to}
                    onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                    style={dateStyle} title="To" />

                <input type="number" step="0.01" value={filters.minAmount} placeholder="Min ₨"
                    onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value }))}
                    style={{ ...dateStyle, width: 100 }} />
                <input type="number" step="0.01" value={filters.maxAmount} placeholder="Max ₨"
                    onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
                    style={{ ...dateStyle, width: 100 }} />
            </ErpControlPanel>

            {/* Type chip row */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 4px' }}>
                <span style={{ fontSize: 11, color: 'var(--erp-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, alignSelf: 'center', marginRight: 4 }}>
                    <Wallet size={11} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} /> Types:
                </span>
                {ALL_TYPES.map(t => (
                    <ErpFilterChip key={t}
                        active={filters.types.includes(t)}
                        label={t}
                        onClick={() => toggleType(t)}
                    />
                ))}
            </div>

            {err && <div className="erp-alert danger">{err}</div>}

            {/* Pagination bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', background: 'var(--erp-surface)',
                border: '1px solid var(--erp-border)', borderRadius: 'var(--erp-radius)',
                fontSize: 12, color: 'var(--erp-text-muted)',
            }}>
                <div>
                    {busy ? 'Loading…' : `${data.total} matching voucher${data.total === 1 ? '' : 's'} · showing ${data.rows.length}`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" className="erp-btn erp-btn-sm"
                        onClick={() => reload({ offset: Math.max(0, data.offset - data.limit) })}
                        disabled={busy || data.offset === 0}>
                        <ChevronLeft size={13} />
                    </button>
                    <span>Page {page} of {lastPage}</span>
                    <button type="button" className="erp-btn erp-btn-sm"
                        onClick={() => reload({ offset: data.offset + data.limit })}
                        disabled={busy || page >= lastPage}>
                        <ChevronRight size={13} />
                    </button>
                </div>
            </div>

            {busy && data.rows.length === 0 ? (
                <ErpLoadingState message="Loading vouchers…" />
            ) : data.rows.length === 0 ? (
                <ErpEmptyState
                    title="No vouchers"
                    message="No vouchers match the current filters. Adjust the filter chips above."
                />
            ) : (
                <ErpListView
                    columns={columns}
                    rows={data.rows}
                    rowKey="VoucherID"
                    onRowClick={openVoucher}
                    emptyLabel=""
                    footerLeft={`${data.rows.length} of ${data.total} record${data.total === 1 ? '' : 's'}`}
                    footerRight={<span>Page {page} of {lastPage}</span>}
                />
            )}
        </div>
    );
}

const dateStyle = {
    height: 26,
    padding: '0 8px',
    border: '1px solid var(--erp-border-strong)',
    borderRadius: 'var(--erp-radius)',
    background: 'var(--erp-surface)',
    color: 'var(--erp-text)',
    fontSize: 12,
    outline: 'none',
};
