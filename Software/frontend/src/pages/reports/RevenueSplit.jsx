// Revenue Split (Cash vs Credit) — all revenue in a period broken down by
// payment mode. Owner ask 2026-07-21.
//   Cash   = voucher hit GENERAL_CUSTOMER (walk-in, paid same day)
//   Credit = voucher hit any other customer subsidiary GL (Trade Debtors
//            under a specific named party — bank/insurance/corporate)
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, ArrowRight } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, yearStartISO } from './ReportShell';

const MODE_META = {
    CASH:   { label: 'Cash',   bg: '#dcfce7', color: '#166534' },
    CREDIT: { label: 'Credit', bg: '#dbeafe', color: '#1e3a8a' },
};

const TYPE_ROUTE = {
    JC: '/vouchers/jv', SI: '/vouchers/jv', SSR: '/vouchers/jv',
    JV: '/vouchers/jv', CPV: '/vouchers/cpv', CRV: '/vouchers/crv',
    BPV: '/vouchers/bpv', BRV: '/vouchers/brv',
};

function RevenueSplitControls({ params, updateParam }) {
    return (
        <>
            <label style={S.ctrlLabel}>
                From
                <input type="date" value={params.from || ''}
                       onChange={e => updateParam('from', e.target.value)}
                       style={S.ctrlInput} />
            </label>
            <label style={S.ctrlLabel}>
                To
                <input type="date" value={params.to || ''}
                       onChange={e => updateParam('to', e.target.value)}
                       style={S.ctrlInput} />
            </label>
            <label style={S.ctrlLabel}>
                Mode
                <select value={params.mode || 'all'}
                        onChange={e => updateParam('mode', e.target.value)}
                        style={S.ctrlInput}>
                    <option value="all">All</option>
                    <option value="cash">Cash only</option>
                    <option value="credit">Credit only</option>
                </select>
            </label>
        </>
    );
}

