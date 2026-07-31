import React, { useState } from 'react';

// Shared chart primitives for report pages — dark "terminal" panel with a
// real coordinate frame (Y-axis gridlines + tick values, X-axis category
// labels). Plain SVG, no dependency. Still follows the house dataviz
// method underneath the aesthetic: validated categorical palette (dark-
// mode steps, see dataviz skill references/palette.md), legend for 2+
// series, direct value labels, per-mark hover tooltips, gap between
// touching marks. Bars are sharp-cornered rather than pill-rounded —
// a deliberate mark-spec swap for the terminal look (owner ask 2026-07-31).

// Dark-mode categorical steps from the validated palette (already CVD/
// contrast-checked against a dark surface — see palette.md).
export const CHART_COLORS = {
    blue:    '#3987e5',
    orange:  '#d95926',
    aqua:    '#199e70',
    yellow:  '#c98500',
    magenta: '#d55181',
    green:   '#008300',
    violet:  '#9085e9',
    red:     '#e66767',
};

const PANEL_BG   = '#0d0d0d';
const GRID       = '#2c2c2a';
const AXIS       = '#4a4a47';
const TEXT_PRI   = '#f2f2ef';
const TEXT_MUTED = '#8a8a85';
const MONO = 'ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, monospace';

const fmtCompact = (n) => {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    if (abs >= 1e7) return (v / 1e7).toFixed(2) + 'Cr';
    if (abs >= 1e5) return (v / 1e5).toFixed(2) + 'L';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
};

// "Nice" axis ticks — picks a round step (1/2/5 x 10^n) so gridlines land
// on clean numbers, per dataviz mark spec (Y-axis ticks round to clean
// numbers, thousands-comma'd).
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

