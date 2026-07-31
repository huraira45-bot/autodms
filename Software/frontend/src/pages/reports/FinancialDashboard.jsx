// Financial Dashboard — every financial chart in one place. Owner ask
// 2026-07-31: pull all the visualizations (P&L by Department, Cash/Credit
// vs Expense) out of their table-report pages and into a single dedicated
// visual report. Reuses the same two backend endpoints those reports
// already call — no new backend route, no calculation changes.
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { LayoutDashboard, Loader2, RefreshCw, Printer } from 'lucide-react';
import ReportPrintHeader from '../../components/ReportPrintHeader';
import { fmt, todayISO, yearStartISO, DateInput } from './ReportShell';
import {
    PremiumGroupedBarChart, PremiumDivergingBarChart, PremiumStackedBarChart,
    FinanceKpiStrip, FINANCE_COLORS,
} from './charts';

export default function FinancialDashboard() {
    const [params, setParams]   = useState({ from: yearStartISO(), to: todayISO() });
    const [pnl, setPnl]         = useState(null);
    const [cce, setCce]         = useState(null);
    const [pnlErr, setPnlErr]   = useState(null);
    const [cceErr, setCceErr]   = useState(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const [pnlRes, cceRes] = await Promise.allSettled([
            axios.get('/api/reports/pnl-department', { params }),
            axios.get('/api/reports/cash-credit-expense', { params }),
        ]);
        if (pnlRes.status === 'fulfilled') { setPnl(pnlRes.value.data); setPnlErr(null); }
        else { setPnl(null); setPnlErr(pnlRes.reason?.response?.data?.error || pnlRes.reason?.message || 'Failed to load'); }
        if (cceRes.status === 'fulfilled') { setCce(cceRes.value.data); setCceErr(null); }
        else { setCce(null); setCceErr(cceRes.reason?.response?.data?.error || cceRes.reason?.message || 'Failed to load'); }
        setLoading(false);
    }, [params]);

    useEffect(() => { load(); }, [load]);
    const updateParam = (k, v) => setParams(p => ({ ...p, [k]: v }));

    useEffect(() => {
        document.body.classList.add('print-landscape');
        return () => document.body.classList.remove('print-landscape');
    }, []);

    const printedAt = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
    const filterSummary = params.from && params.to ? `Period: ${params.from} → ${params.to}` : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="report-landscape">
            <ReportPrintHeader
                title="Financial Dashboard"
                subtitle="P&L by Department and Cash/Credit vs Expense — every KPI and chart in one page."
                printedAt={printedAt}
                filterSummary={filterSummary}
            />
            <div className="erp-control-panel no-print">
                <div style={{ marginRight: 'auto' }}>
                    <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <LayoutDashboard size={16} color="var(--erp-brand)" /> Financial Dashboard
                    </div>
                    <div className="subtitle">P&L by Department and Cash/Credit vs Expense — every KPI and chart in one page.</div>
                </div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <DateInput label="From" value={params.from} onChange={v => updateParam('from', v)} />
                    <DateInput label="To"   value={params.to}   onChange={v => updateParam('to', v)} />
                    <button type="button" className="erp-btn erp-btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh
                    </button>
                    <button type="button" className="erp-btn erp-btn-sm erp-btn-primary" onClick={() => window.print()} disabled={loading}>
                        <Printer size={14} /> Print
                    </button>
                </div>
            </div>

            {pnl && <PnLByDepartmentSection data={pnl} />}
            {pnlErr && !pnl && <div className="erp-alert danger">P&amp;L by Department: {pnlErr}</div>}

            {cce && <CashCreditSection data={cce} />}
            {cceErr && !cce && <div className="erp-alert danger">Cash/Credit vs Expense: {cceErr}</div>}

            {!pnl && !cce && !loading && !pnlErr && !cceErr && (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No data.</div>
            )}
        </div>
    );
}

function SectionHeading({ children }) {
    return (
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginTop: 6 }}>
            {children}
        </div>
    );
}

// GLCode 501001 = Cost of Sold (parts/paint COGS) leaves; everything else
// under an expense group is department overhead (Direct Expense).
function splitExpense(dept) {
    const lines = dept.expenseLines || [];
    const cogs = lines.filter(l => String(l.GLCode || '').startsWith('501001'))
        .reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const direct = lines.filter(l => !String(l.GLCode || '').startsWith('501001'))
        .reduce((s, l) => s + (Number(l.amount) || 0), 0);
    return { direct, cogs };
}

