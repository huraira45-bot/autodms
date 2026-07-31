import React, { useState } from 'react';

// ============================================================================
// DealerDesk finance chart kit — premium banking-grade light panels.
// Replaces the earlier dark "terminal" style (owner ask 2026-07-31: "too
// dark, too terminal-like, not premium enough... banking-grade").
//
// Components: FinanceChartPanel, FinanceKpiStrip, FinanceKpiTile,
// PremiumGroupedBarChart, PremiumDivergingBarChart, PremiumStackedBarChart,
// ChartTooltip, ChartLegend.
//
// Still follows the house dataviz method underneath the new look: validated
// categorical-by-role palette (checked with the CVD/contrast validator for
// every pair that actually co-occurs in one chart — see commit message),
// real Y-axis with "nice" round-number gridlines, legend for 2+ series,
// selective direct labels (only when they fit), per-mark hover tooltips,
// 2px surface gap between touching bars/segments. No new npm dependency —
// plain SVG.
// ============================================================================

// Role-based financial palette (hex values are the validated light-mode
// steps from the house categorical ramp, reassigned by meaning rather than
// generic slot order — every pair that appears together in one chart has
// been re-validated as its own pair, see PR description).
export const FINANCE_COLORS = {
    revenue:  '#2a78d6', // professional blue
    expense:  '#e34948', // muted red
    positive: '#2a78d6', // net >= 0
    negative: '#e34948', // net < 0
    cash:     '#1baf7a', // teal/green
    credit:   '#4a3aa7', // steel violet-blue
    cogs:     '#eb6834', // amber/orange — the one highlighted cost segment
    direct:   '#64748b', // slate — "everything else" / neutral baseline
    neutral:  '#64748b',
};
// Back-compat alias — some callers still reference CHART_COLORS by hue name.
export const CHART_COLORS = {
    blue: FINANCE_COLORS.revenue, orange: FINANCE_COLORS.cogs, aqua: FINANCE_COLORS.cash,
    violet: FINANCE_COLORS.credit, red: FINANCE_COLORS.expense, slate: FINANCE_COLORS.neutral,
};

const INK = { primary: '#0f172a', secondary: '#475569', muted: '#94a3b8' };
const SURFACE = '#ffffff';
const SURFACE_HEADER = '#f8fafc';
const BORDER = '#e2e8f0';
const GRID = '#eef2f7';
const AXIS = '#cbd5e1';
const MONO = 'ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, monospace';

const fmtCompact = (n) => {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
};
const fmtFull = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "Nice" axis ticks — round step (1/2/5 x 10^n) so gridlines land on clean
// numbers.
function niceTicks(maxAbs, count = 5) {
    if (maxAbs <= 0) return [0, 1];
    const rough = maxAbs / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const niceMax = Math.ceil(maxAbs / step) * step;
    const ticks = [];
    for (let v = 0; v <= niceMax + step * 0.001; v += step) ticks.push(+v.toFixed(6));
    return ticks;
}

