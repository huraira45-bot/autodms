// Cash/Credit vs Expense — Store Sale & Job Card. Owner ask 2026-07-31:
// how much of each is paid Cash vs Credit, weighed against the direct
// cost (COGS / sublet) posted on that same finalize voucher.
import React from 'react';
import { Wallet } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, yearStartISO, PeriodControls } from './ReportShell';
import { PremiumGroupedBarChart, PremiumStackedBarChart, FinanceKpiStrip, FINANCE_COLORS } from './charts';

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
                const combinedCash = cats.reduce((s, c) => s + c.cashRevenue, 0);
                const combinedCredit = cats.reduce((s, c) => s + c.creditRevenue, 0);
                const creditRatio = combinedRevenue > 0 ? (combinedCredit / combinedRevenue) * 100 : 0;
                return (
                    <>
                        <FinanceKpiStrip items={[
                            { label: 'Cash Revenue', value: 'PKR ' + fmt(combinedCash) },
                            { label: 'Credit Revenue', value: 'PKR ' + fmt(combinedCredit) },
                            { label: 'Total Revenue', value: 'PKR ' + fmt(combinedRevenue) },
                            { label: 'Total Expense', value: 'PKR ' + fmt(combinedExpense) },
                            { label: 'Net', value: 'PKR ' + fmt(combinedNet), tone: combinedNet >= 0 ? 'good' : 'bad' },
                            { label: 'Credit Ratio', value: creditRatio.toFixed(1) + '%', sub: 'of total revenue' },
                        ]} />

                        <PremiumStackedBarChart
                            title="Revenue — Cash vs Credit"
                            subtitle="Store Sale and Job Card revenue split by how it was collected."
                            data={[
                                { label: 'Store Sale', cash: data.storeSale.cashRevenue, credit: data.storeSale.creditRevenue },
                                { label: 'Job Card',   cash: data.jobCard.cashRevenue,   credit: data.jobCard.creditRevenue },
                            ]}
                            series={[
                                { key: 'cash',   label: 'Cash',   color: FINANCE_COLORS.cash },
                                { key: 'credit', label: 'Credit', color: FINANCE_COLORS.credit },
                            ]}
                        />

                        <PremiumGroupedBarChart
                            title="Revenue vs Expense"
                            subtitle="Total revenue against the direct cost (parts COGS / sublet) posted on the same finalize voucher."
                            data={[
                                { label: 'Store Sale', revenue: data.storeSale.totalRevenue, expense: data.storeSale.totalExpense },
                                { label: 'Job Card',   revenue: data.jobCard.totalRevenue,   expense: data.jobCard.totalExpense },
                            ]}
                            series={[
                                { key: 'revenue', label: 'Revenue', color: FINANCE_COLORS.revenue },
                                { key: 'expense', label: 'Expense', color: FINANCE_COLORS.expense },
                            ]}
                        />

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

                        {data.jobCardByBU && data.jobCardByBU.length > 0 && (
                            <>
                                <PremiumStackedBarChart
                                    title="Job Card — Cash vs Credit by Business Unit"
                                    subtitle="Sorted by total revenue, highest first."
                                    horizontal
                                    data={[...data.jobCardByBU]
                                        .sort((a, b) => b.totalRevenue - a.totalRevenue)
                                        .map(bu => ({ label: bu.label, cash: bu.cashRevenue, credit: bu.creditRevenue }))}
                                    series={[
                                        { key: 'cash',   label: 'Cash',   color: FINANCE_COLORS.cash },
                                        { key: 'credit', label: 'Credit', color: FINANCE_COLORS.credit },
                                    ]}
                                />

                                <div className="card" style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                <TH>Business Unit</TH>
                                                <TH align="right">Cash Revenue</TH>
                                                <TH align="right">Credit Revenue</TH>
                                                <TH align="right">Total Revenue</TH>
                                                <TH align="right">Expense</TH>
                                                <TH align="right">Net</TH>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.jobCardByBU.map(bu => (
                                                <tr key={bu.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <TD bold>{bu.label}</TD>
                                                    <TD align="right" mono>{fmt(bu.cashRevenue)}</TD>
                                                    <TD align="right" mono>{fmt(bu.creditRevenue)}</TD>
                                                    <TD align="right" bold>{fmt(bu.totalRevenue)}</TD>
                                                    <TD align="right" mono>{fmt(bu.totalExpense)}</TD>
                                                    <TD align="right" bold color={bu.totalNet >= 0 ? '#15803d' : '#b91c1c'}>{fmt(bu.totalNet)}</TD>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                );
            }}
        </ReportShell>
    );
}