function PnLByDepartmentSection({ data }) {
    const depts = data.departments || [];
    const revenueGen = depts.filter(d => d.revenueGenerating);
    const best  = revenueGen.length ? revenueGen.reduce((a, b) => (b.net > a.net ? b : a)) : null;
    const worst = revenueGen.length ? revenueGen.reduce((a, b) => (b.net < a.net ? b : a)) : null;

    return (
        <>
            <SectionHeading>P&amp;L by Department</SectionHeading>

            <FinanceKpiStrip items={[
                { label: 'Total Revenue', value: 'PKR ' + fmt(data.totalRevenue) },
                { label: 'Total Expense', value: 'PKR ' + fmt(data.totalExpense) },
                { label: 'Net Profit', value: 'PKR ' + fmt(data.netProfit), tone: data.netProfit >= 0 ? 'good' : 'bad' },
                { label: 'Best Department', value: best ? best.label : '—', sub: best ? 'PKR ' + fmt(best.net) : '', tone: 'good' },
                { label: 'Worst Department', value: worst ? worst.label : '—', sub: worst ? 'PKR ' + fmt(worst.net) : '', tone: worst && worst.net < 0 ? 'bad' : 'default' },
            ]} />

            <PremiumGroupedBarChart
                title="Revenue vs Expense by Department"
                subtitle="Expense split into Direct Expense (department overhead) and Cost of Sold (COGS)."
                data={depts.map(d => ({ label: d.label, revenue: d.revenue, ...splitExpense(d) }))}
                series={[
                    { key: 'revenue', label: 'Revenue', color: FINANCE_COLORS.revenue },
                    { key: 'direct',  label: 'Direct Expense', color: FINANCE_COLORS.direct },
                    { key: 'cogs',    label: 'Cost of Sold (COGS)', color: FINANCE_COLORS.cogs },
                ]}
            />

            <PremiumDivergingBarChart
                title="Net by Department"
                subtitle="Blue = profitable, red = loss. Admin (non-revenue-generating) sorts last."
                data={depts.map(d => ({ label: d.label, net: d.net }))}
                series={[{ key: 'net', label: 'Net' }]}
            />

            <PremiumStackedBarChart
                title="Expense Segregation by Department"
                subtitle="Same split as above, stacked to show each department's expense mix."
                data={depts.map(d => ({ label: d.label, ...splitExpense(d) }))}
                series={[
                    { key: 'direct', label: 'Direct Expense', color: FINANCE_COLORS.direct },
                    { key: 'cogs',   label: 'Cost of Sold (COGS)', color: FINANCE_COLORS.cogs },
                ]}
            />

            <PremiumDivergingBarChart
                title="Margin % by Department"
                subtitle="Net profit as a share of revenue, highest first. Admin (no revenue) is excluded — margin isn't meaningful without a revenue base."
                unit=""
                formatValue={(n) => n.toFixed(1) + '%'}
                formatExact={(n) => n.toFixed(2) + '%'}
                data={[...revenueGen]
                    .sort((a, b) => b.net / (b.revenue || 1) - a.net / (a.revenue || 1))
                    .map(d => ({ label: d.label, margin: d.revenue > 0 ? (d.net / d.revenue) * 100 : 0 }))}
                series={[{ key: 'margin', label: 'Margin %' }]}
            />
        </>
    );
}

function CashCreditSection({ data }) {
    const cats = [data.storeSale, data.jobCard];
    const combinedRevenue = cats.reduce((s, c) => s + c.totalRevenue, 0);
    const combinedExpense = cats.reduce((s, c) => s + c.totalExpense, 0);
    const combinedNet = combinedRevenue - combinedExpense;
    const combinedCash = cats.reduce((s, c) => s + c.cashRevenue, 0);
    const combinedCredit = cats.reduce((s, c) => s + c.creditRevenue, 0);
    const creditRatio = combinedRevenue > 0 ? (combinedCredit / combinedRevenue) * 100 : 0;

    return (
        <>
            <SectionHeading>Cash/Credit vs Expense</SectionHeading>

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

            {data.jobCardByBU && data.jobCardByBU.length > 0 && (
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
            )}

            {data.jobCardByBU && data.jobCardByBU.length > 0 && (
                <PremiumDivergingBarChart
                    title="Net by Business Unit"
                    subtitle="Job Card revenue less its direct cost, per business unit. Blue = profitable, red = loss — highest first."
                    data={[...data.jobCardByBU]
                        .sort((a, b) => b.totalNet - a.totalNet)
                        .map(bu => ({ label: bu.label, net: bu.totalNet }))}
                    series={[{ key: 'net', label: 'Net' }]}
                />
            )}
        </>
    );
}
