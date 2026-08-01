/**
 * Financial Ratios — dealership + standard financial health ratios, all
 * computed from existing GL data (see reportsController.getFinancialRatios
 * for exact sourcing; nothing here is invented or separately entered).
 * Owner ask 2026-08-01.
 *
 * Owner ask 2026-08-01 (follow-up): each ratio's formula, the actual
 * numbers plugged into it, and the result should sit together — not
 * numbers in one block and charts in another. Redesigned as one card per
 * ratio (formula + working + result), with a small benchmark gauge inline
 * wherever a benchmark exists.
 *
 * Benchmark bands are industry references, not this business's own targets:
 *   - Fixed Absorption Rate, Service/Parts gross margin — NADA / dealership
 *     fixed-ops guides (service labor 70-76% GP, parts 40-50% GP,
 *     absorption 90-100% ideal, <60% = heavily dependent on vehicle sales).
 *   - Current/Quick Ratio, Debt-to-Equity — standard corporate-finance
 *     rules of thumb (current ratio 1.0 minimum/1.5-2.0 healthy; quick
 *     ratio 0.5 minimum/1.0 healthy; debt-to-equity under ~2.0 considered
 *     safe for a small trading business).
 * DSO, DPO, Inventory Turnover and the Labor:Parts ratio show formula +
 * working + result same as the rest, just without a gauge — no confident
 * industry threshold for this specific business was available, so they
 * aren't graded against a fake benchmark.
 */
import React from 'react';
import ReportShell, { fmt, todayISO, yearStartISO, PeriodControls } from './ReportShell';

function SectionHeading({ children }) {
    return (
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginTop: 6 }}>
            {children}
        </div>
    );
}

const TONE_COLOR = { good: '#15803d', bad: '#b91c1c', default: '#0f172a' };
const TONE_BG    = { good: '#f0fdf4', bad: '#fef2f2', default: '#f8fafc' };

// tone thresholds — see file header for sources
function toneFor(value, { good, bad, invert = false } = {}) {
    if (value == null || good == null || bad == null) return 'default';
    if (invert) return value <= good ? 'good' : value <= bad ? 'default' : 'bad';
    return value >= good ? 'good' : value >= bad ? 'default' : 'bad';
}

// Small inline benchmark gauge — a colored red/amber/green track with a
// marker at the current value. Not a full chart; deliberately tiny so it
// sits inside a ratio card next to the number instead of taking a whole
// section of the page.
function MiniGauge({ value, min, max, bad, good, invert = false }) {
    if (value == null) return null;
    const clamp = (n) => Math.max(min, Math.min(max, n));
    const pos = (n) => ((clamp(n) - min) / (max - min)) * 100;
    const valuePos = pos(value);
    const badPos = pos(bad);
    const goodPos = pos(good);
    const zones = invert
        ? [
            { from: 0, to: goodPos, color: '#bbf7d0' },
            { from: goodPos, to: badPos, color: '#fde68a' },
            { from: badPos, to: 100, color: '#fecaca' },
        ]
        : [
            { from: 0, to: badPos, color: '#fecaca' },
            { from: badPos, to: goodPos, color: '#fde68a' },
            { from: goodPos, to: 100, color: '#bbf7d0' },
        ];
    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ position: 'relative', height: 7, borderRadius: 4, overflow: 'hidden', background: '#f1f5f9' }}>
                {zones.map((z, i) => (
                    <div key={i} style={{ position: 'absolute', left: `${z.from}%`, width: `${Math.max(0, z.to - z.from)}%`, top: 0, bottom: 0, background: z.color }} />
                ))}
                <div style={{ position: 'absolute', left: `${valuePos}%`, top: -3, bottom: -3, width: 3, background: '#0f172a', borderRadius: 2, transform: 'translateX(-1.5px)' }}
                     title={`Current: ${value}`} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#94a3b8', marginTop: 2 }}>
                <span>{min}</span>
                <span>{max}</span>
            </div>
        </div>
    );
}