export default function RevenueSplit() {
    const navigate = useNavigate();
    return (
        <ReportShell
            title="Revenue Split — Cash vs Credit"
            subtitle="All Workshop Revenue (401xxx) in the period. Cash = voucher hit GENERAL_CUSTOMER; Credit = named party's Trade Debtors."
            icon={Coins}
            endpoint="/api/reports/revenue-split"
            defaultParams={{ from: yearStartISO(), to: todayISO(), mode: 'all' }}
            controls={RevenueSplitControls}
            excelExport={(data) => ({
                filename: `revenue-split-${todayISO()}.csv`,
                headers: ['Date', 'Voucher #', 'Type', 'Source', 'Mode', 'Party', 'GL Code', 'GL Title', 'Amount'],
                rows: (data?.rows || []).map(r => [
                    r.VoucherDate ? new Date(r.VoucherDate).toLocaleDateString() : '',
                    r.VoucherNo || '',
                    r.VoucherTypeCode || '',
                    r.SourceDocType || '',
                    MODE_META[r.Mode]?.label || r.Mode,
                    r.PartyName || '',
                    r.GLCode || '',
                    r.GLTitle || '',
                    Number(r.RevenueAmount || 0).toFixed(2),
                ]),
            })}
        >
            {(data) => (
                <>
                    {/* KPI strip */}
                    <div className="card" style={S.kpiRow}>
                        <KPI label="Total revenue"   value={`PKR ${fmt(data.summary?.total   || 0)}`} big strong />
                        <KPI label="Cash revenue"    value={`PKR ${fmt(data.summary?.cash    || 0)}`} colour="#166534" />
                        <KPI label="Credit revenue"  value={`PKR ${fmt(data.summary?.credit  || 0)}`} colour="#1e3a8a" />
                        <KPI label="Cash vouchers"   value={data.summary?.cashVoucherCount   || 0} />
                        <KPI label="Credit vouchers" value={data.summary?.creditVoucherCount || 0} />
                    </div>

                    {/* By-GL breakdown */}
                    {data.summary?.byGL?.length > 0 && (
                        <div className="card">
                            <div style={S.sectionTitle}>By Revenue Account</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>GL Code</TH>
                                        <TH>GL Title</TH>
                                        <TH align="right">Cash</TH>
                                        <TH align="right">Credit</TH>
                                        <TH align="right">Total</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.summary.byGL.map(b => (
                                        <tr key={b.GLCode} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD mono>{b.GLCode}</TD>
                                            <TD>{b.GLTitle}</TD>
                                            <TD align="right" color="#166534">{fmt(b.Cash)}</TD>
                                            <TD align="right" color="#1e3a8a">{fmt(b.Credit)}</TD>
                                            <TD align="right" bold>{fmt(b.Total)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={2} style={{ padding: 12, fontWeight: 700, textAlign: 'right' }}>Total:</td>
                                        <TD align="right" bold color="#166534">{fmt(data.summary.cash || 0)}</TD>
                                        <TD align="right" bold color="#1e3a8a">{fmt(data.summary.credit || 0)}</TD>
                                        <TD align="right" bold>{fmt(data.summary.total || 0)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* Per-voucher detail */}
                    <div className="card">
                        <div style={S.sectionTitle}>Vouchers</div>
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>
                                No revenue vouchers match the selected filters.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Date</TH>
                                        <TH>Voucher #</TH>
                                        <TH>Source</TH>
                                        <TH>Mode</TH>
                                        <TH>Party</TH>
                                        <TH>GL</TH>
                                        <TH align="right">Amount</TH>
                                        <TH></TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((r, idx) => {
                                        const meta = MODE_META[r.Mode] || { label: r.Mode, bg: '#e2e8f0', color: '#334155' };
                                        return (
                                            <tr key={`${r.VoucherID}-${r.GLCode}-${idx}`}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                                onClick={() => navigate(`${TYPE_ROUTE[r.VoucherTypeCode] || '/vouchers/jv'}?id=${r.VoucherID}`)}
                                                title="Open source voucher">
                                                <TD>{new Date(r.VoucherDate).toLocaleDateString()}</TD>
                                                <TD mono color="#1e40af">{r.VoucherNo}</TD>
                                                <TD>{r.SourceDocType || r.VoucherTypeCode || ''}</TD>
                                                <TD>
                                                    <span style={{ background: meta.bg, color: meta.color,
                                                                    padding: '2px 8px', borderRadius: 12,
                                                                    fontSize: '0.72rem', fontWeight: 700 }}>
                                                        {meta.label}
                                                    </span>
                                                </TD>
                                                <TD>{r.PartyName || <span style={{ color: '#94a3b8' }}>Walk-in</span>}</TD>
                                                <TD mono style={{ fontSize: '0.78rem' }}>
                                                    <div>{r.GLCode}</div>
                                                    <div style={{ color: '#64748b' }}>{r.GLTitle}</div>
                                                </TD>
                                                <TD align="right" bold>{fmt(r.RevenueAmount)}</TD>
                                                <TD><ArrowRight size={12} color="#94a3b8" /></TD>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

function KPI({ label, value, colour, big, strong }) {
    return (
        <div style={S.kpi}>
            <div style={S.kpiLabel}>{label}</div>
            <div style={{
                ...S.kpiValue,
                fontSize: big ? '1.4rem' : '1.05rem',
                fontWeight: strong ? 800 : 700,
                color: colour || '#0f172a',
            }}>
                {value}
            </div>
        </div>
    );
}

const S = {
    kpiRow: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' },
    kpi: { minWidth: 140 },
    kpiLabel: {
        fontSize: '0.7rem', color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        fontWeight: 700, marginBottom: 4,
    },
    kpiValue: { lineHeight: 1.1 },
    sectionTitle: { padding: '10px 12px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.85rem' },
    ctrlLabel: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.85rem', color: '#334155',
    },
    ctrlInput: {
        padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6,
        fontSize: '0.85rem',
    },
};
