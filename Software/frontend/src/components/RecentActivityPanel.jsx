import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { History, Loader2, RotateCcw } from 'lucide-react';

const API_BASE = '/api';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_TO_ROUTE = {
    CPV: '/vouchers/cpv', CRV: '/vouchers/crv', BPV: '/vouchers/bpv',
    BRV: '/vouchers/brv', JV: '/vouchers/jv'
};

const STATUS_COLOR = {
    Posted:   { bg: '#dcfce7', col: '#15803d' },
    Reversed: { bg: '#fee2e2', col: '#b91c1c' },
    Draft:    { bg: '#f1f5f9', col: '#475569' }
};

// Friendly labels for the SourceDocType column on the voucher header.
// The user wants to see at a glance whether a posted receipt was against a
// Job Card walk-in, a Store Sale, a JC depreciation receipt, etc.
const SOURCE_LABEL = {
    JOBCARD:            'Job Card',
    JOBCARD_WALKIN:     'Walk-in JC',
    JOBCARD_DEP:        'JC Dep.',
    STORE_SALE:         'Store Sale',
    SSR:                'Sale Return',
    GRN:                'GRN',
    GRTN:               'GRN Return',
    POS_SETTLEMENT:     'POS',
    SALES_BOOKING:      'Sales Bk.',
    MANUAL:             'Manual',
};
const sourceTone = {
    JOBCARD: '#dbeafe',           JOBCARD_WALKIN: '#dbeafe',     JOBCARD_DEP: '#fef3c7',
    STORE_SALE: '#ccfbf1',        SSR: '#fee2e2',                GRN: '#ede9fe',
    GRTN: '#fde2e2',              POS_SETTLEMENT: '#fce7f3',     SALES_BOOKING: '#dcfce7',
    MANUAL: '#f1f5f9',
};

/**
 * Compact recent-activity sidebar. Used by Receive Payment / Make Payment / POS Settlement.
 *
 * Props:
 *   - title: section header (e.g. "Recent Receipts")
 *   - endpoint: full URL or path under /api to fetch (e.g. '/payments/recent')
 *   - params: query params (re-fetches when these change)
 *   - emptyMessage: shown when no rows
 *   - showBankColumn: render the BankAccount column (POS Settlement)
 *   - amountField: which numeric field to display (PartyAmount / TotalAmount / POSCleared)
 */
export default function RecentActivityPanel({
    title, endpoint, params, emptyMessage = 'No recent activity.',
    showBankColumn = false, amountField = 'PartyAmount'
}) {
    const navigate = useNavigate();
    const [rows, setRows]   = useState([]);
    const [busy, setBusy]   = useState(false);
    const [err, setErr]     = useState(null);

    const reload = async () => {
        setBusy(true); setErr(null);
        try {
            const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
            const r = await axios.get(url, { params });
            setRows(r.data || []);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setRows([]);
        }
        setBusy(false);
    };

    useEffect(() => {
        // The endpoint should decide what to return when optional params (like
        // partyId) are missing — e.g. /payments/recent without partyId now
        // returns the logged-in user's own receipts. Only skip when a truly
        // required field signals "not enough info to fetch" via an explicit
        // null params value.
        if (!params) { setRows([]); return; }
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(params)]);

    const openVoucher = (v) => {
        const route = TYPE_TO_ROUTE[v.VoucherType] || '/vouchers/jv';
        navigate(`${route}?id=${v.VoucherID}`);
    };

    return (
        <div className="card" style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                    <History size={18} /> <strong style={{ fontSize: '0.9rem' }}>{title}</strong>
                </div>
                <button
                    onClick={reload}
                    disabled={busy}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
                    title="Refresh"
                >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                </button>
            </div>

            {err && <div style={{ color: '#b91c1c', fontSize: '0.8rem', marginBottom: 8 }}>{err}</div>}

            {rows.length === 0 ? (
                <div style={{ padding: '20px 8px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {busy ? 'Loading...' : emptyMessage}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto' }}>
                    {rows.map(r => {
                        const sc = STATUS_COLOR[r.Status] || STATUS_COLOR.Posted;
                        return (
                            <div
                                key={r.VoucherID}
                                onClick={() => openVoucher(r)}
                                style={{
                                    padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
                                    cursor: 'pointer', fontSize: '0.8rem',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = '#f8fafc'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 4 }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>{r.VoucherNo}</span>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {r.SourceDocType && (
                                            <span style={{
                                                background: sourceTone[r.SourceDocType] || '#f1f5f9',
                                                color: '#334155', padding: '1px 6px', borderRadius: 99,
                                                fontSize: '0.62rem', fontWeight: 700, letterSpacing: 0.2,
                                            }}>
                                                {SOURCE_LABEL[r.SourceDocType] || r.SourceDocType}
                                            </span>
                                        )}
                                        <span style={{ background: sc.bg, color: sc.col, padding: '1px 6px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700 }}>
                                            {r.Status}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#64748b' }}>{new Date(r.VoucherDate).toLocaleDateString()}</span>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                        PKR {fmt(r[amountField] ?? r.TotalAmount)}
                                    </span>
                                </div>
                                {showBankColumn && r.BankAccount && (
                                    <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: 2 }}>{r.BankAccount}</div>
                                )}
                                {r.Remarks && (
                                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.Remarks}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
