/**
 * Financial Ratios — dealership + standard financial health ratios, all
 * computed from existing GL data (see reportsController.getFinancialRatios
 * for exact sourcing; nothing here is invented or separately entered).
 * Owner ask 2026-08-01.
 *
 * Benchmark bands are industry references, not this business's own targets:
 *   - Fixed Absorption Rate, Service/Parts gross margin — NADA / dealership
 *     fixed-ops guides (service labor 70-76% GP, parts 40-50% GP,
 *     absorption 90-100% ideal, <60% = heavily dependent on vehicle sales).
 *   - Current/Quick Ratio, Debt-to-Equity — standard corporate-finance
 *     rules of thumb (current ratio 1.0 minimum/1.5-2.0 healthy; quick
 *     ratio 0.5 minimum/1.0 healthy; debt-to-equity under ~2.0 considered
 *     safe for a small trading business).
 * DSO, DPO, Inventory Turnover and the Labor:Parts ratio are shown as
 * plain numbers (no color-coded target) — no confident industry threshold
 * for this specific business was available, so they aren't graded.
 */
import React from 'react';
import ReportShell, { fmt, todayISO, yearStartISO, PeriodControls } from './ReportShell';
import {
    PremiumGroupedBarChart, PremiumDivergingBarChart,
    FinanceKpiStrip, FINANCE_COLORS,
} from './charts';

function SectionHeading({ children }) {
    return (
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginTop: 6 }}>
            {children}
        </div>
    );
}

const pctFmt = (n) => (n == null ? '—' : n.toFixed(1) + '%');
const xFmt   = (n) => (n == null ? '—' : n.toFixed(2) + 'x');
const dayFmt = (n) => (n == null ? '—' : n.toFixed(0) + 'd');

// tone thresholds — see file header for sources
const toneFor = (value, { good, bad, invert = false }) => {
    if (value == null) return 'default';
    if (invert) return value <= good ? 'good' : value <= bad ? 'default' : 'bad';
    return value >= good ? 'good' : value >= bad ? 'default' : 'bad';
};

