import React from 'react';
import { TrendingUp, Scale, BookOpen } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, yearStartISO, PeriodControls, AsOfControl, SingleDateControl } from './ReportShell';

const sectionStyle = { background: '#eff6ff' };

// ---- Profit & Loss ----
export function PnL() {
    return (
        <ReportShell
            title="Profit & Loss"
            subtitle="Revenue − Expenses for the chosen period."
            icon={TrendingUp}
            endpoint="pnl"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <div className="card" style={{
                        background: data.netProfit >= 0 ? '#f0fdf4' : '#fef2f2',
                        border: '1px solid ' + (data.netProfit >= 0 ? '#bbf7d0' : '#fecaca'),
                        padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Net Profit</div>
                            <div style={{ fontWeight: 800, fontSize: '1.6rem', color: data.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                                PKR {fmt(data.netProfit)}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                            {data.from} → {data.to}
                        </div>
                    </div>

                    <Section title="REVENUE" rows={data.revenue.rows} total={data.revenue.total} />
                    <Section title="EXPENSES" rows={data.expenses.rows} total={data.expenses.total} />
                </>
            )}
        </ReportShell>
    );
}

function Section({ title, rows, total }) {
    return (
        <div className="card">
            <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 12 }}>{title}</div>
            {rows.length === 0 ? (
                <div style={{ padding: 16, color: '#64748b', fontStyle: 'italic' }}>No activity in this section.</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <TH>Code</TH><TH>Account</TH><TH align="right">Amount</TH>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.GLCAID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <TD mono color="#64748b">{r.GLCode}</TD>
                                <TD>{r.GLTitle}</TD>
                                <TD align="right" bold>{fmt(r.PeriodAmount)}</TD>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                            <td colSpan={2} style={{ padding: 12, fontWeight: 700 }}>Total {title}</td>
                            <TD align="right" bold>{fmt(total)}</TD>
                        </tr>
                    </tfoot>
                </table>
            )}
        </div>
    );
}

// ---- Balance Sheet ----
export function BalanceSheet() {
    return (
        <ReportShell
            title="Balance Sheet"
            subtitle="Assets vs. Liabilities + Equity as of the chosen date."
            icon={Scale}
            endpoint="balance-sheet"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{
                        background: Math.abs(data.diff) < 0.01 ? '#f0fdf4' : '#fef2f2',
                        border: '1px solid ' + (Math.abs(data.diff) < 0.01 ? '#bbf7d0' : '#fecaca'),
                        padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Status as of {data.asOf}</div>
                            <div style={{ fontWeight: 700, color: Math.abs(data.diff) < 0.01 ? '#15803d' : '#b91c1c' }}>
                                {Math.abs(data.diff) < 0.01 ? 'Balance Sheet is balanced' : `Out of balance by PKR ${fmt(data.diff)}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 24 }}>
                            <KPI label="Total Assets" value={data.assets.total} />
                            <KPI label="Liab + Equity" value={data.liabilitiesAndEquity} />
                        </div>
                    </div>

                    <Section title="ASSETS" rows={data.assets.rows.map(r => ({ ...r, PeriodAmount: r.Balance }))} total={data.assets.total} />
                    <Section title="LIABILITIES" rows={data.liabilities.rows.map(r => ({ ...r, PeriodAmount: r.Balance }))} total={data.liabilities.total} />
                    <Section title="EQUITY" rows={[
                        ...data.equity.rows.map(r => ({ ...r, PeriodAmount: r.Balance })),
                        { GLCAID: 'retained', GLCode: '—', GLTitle: 'Retained Earnings (period)', PeriodAmount: data.retainedEarnings }
                    ]} total={data.equity.total + data.retainedEarnings} />
                </>
            )}
        </ReportShell>
    );
}

const KPI = ({ label, value }) => (
    <div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>PKR {fmt(value)}</div>
    </div>
);

// ---- Day Book ----
export function DayBook() {
    return (
        <ReportShell
            title="Day Book"
            subtitle="All posted vouchers for the chosen date."
            icon={BookOpen}
            endpoint="day-book"
            defaultParams={{ date: todayISO() }}
            controls={SingleDateControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{data.date}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{data.vouchers.length} vouchers · PKR {fmt(data.total)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {Object.entries(data.byType).map(([type, amt]) => (
                                <div key={type} style={{ background: '#f1f5f9', padding: '6px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                                    <strong>{type}</strong>: {fmt(amt)}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="card">
                        {data.vouchers.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No vouchers posted on this date.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Voucher</TH><TH>Type</TH><TH>Remarks</TH><TH>Source</TH><TH>Created By</TH>
                                        <TH align="right">Lines</TH><TH align="right">Amount</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.vouchers.map(v => (
                                        <tr key={v.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD mono color="#475569">{v.VoucherNo}</TD>
                                            <TD>{v.VoucherType}</TD>
                                            <TD color="#475569">{v.Remarks}</TD>
                                            <TD>{v.SourceDocType ? `${v.SourceDocType} #${v.SourceDocID}` : '—'}</TD>
                                            <TD>{v.CreatedByName || '—'}</TD>
                                            <TD align="right">{v.LineCount}</TD>
                                            <TD align="right" bold>{fmt(v.TotalAmount)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}
