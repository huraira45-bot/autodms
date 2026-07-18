// Charity Tracker report — every 1% accrual recorded in dms_CharityTracking,
// with per-voucher drill-down. No GL impact — purely a side ledger.
// Owner ask 2026-07-18. Gated behind the `charity_view` workflow permission.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartHandshake, ArrowRight } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, yearStartISO } from './ReportShell';

const SOURCE_META = {
    RECEIVE_PAYMENT_1PCT: { label: 'Auto · Receive', bg: '#dbeafe', color: '#1e40af' },
    MANUAL_VOUCHER_1PCT:  { label: 'Manual · Voucher', bg: '#fef3c7', color: '#92400e' },
};

// Same map VoucherBrowser / GL Detail use — clicking a row opens the source
// voucher in view mode. Anything not in the map falls back to /vouchers/jv;
// VoucherEntry loads by id regardless.
const TYPE_TO_ROUTE = {
    CPV: '/vouchers/cpv', CRV: '/vouchers/crv',
    BPV: '/vouchers/bpv', BRV: '/vouchers/brv',
    JV:  '/vouchers/jv',
};
const routeForType = (t) => TYPE_TO_ROUTE[t] || '/vouchers/jv';

function CharityControls({ params, updateParam }) {
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
                Source
                <select value={params.source || 'ALL'}
                        onChange={e => updateParam('source', e.target.value)}
                        style={S.ctrlInput}>
                    <option value="ALL">All</option>
                    <option value="RECEIVE_PAYMENT_1PCT">Auto · Receive</option>
                    <option value="MANUAL_VOUCHER_1PCT">Manual · Voucher</option>
                </select>
            </label>
        </>
    );
}

export default function Charity() {
    const navigate = useNavigate();
    return (
        <ReportShell
            title="Charity Tracker"
            subtitle="Every 1% accrual on receive-payments + manually-flagged vouchers. Not posted to any GL — internal side ledger only."
            icon={HeartHandshake}
            endpoint="/api/charity/entries"
            defaultParams={{ from: yearStartISO(), to: todayISO(), source: 'ALL' }}
            controls={CharityControls}
            excelExport={(data) => ({
                filename: `charity-tracker-${todayISO()}.csv`,
                headers: ['Date','Voucher #','Type','Party','Source','Voucher Amt','Charity Amt','Note','Created By'],
                rows: (data?.rows || []).map(r => [
                    r.CreatedAt ? new Date(r.CreatedAt).toLocaleDateString() : '',
                    r.VoucherNo || '',
                    r.VoucherTypeCode || '',
                    r.PartyName || '',
                    SOURCE_META[r.SourceType]?.label || r.SourceType,
                    Number(r.VoucherAmount || 0).toFixed(2),
                    Number(r.CharityAmount || 0).toFixed(2),
                    r.Note || r.Remarks || '',
                    r.CreatedByName || '',
                ]),
            })}
        >
            {(data) => (
                <>
                    {/* KPI strip */}
                    <div className="card" style={S.kpiRow}>
                        <KPI label="Total charity owed" strong big
                             value={`PKR ${fmt(data.summary?.totalOwed || 0)}`} colour="#16a34a" />
                        <KPI label="Vouchers" value={data.summary?.entryCount || 0} />
                        <KPI label="Auto (Receive)" value={data.summary?.receiveCount || 0} colour="#1e40af" />
                        <KPI label="Manual (Voucher)" value={data.summary?.manualCount || 0} colour="#92400e" />
                    </div>

                    {/* Table */}
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>
                                No charity entries in the selected period.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Date</TH>
                                        <TH>Voucher #</TH>
                                        <TH>Type</TH>
                                        <TH>Party</TH>
                                        <TH>Source</TH>
                                        <TH align="right">Voucher Amt</TH>
                                        <TH align="right">Charity Amt</TH>
                                        <TH>Note</TH>
                                        <TH></TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => {
                                        const meta = SOURCE_META[r.SourceType] || { label: r.SourceType, bg: '#e2e8f0', color: '#334155' };
                                        return (
                                            <tr key={r.CharityID}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: r.VoucherID ? 'pointer' : 'default' }}
                                                onClick={() => r.VoucherID && navigate(`${routeForType(r.VoucherTypeCode)}?id=${r.VoucherID}`)}
                                                title={r.VoucherID ? 'Open source voucher' : ''}>
                                                <TD>{new Date(r.CreatedAt).toLocaleDateString()}</TD>
                                                <TD mono color="#1e40af">{r.VoucherNo || '—'}</TD>
                                                <TD>{r.VoucherTypeCode || '—'}</TD>
                                                <TD>{r.PartyName || <span style={{ color: '#94a3b8' }}>—</span>}</TD>
                                                <TD>
                                                    <span style={{ background: meta.bg, color: meta.color,
                                                                    padding: '2px 8px', borderRadius: 12,
                                                                    fontSize: '0.72rem', fontWeight: 700 }}>
                                                        {meta.label}
                                                    </span>
                                                </TD>
                                                <TD align="right">{fmt(r.VoucherAmount)}</TD>
                                                <TD align="right" bold color="#166534">{fmt(r.CharityAmount)}</TD>
                                                <TD color="#64748b">{r.Note || r.Remarks || ''}</TD>
                                                <TD>{r.VoucherID && <ArrowRight size={12} color="#94a3b8" />}</TD>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={6} style={{ padding: 12, fontWeight: 700, textAlign: 'right' }}>Charity due:</td>
                                        <TD align="right" bold color="#166534">{fmt(data.summary?.totalOwed || 0)}</TD>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// ----- small components -----
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
    ctrlLabel: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.85rem', color: '#334155',
    },
    ctrlInput: {
        padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6,
        fontSize: '0.85rem',
    },
};