// One ratio: formula, the actual numbers plugged in, the result, and
// (where a benchmark exists) a small gauge — all together in one card.
function RatioCard({ label, formula, working, result, sub, tone = 'default', gauge }) {
    return (
        <div className="card" style={{ padding: 14, background: TONE_BG[tone], border: '1px solid ' + (tone === 'good' ? '#bbf7d0' : tone === 'bad' ? '#fecaca' : '#e2e8f0') }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>{label}</div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 3 }}>{formula}</div>
                    <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>
                        {working}
                    </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: TONE_COLOR[tone], fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>
                        {result}
                    </div>
                    {sub && <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 1 }}>{sub}</div>}
                </div>
            </div>
            {gauge && <MiniGauge {...gauge} />}
        </div>
    );
}

const cardGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 };
const pk = (n) => 'PKR ' + fmt(n);

export default function FinancialRatios() {
    return (
        <ReportShell
            title="Financial Ratios"
            subtitle="Dealership fixed-ops ratios + standard financial health ratios — formula, working and result together for each, computed from your existing GL."
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
                        <div style={cardGrid}>
                            <RatioCard
                                label="Fixed Absorption Rate"
                                formula="(Service GP + Parts GP) ÷ Admin Overhead × 100"
                                working={`(${pk(f.serviceGP)} + ${pk(f.partsGP)}) ÷ ${pk(f.adminExpense)}`}
                                result={r.absorptionRate == null ? '—' : r.absorptionRate.toFixed(1) + '%'}
                                sub="target 90–100%"
                                tone={toneFor(r.absorptionRate, { good: 90, bad: 60 })}
                                gauge={r.absorptionRate == null ? null : { value: r.absorptionRate, min: 0, max: 120, bad: 60, good: 90 }}
                            />
                            <RatioCard
                                label="Service Gross Margin"
                                formula="Service GP ÷ Service Revenue × 100"
                                working={`${pk(f.serviceGP)} ÷ ${pk(f.serviceRevenue)}`}
                                result={r.serviceMargin == null ? '—' : r.serviceMargin.toFixed(1) + '%'}
                                sub="target 70–76%"
                                tone={toneFor(r.serviceMargin, { good: 70, bad: 50 })}
                                gauge={r.serviceMargin == null ? null : { value: r.serviceMargin, min: 0, max: 100, bad: 50, good: 70 }}
                            />
                            <RatioCard
                                label="Parts Gross Margin"
                                formula="Parts GP ÷ Parts Revenue × 100"
                                working={`${pk(f.partsGP)} ÷ ${pk(f.partsRevenue)}`}
                                result={r.partsMargin == null ? '—' : r.partsMargin.toFixed(1) + '%'}
                                sub="target 40–50%"
                                tone={toneFor(r.partsMargin, { good: 40, bad: 25 })}
                                gauge={r.partsMargin == null ? null : { value: r.partsMargin, min: 0, max: 100, bad: 25, good: 40 }}
                            />
                            <RatioCard
                                label="Labor : Parts Revenue"
                                formula="Service Revenue ÷ Parts Revenue"
                                working={`${pk(f.serviceRevenue)} ÷ ${pk(f.partsRevenue)}`}
                                result={r.laborPartsRatio == null ? '—' : r.laborPartsRatio.toFixed(2) + ' : 1'}
                                sub="no fixed target, ~1:1 is typical"
                            />
                            <RatioCard
                                label="Gross Profit Margin"
                                formula="(Total Revenue − COGS) ÷ Total Revenue × 100"
                                working={`(${pk(f.totalRevenue)} − ${pk(f.totalCogs)}) ÷ ${pk(f.totalRevenue)}`}
                                result={r.grossProfitMargin == null ? '—' : r.grossProfitMargin.toFixed(1) + '%'}
                                sub="overall, no fixed target"
                            />
                            <RatioCard
                                label="Net Profit Margin"
                                formula="Net Profit ÷ Total Revenue × 100"
                                working={`${pk(f.netProfit)} ÷ ${pk(f.totalRevenue)}`}
                                result={r.netProfitMargin == null ? '—' : r.netProfitMargin.toFixed(1) + '%'}
                                sub="overall"
                                tone={r.netProfitMargin == null ? 'default' : (r.netProfitMargin >= 0 ? 'good' : 'bad')}
                            />
                        </div>

                        <SectionHeading>Liquidity &amp; Solvency (as of {data.to})</SectionHeading>
                        <div style={cardGrid}>
                            <RatioCard
                                label="Current Ratio"
                                formula="Current Assets ÷ Current Liabilities"
                                working={`${pk(f.currentAssets)} ÷ ${pk(f.currentLiabilities)}`}
                                result={r.currentRatio == null ? '—' : r.currentRatio.toFixed(2) + 'x'}
                                sub="min 1.0, healthy 1.5–2.0"
                                tone={toneFor(r.currentRatio, { good: 1.5, bad: 1.0 })}
                                gauge={r.currentRatio == null ? null : { value: r.currentRatio, min: 0, max: 3, bad: 1.0, good: 1.5 }}
                            />
                            <RatioCard
                                label="Quick Ratio"
                                formula="(Current Assets − Inventory) ÷ Current Liabilities"
                                working={`(${pk(f.currentAssets)} − ${pk(f.inventory)}) ÷ ${pk(f.currentLiabilities)}`}
                                result={r.quickRatio == null ? '—' : r.quickRatio.toFixed(2) + 'x'}
                                sub="min 0.5, healthy ~1.0"
                                tone={toneFor(r.quickRatio, { good: 1.0, bad: 0.5 })}
                                gauge={r.quickRatio == null ? null : { value: r.quickRatio, min: 0, max: 2, bad: 0.5, good: 1.0 }}
                            />
                            <RatioCard
                                label="Debt-to-Equity"
                                formula="Total Liabilities ÷ Total Equity"
                                working={`${pk(f.totalLiabilities)} ÷ ${pk(f.totalEquity)}`}
                                result={r.debtToEquity == null ? '—' : r.debtToEquity.toFixed(2) + 'x'}
                                sub="lower is safer, keep under 2.0"
                                tone={toneFor(r.debtToEquity, { good: 1.0, bad: 2.0, invert: true })}
                                gauge={r.debtToEquity == null ? null : { value: r.debtToEquity, min: 0, max: 4, bad: 2.0, good: 1.0, invert: true }}
                            />
                            <RatioCard
                                label="Inventory Turnover"
                                formula="COGS ÷ Inventory × (365 ÷ Days in Period)"
                                working={`${pk(f.totalCogs)} ÷ ${pk(f.inventory)} × (365÷${data.daysInPeriod})`}
                                result={r.inventoryTurnoverAnnualized == null ? '—' : r.inventoryTurnoverAnnualized.toFixed(1) + 'x/yr'}
                                sub="annualized, no fixed target"
                            />
                        </div>

                        <SectionHeading>Cash Conversion</SectionHeading>
                        <div style={cardGrid}>
                            <RatioCard
                                label="Days Sales Outstanding"
                                formula="Trade Receivables ÷ Total Revenue × Days in Period"
                                working={`${pk(f.tradeReceivables)} ÷ ${pk(f.totalRevenue)} × ${data.daysInPeriod}d`}
                                result={r.dso == null ? '—' : r.dso.toFixed(0) + ' days'}
                                sub="avg days to collect receivables"
                            />
                            <RatioCard
                                label="Days Payable Outstanding"
                                formula="Trade Payables ÷ Purchases in Period × Days in Period"
                                working={`${pk(f.tradePayables)} ÷ ${pk(f.totalPurchases)} × ${data.daysInPeriod}d`}
                                result={r.dpo == null ? '—' : r.dpo.toFixed(0) + ' days'}
                                sub="avg days to pay suppliers"
                            />
                        </div>
                    </>
                );
            }}
        </ReportShell>
    );
}