export default function FinancialRatios() {
    return (
        <ReportShell
            title="Financial Ratios"
            subtitle="Dealership fixed-ops ratios + standard financial health ratios, computed from your existing GL — nothing entered separately."
            endpoint="financial-ratios"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => {
                const r = data.ratios || {};
                const f = data.figures || {};

                return (
                    <>
                        <SectionHeading>Fixed Ops Profitability</SectionHeading>
                        <FinanceKpiStrip items={[
                            { label: 'Fixed Absorption Rate', value: pctFmt(r.absorptionRate), sub: 'target 90–100%', tone: toneFor(r.absorptionRate, { good: 90, bad: 60 }) },
                            { label: 'Service Gross Margin', value: pctFmt(r.serviceMargin), sub: 'target 70–76%', tone: toneFor(r.serviceMargin, { good: 70, bad: 50 }) },
                            { label: 'Parts Gross Margin', value: pctFmt(r.partsMargin), sub: 'target 40–50%', tone: toneFor(r.partsMargin, { good: 40, bad: 25 }) },
                            { label: 'Labor : Parts Revenue', value: r.laborPartsRatio == null ? '—' : `${r.laborPartsRatio.toFixed(2)} : 1`, sub: 'target ~1:1' },
                            { label: 'Gross Profit Margin', value: pctFmt(r.grossProfitMargin), sub: 'overall' },
                            { label: 'Net Profit Margin', value: pctFmt(r.netProfitMargin), sub: 'overall', tone: r.netProfitMargin == null ? 'default' : (r.netProfitMargin >= 0 ? 'good' : 'bad') },
                        ]} />

                        <PremiumDivergingBarChart
                            title="Margins vs Minimum Benchmark"
                            subtitle="Percentage points above (blue) or below (red) the minimum acceptable level for each — not the raw margin itself."
                            unit=""
                            formatValue={(n) => (n >= 0 ? '+' : '') + n.toFixed(1) + 'pp'}
                            formatExact={(n) => (n >= 0 ? '+' : '') + n.toFixed(2) + 'pp'}
                            data={[
                                r.absorptionRate == null ? null : { label: 'Absorption Rate', delta: +(r.absorptionRate - 60).toFixed(1) },
                                r.serviceMargin   == null ? null : { label: 'Service Margin',  delta: +(r.serviceMargin - 50).toFixed(1) },
                                r.partsMargin     == null ? null : { label: 'Parts Margin',     delta: +(r.partsMargin - 25).toFixed(1) },
                            ].filter(Boolean)}
                            series={[{ key: 'delta', label: 'vs benchmark' }]}
                        />

                        <SectionHeading>Liquidity &amp; Solvency</SectionHeading>
                        <FinanceKpiStrip items={[
                            { label: 'Current Ratio', value: xFmt(r.currentRatio), sub: 'min 1.0, healthy 1.5–2.0', tone: toneFor(r.currentRatio, { good: 1.5, bad: 1.0 }) },
                            { label: 'Quick Ratio', value: xFmt(r.quickRatio), sub: 'min 0.5, healthy ~1.0', tone: toneFor(r.quickRatio, { good: 1.0, bad: 0.5 }) },
                            { label: 'Debt-to-Equity', value: xFmt(r.debtToEquity), sub: 'lower is safer, <2.0', tone: toneFor(r.debtToEquity, { good: 1.0, bad: 2.0, invert: true }) },
                            { label: 'Inventory Turnover', value: r.inventoryTurnoverAnnualized == null ? '—' : `${r.inventoryTurnoverAnnualized.toFixed(1)}x/yr`, sub: 'annualized, no fixed target' },
                        ]} />

                        <PremiumDivergingBarChart
                            title="Liquidity vs Minimum Benchmark"
                            subtitle="Ratio points above (blue) or below (red) the minimum safe level. Debt-to-Equity is inverted — positive means comfortably under the 2.0 ceiling."
                            unit=""
                            formatValue={(n) => (n >= 0 ? '+' : '') + n.toFixed(2) + 'x'}
                            formatExact={(n) => (n >= 0 ? '+' : '') + n.toFixed(2) + 'x'}
                            data={[
                                r.currentRatio == null ? null : { label: 'Current Ratio', delta: +(r.currentRatio - 1.0).toFixed(2) },
                                r.quickRatio   == null ? null : { label: 'Quick Ratio',    delta: +(r.quickRatio - 0.5).toFixed(2) },
                                r.debtToEquity == null ? null : { label: 'Debt-to-Equity headroom', delta: +(2.0 - r.debtToEquity).toFixed(2) },
                            ].filter(Boolean)}
                            series={[{ key: 'delta', label: 'vs benchmark' }]}
                        />

                        <SectionHeading>Cash Conversion</SectionHeading>
                        <FinanceKpiStrip items={[
                            { label: 'Days Sales Outstanding', value: dayFmt(r.dso), sub: 'avg days to collect receivables' },
                            { label: 'Days Payable Outstanding', value: dayFmt(r.dpo), sub: 'avg days to pay suppliers' },
                        ]} />

                        {(r.dso != null || r.dpo != null) && (
                            <PremiumGroupedBarChart
                                title="Days Sales vs Days Payable Outstanding"
                                subtitle="How long cash is tied up in receivables vs how long you hold onto payables — no universal benchmark, compare the two against each other."
                                unit=""
                                formatValue={(n) => n.toFixed(0) + 'd'}
                                formatExact={(n) => n.toFixed(1) + 'd'}
                                data={[{ label: `${data.from} → ${data.to}`, dso: r.dso || 0, dpo: r.dpo || 0 }]}
                                series={[
                                    { key: 'dso', label: 'DSO (receivables)', color: FINANCE_COLORS.credit },
                                    { key: 'dpo', label: 'DPO (payables)', color: FINANCE_COLORS.expense },
                                ]}
                            />
                        )}

                        <div className="card" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            <div style={{ fontWeight: 700, color: '#334155', marginBottom: 6 }}>Underlying figures for {data.from} → {data.to}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                                <div>Total Revenue: <b>PKR {fmt(f.totalRevenue)}</b></div>
                                <div>Total Expense: <b>PKR {fmt(f.totalExpense)}</b></div>
                                <div>Net Profit: <b>PKR {fmt(f.netProfit)}</b></div>
                                <div>Service Revenue / GP: <b>PKR {fmt(f.serviceRevenue)} / {fmt(f.serviceGP)}</b></div>
                                <div>Parts Revenue / GP: <b>PKR {fmt(f.partsRevenue)} / {fmt(f.partsGP)}</b></div>
                                <div>Admin (Overhead) Expense: <b>PKR {fmt(f.adminExpense)}</b></div>
                                <div>Current Assets / Liabilities: <b>PKR {fmt(f.currentAssets)} / {fmt(f.currentLiabilities)}</b></div>
                                <div>Inventory: <b>PKR {fmt(f.inventory)}</b></div>
                                <div>Trade Receivables / Payables: <b>PKR {fmt(f.tradeReceivables)} / {fmt(f.tradePayables)}</b></div>
                                <div>Total Liabilities / Equity: <b>PKR {fmt(f.totalLiabilities)} / {fmt(f.totalEquity)}</b></div>
                                <div>Purchases (GRN) in period: <b>PKR {fmt(f.totalPurchases)}</b></div>
                                <div>COGS (Service + Parts): <b>PKR {fmt(f.totalCogs)}</b></div>
                            </div>
                        </div>
                    </>
                );
            }}
        </ReportShell>
    );
}