function Panel({ title, legend, children }) {
    return (
        <div style={{
            background: PANEL_BG, border: '1px solid ' + AXIS, borderRadius: 2,
            padding: '14px 16px 10px', fontFamily: MONO,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.06em', color: TEXT_MUTED, textTransform: 'uppercase' }}>{title}</div>
                {legend && (
                    <div style={{ display: 'flex', gap: 14, fontSize: '0.7rem', color: TEXT_MUTED }}>
                        {legend.map(s => (
                            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 9, height: 9, background: s.color, display: 'inline-block' }} />
                                {s.label}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}

function AxisTooltip({ x, y, lines }) {
    return (
        <div style={{
            position: 'fixed', left: x, top: y - 14, transform: 'translate(-50%, -100%)', zIndex: 50,
            background: '#000', border: '1px solid ' + AXIS, color: TEXT_PRI,
            fontFamily: MONO, fontSize: '0.72rem', padding: '7px 10px', pointerEvents: 'none',
            whiteSpace: 'nowrap', lineHeight: 1.6,
        }}>
            {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                    <span style={{ color: l.color || TEXT_MUTED }}>{l.label}</span>
                    <span style={{ fontWeight: 700 }}>{l.value}</span>
                </div>
            ))}
        </div>
    );
}

/**
 * Vertical grouped/diverging column chart with a real Y-axis (gridlines +
 * tick values) and X-axis category labels — a true coordinate frame, not
 * label-only bars.
 */
export function GroupedBarChart({ data, series, formatValue = fmtCompact, height = 260, diverging = false, title }) {
    const [hover, setHover] = useState(null);
    if (!data || !data.length) return <Panel title={title}><Empty /></Panel>;

    const allVals = data.flatMap(d => series.map(s => Number(d[s.key]) || 0));
    const maxAbs = Math.max(1, ...allVals.map(v => Math.abs(v)));
    const hasNeg = diverging && allVals.some(v => v < 0);
    const ticks = niceTicks(maxAbs, 5);
    const axisMax = ticks[ticks.length - 1];
    const axisMin = hasNeg ? -axisMax : 0;
    const axisSpan = axisMax - axisMin;

    const padL = 64, padR = 16, padT = 12, padB = 30;
    const plotW = 640, plotH = height;
    const svgW = padL + plotW + padR, svgH = padT + plotH + padB;
    const yFor = (v) => padT + plotH - ((v - axisMin) / axisSpan) * plotH;
    const zeroY = yFor(0);

    const groupW = plotW / data.length;
    const barGap = 2;
    const barW = Math.min(24, (groupW - 16) / series.length - barGap);

    const legend = series.length >= 2 ? series.map(s => ({ key: s.key, label: s.label, color: s.color })) : null;

    return (
        <Panel title={title} legend={legend}>
            <div style={{ position: 'relative', overflowX: 'auto' }}>
                <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', minWidth: 420 }}>
                    {/* gridlines + Y ticks */}
                    {(hasNeg ? [...ticks.map(t => -t), ...ticks].filter((v, i, a) => a.indexOf(v) === i) : ticks).map(t => {
                        const y = yFor(t);
                        return (
                            <g key={t}>
                                <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={GRID} strokeWidth="1" />
                                <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill={TEXT_MUTED} fontFamily={MONO}>
                                    {t === 0 ? '0' : formatValue(t)}
                                </text>
                            </g>
                        );
                    })}
                    {/* axes */}
                    <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={AXIS} strokeWidth="1" />
                    <line x1={padL} y1={zeroY} x2={padL + plotW} y2={zeroY} stroke={AXIS} strokeWidth="1" />

                    {data.map((d, gi) => {
                        const gx = padL + gi * groupW + groupW / 2 - (series.length * (barW + barGap) - barGap) / 2;
                        return (
                            <g key={d.label}>
                                <text x={padL + gi * groupW + groupW / 2} y={svgH - 10} textAnchor="middle" fontSize="10.5" fill={TEXT_MUTED} fontFamily={MONO}>
                                    {d.label}
                                </text>
                                {series.map((s, si) => {
                                    const raw = Number(d[s.key]) || 0;
                                    const color = diverging ? (raw >= 0 ? CHART_COLORS.blue : CHART_COLORS.red) : s.color;
                                    const x = gx + si * (barW + barGap);
                                    const topY = raw >= 0 ? yFor(raw) : zeroY;
                                    const h = Math.max(1, Math.abs(zeroY - yFor(raw)));
                                    return (
                                        <g key={s.key}
                                           onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, lines: [{ label: s.label, value: formatValue(raw), color }] })}
                                           onMouseMove={(e) => setHover(h2 => h2 && { ...h2, x: e.clientX, y: e.clientY })}
                                           onMouseLeave={() => setHover(null)}
                                           style={{ cursor: 'pointer' }}>
                                            <rect x={x} y={topY} width={barW} height={h} fill={color} />
                                            {/* value cap label */}
                                            <text x={x + barW / 2} y={raw >= 0 ? topY - 4 : topY + h + 11} textAnchor="middle" fontSize="9.5" fill={TEXT_PRI} fontFamily={MONO}>
                                                {formatValue(raw)}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            </div>
            {hover && <AxisTooltip x={hover.x} y={hover.y} lines={hover.lines} />}
        </Panel>
    );
}

/**
 * Vertical stacked column chart — e.g. Cash + Credit stacked to Total,
 * one column per category, with the same Y-axis coordinate frame.
 */
export function StackedBarChart({ data, series, formatValue = fmtCompact, height = 260, title }) {
    const [hover, setHover] = useState(null);
    if (!data || !data.length) return <Panel title={title}><Empty /></Panel>;

    const totals = data.map(d => series.reduce((s, sr) => s + (Number(d[sr.key]) || 0), 0));
    const maxAbs = Math.max(1, ...totals);
    const ticks = niceTicks(maxAbs, 5);
    const axisMax = ticks[ticks.length - 1];

    const padL = 64, padR = 16, padT = 12, padB = 30;
    const plotW = 640, plotH = height;
    const svgW = padL + plotW + padR, svgH = padT + plotH + padB;
    const yFor = (v) => padT + plotH - (v / axisMax) * plotH;

    const groupW = plotW / data.length;
    const colW = Math.min(64, groupW - 24);
    const gap = 2;

    return (
        <Panel title={title} legend={series.map(s => ({ key: s.key, label: s.label, color: s.color }))}>
            <div style={{ position: 'relative', overflowX: 'auto' }}>
                <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', minWidth: 420 }}>
                    {ticks.map(t => {
                        const y = yFor(t);
                        return (
                            <g key={t}>
                                <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={GRID} strokeWidth="1" />
                                <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill={TEXT_MUTED} fontFamily={MONO}>
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
                        let cursorY = padT + plotH; // top of the stack built so far; starts at the baseline
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
                                <text x={padL + i * groupW + groupW / 2} y={svgH - 10} textAnchor="middle" fontSize="10.5" fill={TEXT_MUTED} fontFamily={MONO}>
                                    {d.label}
                                </text>
                                {segments.map(({ s, raw, y, h }) => (
                                    <rect key={s.key} x={cx} y={y} width={colW} height={h} fill={s.color}
                                          onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, lines: [{ label: s.label, value: formatValue(raw), color: s.color }] })}
                                          onMouseMove={(e) => setHover(h2 => h2 && { ...h2, x: e.clientX, y: e.clientY })}
                                          onMouseLeave={() => setHover(null)}
                                          style={{ cursor: 'pointer' }} />
                                ))}
                                <text x={padL + i * groupW + groupW / 2} y={yFor(total) - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill={TEXT_PRI} fontFamily={MONO}>
                                    {formatValue(total)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            {hover && <AxisTooltip x={hover.x} y={hover.y} lines={hover.lines} />}
        </Panel>
    );
}

function Empty() {
    return <div style={{ padding: 24, color: TEXT_MUTED, fontFamily: MONO, fontSize: '0.8rem' }}>NO DATA FOR THIS PERIOD</div>;
}