// ---------------------------------------------------------------------------
// FinanceChartPanel — the light "premium" card every chart renders inside.
// White surface, thin neutral border, subtle header band, compact title +
// optional subtitle, legend riding the header. Prints (these charts now
// live only on the chart-first Financial Dashboard report, which has no
// table to carry the printed record instead).
// ---------------------------------------------------------------------------
export function FinanceChartPanel({ title, subtitle, legend, actions, children }) {
    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                padding: '14px 18px', background: SURFACE_HEADER, borderBottom: '1px solid ' + BORDER,
                flexWrap: 'wrap',
            }}>
                <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: INK.primary }}>{title}</div>
                    {subtitle && <div style={{ fontSize: '0.72rem', color: INK.muted, marginTop: 2 }}>{subtitle}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {legend && <ChartLegend items={legend} />}
                    {actions}
                </div>
            </div>
            <div style={{ padding: '18px 18px 14px' }}>
                {children}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ChartLegend — identity channel, always present for 2+ series.
// ---------------------------------------------------------------------------
export function ChartLegend({ items }) {
    if (!items || items.length < 2) return null;
    return (
        <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', color: INK.secondary, flexWrap: 'wrap' }}>
            {items.map(s => (
                <span key={s.key || s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                    {s.label}
                </span>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// ChartTooltip — label, series name, exact amount, compact amount, optional
// share-of-total. `unit` prefixes the exact value (default 'PKR'); pass ''
// for non-currency series (e.g. a margin % chart).
// ---------------------------------------------------------------------------
export function ChartTooltip({ x, y, groupLabel, seriesLabel, color, exact, compact, share, unit = 'PKR' }) {
    return (
        <div style={{
            position: 'fixed', left: x, top: y - 14, transform: 'translate(-50%, -100%)', zIndex: 50,
            background: '#0f172a', color: '#f8fafc', fontSize: '0.72rem', padding: '9px 12px',
            borderRadius: 8, pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: 1.65,
            boxShadow: '0 8px 24px rgba(15,23,42,0.28)', fontFamily: MONO,
        }}>
            {groupLabel && <div style={{ fontWeight: 700, marginBottom: 3, fontFamily: 'inherit' }}>{groupLabel}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />}
                <span style={{ color: '#cbd5e1' }}>{seriesLabel}</span>
            </div>
            <div style={{ fontWeight: 700 }}>{unit ? unit + ' ' : ''}{exact}{compact && compact !== exact ? ` (${compact})` : ''}</div>
            {share != null && <div style={{ color: '#94a3b8' }}>{share.toFixed(1)}% of shown total</div>}
        </div>
    );
}

function Empty() {
    return <div style={{ padding: '28px 4px', color: INK.muted, fontSize: '0.82rem', textAlign: 'center' }}>No data for this period.</div>;
}

// ---------------------------------------------------------------------------
// FinanceKpiTile / FinanceKpiStrip
// ---------------------------------------------------------------------------
export function FinanceKpiTile({ label, value, sub, tone = 'default' }) {
    const toneColor = tone === 'good' ? '#15803d' : tone === 'bad' ? '#b91c1c' : INK.primary;
    return (
        <div style={{ flex: '1 1 140px', minWidth: 140 }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: INK.muted, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: toneColor, fontFamily: MONO, marginTop: 2 }}>{value}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: INK.secondary, marginTop: 1 }}>{sub}</div>}
        </div>
    );
}

export function FinanceKpiStrip({ items }) {
    if (!items || !items.length) return null;
    return (
        <div className="card" style={{
            display: 'flex', flexWrap: 'wrap', gap: 20, padding: '16px 20px',
            borderLeft: '3px solid ' + FINANCE_COLORS.revenue,
        }}>
            {items.map(it => <FinanceKpiTile key={it.label} {...it} />)}
        </div>
    );
}

// ---------------------------------------------------------------------------
// PremiumGroupedBarChart — vertical grouped columns, real Y-axis (gridlines
// + round-number ticks), X-axis category labels. `diverging` mode colors a
// single series by sign (positive/negative) and grows from a zero baseline.
// ---------------------------------------------------------------------------
export function PremiumGroupedBarChart({ data, series, title, subtitle, formatValue = fmtCompact, formatExact = fmtFull, unit = 'PKR', height = 240, diverging = false, showValueLabels = 'auto' }) {
    const [hover, setHover] = useState(null);
    const legend = series.length >= 2 ? series : null;
    if (!data || !data.length) return <FinanceChartPanel title={title} subtitle={subtitle}><Empty /></FinanceChartPanel>;

    const allVals = data.flatMap(d => series.map(s => Number(d[s.key]) || 0));
    const maxAbs = Math.max(1, ...allVals.map(v => Math.abs(v)));
    const hasNeg = diverging && allVals.some(v => v < 0);
    const ticks = niceTicks(maxAbs, 5);
    const axisMax = ticks[ticks.length - 1];
    const axisMin = hasNeg ? -axisMax : 0;
    const axisSpan = axisMax - axisMin;

    const padL = 60, padR = 16, padT = 10, padB = 32;
    const plotW = 660, plotH = height;
    const svgW = padL + plotW + padR, svgH = padT + plotH + padB;
    const yFor = (v) => padT + plotH - ((v - axisMin) / axisSpan) * plotH;
    const zeroY = yFor(0);

    const groupW = plotW / data.length;
    const barGap = 3;
    const barW = Math.min(30, (groupW - 20) / series.length - barGap);
    // Auto-suppress on-bar value labels once bars get too narrow to hold text cleanly.
    const labelsFit = showValueLabels === true || (showValueLabels === 'auto' && barW >= 16 && groupW / series.length >= 30);

    const seriesTotal = (key) => data.reduce((s, d) => s + Math.abs(Number(d[key]) || 0), 0);

    return (
        <FinanceChartPanel title={title} subtitle={subtitle} legend={legend}>
            <div style={{ position: 'relative', overflowX: 'auto' }}>
                <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', minWidth: 440 }}>
                    {(hasNeg ? [...ticks.map(t => -t), ...ticks].filter((v, i, a) => a.indexOf(v) === i) : ticks).map(t => {
                        const y = yFor(t);
                        return (
                            <g key={t}>
                                <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={GRID} strokeWidth="1" />
                                <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill={INK.muted} fontFamily={MONO}>
                                    {t === 0 ? '0' : formatValue(t)}
                                </text>
                            </g>
                        );
                    })}
                    <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={AXIS} strokeWidth="1" />
                    <line x1={padL} y1={zeroY} x2={padL + plotW} y2={zeroY} stroke={AXIS} strokeWidth="1" />

                    {data.map((d, gi) => {
                        const gx = padL + gi * groupW + groupW / 2 - (series.length * (barW + barGap) - barGap) / 2;
                        return (
                            <g key={d.label}>
                                <text x={padL + gi * groupW + groupW / 2} y={svgH - 12} textAnchor="middle" fontSize="11" fill={INK.secondary} fontFamily={MONO}>
                                    {d.label}
                                </text>
                                {series.map((s, si) => {
                                    const raw = Number(d[s.key]) || 0;
                                    const color = diverging ? (raw >= 0 ? FINANCE_COLORS.positive : FINANCE_COLORS.negative) : s.color;
                                    const x = gx + si * (barW + barGap);
                                    const topY = raw >= 0 ? yFor(raw) : zeroY;
                                    const h = Math.max(1, Math.abs(zeroY - yFor(raw)));
                                    const total = seriesTotal(s.key);
                                    const share = total > 0 ? (Math.abs(raw) / total) * 100 : null;
                                    return (
                                        <g key={s.key}
                                           onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, groupLabel: d.label, seriesLabel: s.label, color, exact: formatExact(raw), compact: formatValue(raw), share, unit })}
                                           onMouseMove={(e) => setHover(h2 => h2 && { ...h2, x: e.clientX, y: e.clientY })}
                                           onMouseLeave={() => setHover(null)}
                                           style={{ cursor: 'pointer' }}>
                                            <rect x={x} y={topY} width={Math.max(1, barW)} height={h} rx={1.5} fill={color} />
                                            {labelsFit && (
                                                <text x={x + barW / 2} y={raw >= 0 ? topY - 5 : topY + h + 12} textAnchor="middle" fontSize="10" fontWeight="600" fill={INK.primary} fontFamily={MONO}>
                                                    {formatValue(raw)}
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            </div>
            {hover && <ChartTooltip {...hover} />}
        </FinanceChartPanel>
    );
}

// PremiumDivergingBarChart — thin convenience wrapper: a single-series
// grouped chart with diverging=true baked in, for "Net" style views.
export function PremiumDivergingBarChart(props) {
    return <PremiumGroupedBarChart {...props} diverging />;
}

// Kept for callers still using the pre-redesign name.
export const GroupedBarChart = PremiumGroupedBarChart;

// ---------------------------------------------------------------------------
// PremiumStackedBarChart — vertical (default) or horizontal stacked bars,
// same coordinate frame. Horizontal reads better once there are more than
// ~5 categories or labels run long (e.g. many Job Card business units).
// ---------------------------------------------------------------------------
export function PremiumStackedBarChart({ data, series, title, subtitle, formatValue = fmtCompact, height = 240, horizontal = false }) {
    const [hover, setHover] = useState(null);
    if (!data || !data.length) return <FinanceChartPanel title={title} subtitle={subtitle}><Empty /></FinanceChartPanel>;

    const totals = data.map(d => series.reduce((s, sr) => s + (Number(d[sr.key]) || 0), 0));
    const maxAbs = Math.max(1, ...totals);
    const ticks = niceTicks(maxAbs, 5);
    const axisMax = ticks[ticks.length - 1];
    const grandTotal = totals.reduce((s, t) => s + t, 0);

    if (horizontal) {
        const padL = 130, padR = 70, padT = 8, padB = 26;
        const plotW = 560;
        const rowH = 26, rowGap = 12;
        const plotH = data.length * (rowH + rowGap) - rowGap;
        const svgW = padL + plotW + padR, svgH = padT + plotH + padB;
        const xFor = (v) => padL + (v / axisMax) * plotW;

        return (
            <FinanceChartPanel title={title} subtitle={subtitle} legend={series}>
                <div style={{ position: 'relative', overflowX: 'auto' }}>
                    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', minWidth: 440 }}>
                        {ticks.map(t => (
                            <g key={t}>
                                <line x1={xFor(t)} y1={padT} x2={xFor(t)} y2={padT + plotH} stroke={GRID} strokeWidth="1" />
                                <text x={xFor(t)} y={padT + plotH + 16} textAnchor="middle" fontSize="10" fill={INK.muted} fontFamily={MONO}>
                                    {t === 0 ? '0' : formatValue(t)}
                                </text>
                            </g>
                        ))}
                        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={AXIS} strokeWidth="1" />
                        {data.map((d, i) => {
                            const y = padT + i * (rowH + rowGap);
                            const total = series.reduce((s, sr) => s + (Number(d[sr.key]) || 0), 0);
                            let cursorX = padL;
                            const segs = series.map(s => {
                                const raw = Number(d[s.key]) || 0;
                                const w = (raw / axisMax) * plotW;
                                const seg = { s, raw, x: cursorX, w };
                                cursorX += w;
                                return seg;
                            });
                            return (
                                <g key={d.label}>
                                    <text x={padL - 10} y={y + rowH / 2 + 4} textAnchor="end" fontSize="11.5" fill={INK.secondary} fontFamily={MONO}>
                                        {d.label}
                                    </text>
                                    {segs.map(({ s, raw, x, w }, si) => (
                                        <rect key={s.key} x={x + (si > 0 ? 2 : 0)} y={y} width={Math.max(0, w - (si > 0 ? 2 : 0))} height={rowH} rx={1.5} fill={s.color}
                                              onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, groupLabel: d.label, seriesLabel: s.label, color: s.color, exact: fmtFull(raw), compact: formatValue(raw), share: total > 0 ? (raw / total) * 100 : null })}
                                              onMouseMove={(e) => setHover(h => h && { ...h, x: e.clientX, y: e.clientY })}
                                              onMouseLeave={() => setHover(null)}
                                              style={{ cursor: 'pointer' }} />
                                    ))}
                                    <text x={padL + Math.max(2, (total / axisMax) * plotW) + 8} y={y + rowH / 2 + 4} fontSize="11" fontWeight="700" fill={INK.primary} fontFamily={MONO}>
                                        {formatValue(total)}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
                {hover && <ChartTooltip {...hover} />}
            </FinanceChartPanel>
        );
    }

    const padL = 60, padR = 16, padT = 10, padB = 32;
    const plotW = 660, plotH = height;
    const svgW = padL + plotW + padR, svgH = padT + plotH + padB;
    const yFor = (v) => padT + plotH - (v / axisMax) * plotH;
    const groupW = plotW / data.length;
    const colW = Math.min(68, groupW - 28);
    const gap = 3;

    return (
        <FinanceChartPanel title={title} subtitle={subtitle} legend={series}>
            <div style={{ position: 'relative', overflowX: 'auto' }}>
                <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', minWidth: 440 }}>
                    {ticks.map(t => {
                        const y = yFor(t);
                        return (
                            <g key={t}>
                                <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={GRID} strokeWidth="1" />
                                <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill={INK.muted} fontFamily={MONO}>
                                    {t === 0 ? '0' : formatValue(t)}
                                </text>
                            </g>
                        );
                    })}
                    <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={AXIS} strokeWidth="1" />
                    <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={AXIS} strokeWidth="1" />

                    {data.map((d, i) => {
                        const cx = padL + i * groupW + groupW / 2 - colW / 2;
                        const total = series.reduce((s, sr) => s + (Number(d[sr.key]) || 0), 0);
                        let cursorY = padT + plotH;
                        let segIndex = 0;
                        const segments = series.map(s => {
                            const raw = Number(d[s.key]) || 0;
                            const segPxH = (raw / axisMax) * plotH;
                            if (segPxH <= 0) return { s, raw, y: cursorY, h: 0 };
                            if (segIndex > 0) cursorY -= gap;
                            const topY = cursorY - segPxH;
                            cursorY = topY;
                            segIndex += 1;
                            return { s, raw, y: topY, h: segPxH };
                        });
                        return (
                            <g key={d.label}>
                                <text x={padL + i * groupW + groupW / 2} y={svgH - 12} textAnchor="middle" fontSize="11" fill={INK.secondary} fontFamily={MONO}>
                                    {d.label}
                                </text>
                                {segments.map(({ s, raw, y, h }) => {
                                    const share = total > 0 ? (raw / total) * 100 : null;
                                    return (
                                        <rect key={s.key} x={cx} y={y} width={colW} height={h} rx={1.5} fill={s.color}
                                              onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, groupLabel: d.label, seriesLabel: s.label, color: s.color, exact: fmtFull(raw), compact: formatValue(raw), share })}
                                              onMouseMove={(e) => setHover(h2 => h2 && { ...h2, x: e.clientX, y: e.clientY })}
                                              onMouseLeave={() => setHover(null)}
                                              style={{ cursor: 'pointer' }} />
                                    );
                                })}
                                <text x={padL + i * groupW + groupW / 2} y={yFor(total) - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={INK.primary} fontFamily={MONO}>
                                    {formatValue(total)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            {hover && <ChartTooltip {...hover} />}
            {grandTotal <= 0 && <Empty />}
        </FinanceChartPanel>
    );
}

// Kept for callers still using the pre-redesign name.
export const StackedBarChart = PremiumStackedBarChart;
