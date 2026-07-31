// Cash/Credit vs Expense — Store Sale & Job Card. Owner ask 2026-07-31:
// how much of each is paid Cash vs Credit, weighed against the direct
// cost (COGS / sublet) posted on that same finalize voucher.
import React from 'react';
import { Wallet } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, yearStartISO, PeriodControls } from './ReportShell';
import { StackedBarChart, GroupedBarChart, CHART_COLORS } from './charts';

export default function CashCreditExpense() {
    return (
        <ReportShell
            title="Cash/Credit vs Expense — Store Sale &amp; Job Card"
            subtitle="Cash vs Credit revenue for each, matched against the direct cost (parts COGS / sublet) on the same finalize voucher."
            icon={Wallet}
            endpoint="cash-credit-expense"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => {
                const cats = [data.storeSale, data.jobCard];
                const combinedRevenue = cats.reduce((s, c) => s + c.totalRevenue, 0);
                const combinedExpense = cats.reduce((s, c) => s + c.totalExpense, 0);
                const combinedNet = combinedRevenue - combinedExpense;
                return (
                    <>
                        <div className="card" style={{
                            background: combinedNet >= 0 ? '#f0fdf4' : '#fef2f2',
                            border: '1px solid ' + (combinedNet >= 0 ? '#bbf7d0' : '#fecaca'),
                            padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Combined Net</div>
                                <div style={{ fontWeight: 800, fontSize: '1.6rem', color: combinedNet >= 0 ? '#15803d' : '#b91c1c' }}>
                                    PKR {fmt(combinedNet)}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#475569', textAlign: 'right' }}>
                                <div>Revenue: PKR {fmt(combinedRevenue)}</div>
                                <div>Expense: PKR {fmt(combinedExpense)}</div>
                            </div>
                        </div>

                        <div className="card">
                            <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 12 }}>Revenue — Cash vs Credit</div>
                            <StackedBarChart
                                data={[
                                    { label: 'Store Sale', cash: data.storeSale.cashRevenue, credit: data.storeSale.creditRevenue },
                                    { label: 'Job Card',   cash: data.jobCard.cashRevenue,   credit: data.jobCard.creditRevenue },
                                ]}
                                series={[
                                    { key: 'cash',   label: 'Cash',   color: CHART_COLORS.blue },
                                    { key: 'credit', label: 'Credit', color: CHART_COLORS.orange },
                                ]}
                                formatValue={(v) => 'PKR ' + fmt(v)}
                            />
                        </div>

                        <div className="card">
                            <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 12 }}>Revenue vs Expense</div>
                            <GroupedBarChart
                                data={[
                                    { label: 'Store Sale', revenue: data.storeSale.totalRevenue, expense: data.storeSale.totalExpense },
                                    { label: 'Job Card',   revenue: data.jobCard.totalRevenue,   expense: data.jobCard.totalExpense },
                                ]}
                                series={[
                                    { key: 'revenue', label: 'Revenue', color: CHART_COLORS.blue },
                                    { key: 'expense', label: 'Expense', color: CHART_COLORS.aqua },
                                ]}
                                formatValue={(v) => 'PKR ' + fmt(v)}
                            />
                        </div>

                        <div className="card" style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Category</TH>
                                        <TH align="right">Cash Revenue</TH>
                                        <TH align="right">Credit Revenue</TH>
                                        <TH align="right">Total Revenue</TH>
                                        <TH align="right">Cash Expense</TH>
                                        <TH align="right">Credit Expense</TH>
                                        <TH align="right">Total Expense</TH>
                                        <TH align="right">Net</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cats.map(c => (
                                        <tr key={c.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD bold>{c.label}</TD>
                                            <TD align="right" mono>{fmt(c.cashRevenue)}</TD>
                                            <TD align="right" mono>{fmt(c.creditRevenue)}</TD>
                                            <TD align="right" bold>{fmt(c.totalRevenue)}</TD>
                                            <TD align="right" mono>{fmt(c.cashExpense)}</TD>
                                            <TD align="right" mono>{fmt(c.creditExpense)}</TD>
                                            <TD align="right" bold>{fmt(c.totalExpense)}</TD>
                                            <TD align="right" bold color={c.totalNet >= 0 ? '#15803d' : '#b91c1c'}>{fmt(c.totalNet)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td style={{ padding: 12, fontWeight: 700 }}>Total</td>
                                        <TD align="right" bold>{fmt(cats.reduce((s,c)=>s+c.cashRevenue,0))}</TD>
                                        <TD align="right" bold>{fmt(cats.reduce((s,c)=>s+c.creditRevenue,0))}</TD>
                                        <TD align="right" bold>{fmt(combinedRevenue)}</TD>
                                        <TD align="right" bold>{fmt(cats.reduce((s,c)=>s+c.cashExpense,0))}</TD>
                                        <TD align="right" bold>{fmt(cats.reduce((s,c)=>s+c.creditExpense,0))}</TD>
                                        <TD align="right" bold>{fmt(combinedExpense)}</TD>
                                        <TD align="right" bold color={combinedNet >= 0 ? '#15803d' : '#b91c1c'}>{fmt(combinedNet)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                );
            }}
        </ReportShell>
    );
}
