import React, { useState } from 'react';

// Shared chart primitives for report pages. Plain SVG, no dependency —
// follows the house dataviz method: thin marks, 4px rounded data-ends,
// 2px surface gaps, legend for 2+ series, per-mark hover tooltips.
// Validated categorical palette (see dataviz skill references/palette.md):
export const CHART_COLORS = {
    blue:    '#2a78d6',
    orange:  '#eb6834',
    aqua:    '#1baf7a',
    yellow:  '#eda100',
    magenta: '#e87ba4',
    green:   '#008300',
    violet:  '#4a3aa7',
    red:     '#e34948',
};
const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781' };
const GRID = '#e1e0d9';
const BASELINE = '#c3c2b7';
const SURFACE = '#ffffff';

const fmtCompact = (n) => {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    if (abs >= 1e7) return (v / 1e7).toFixed(2) + 'Cr';
    if (abs >= 1e5) return (v / 1e5).toFixed(2) + 'L';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
};

function Tooltip({ x, y, children }) {
    return (
        <div style={{
            position: 'absolute', left: x, top: y, transform: 'translate(-50%, -100%)',
            background: '#0b0b0b', color: '#fff', fontSize: '0.75rem', padding: '6px 9px',
            borderRadius: 6, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>
            {children}
        </div>
    );
}

/**
 * Horizontal grouped bar chart. One row per data item, N thin bars per row
 * (one per series), scaled to a shared max across every series so bars are
 * comparable. Legend above (always present for 2+ series). Diverging mode
 * (single series, signed values) colors by sign instead of category.
 */
export function GroupedBarChart({ data, series, formatValue = fmtCompact, height = 34, diverging = false }) {
    const [hover, setHover] = useState(null); // { x, y, text }
    if (!data || !data.length) return <div style={{ padding: 16, color: INK.muted, fontStyle: 'italic', fontSize: '0.85rem' }}>No data for this period.</div>;

    const allVals = data.flatMap(d => series.map(s => Math.abs(Number(d[s.key]) || 0)));
    const max = Math.max(1, ...allVals);
    const barH = Math.min(24, Math.max(10, Math.floor((height - (series.length - 1) * 2) / series.length)));
    const rowH = barH * series.length + (series.length - 1) * 2 + 22; // +label space
    const labelColW = 132;
    const chartW = 520;

    return (
        <div style={{ position: 'relative' }}>
            {series.length >= 2 && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: '0.75rem', color: INK.secondary, flexWrap: 'wrap' }}>
                    {series.map(s => (
                        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: diverging ? undefined : s.color, display: 'inline-block' }} />
                            {s.label}
                        </span>
                    ))}
                </div>
            )}
            <svg width="100%" viewBox={`0 0 ${labelColW + chartW + 70} ${data.length * rowH}`} style={{ display: 'block', overflow: 'visible' }}>
                {data.map((d, i) => {
                    const y0 = i * rowH;
                    return (
                        <g key={d.label}>
                            <text x={labelColW - 10} y={y0 + rowH / 2 + 4} textAnchor="end" fontSize="12" fill={INK.secondary}>
                                {d.label}
                            </text>
                            {/* baseline */}
                            <line x1={labelColW} y1={y0 + 4} x2={labelColW} y2={y0 + rowH - 18} stroke={BASELINE} strokeWidth="1" />
                            {series.map((s, si) => {
                                const raw = Number(d[s.key]) || 0;
                                const w = (Math.abs(raw) / max) * chartW;
                                const barY = y0 + 4 + si * (barH + 2);
                                const color = diverging ? (raw >= 0 ? CHART_COLORS.blue : CHART_COLORS.red) : s.color;
                                const key = `${d.label}-${s.key}`;
                                return (
                                    <g key={key}
                                       onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: `${s.label}: ${formatValue(raw)}` })}
                                       onMouseMove={(e) => setHover(h => h && { ...h, x: e.clientX, y: e.clientY })}
                                       onMouseLeave={() => setHover(null)}
                                       style={{ cursor: 'pointer' }}>
                                        <rect x={labelColW} y={barY} width={Math.max(2, w)} height={barH} rx={4} fill={color} opacity={hover && !hover.text.startsWith(s.label) ? 0.55 : 1} />
                                        <text x={labelColW + Math.max(2, w) + 6} y={barY + barH / 2 + 4} fontSize="11" fill={INK.secondary}>
                                            {formatValue(raw)}
                                        </text>
                                    </g>
                                );
                            })}
                        </g>
                    );
                })}
            </svg>
            {hover && (
                <div style={{ position: 'fixed', left: hover.x, top: hover.y - 12, transform: 'translate(-50%, -100%)', zIndex: 50 }}>
                    <Tooltip x={0} y={0}>{hover.text}</Tooltip>
                </div>
            )}
        </div>
    );
}

/**
 * Horizontal stacked bar chart — e.g. Cash + Credit stacked to Total, one
 * bar per category. 2px surface gap between segments.
 */
export function StackedBarChart({ data, series, formatValue = fmtCompact, barH = 22 }) {
    const [hover, setHover] = useState(null);
    if (!data || !data.length) return <div style={{ padding: 16, color: INK.muted, fontStyle: 'italic', fontSize: '0.85rem' }}>No data for this period.</div>;

    const totals = data.map(d => series.reduce((s, sr) => s + (Number(d[sr.key]) || 0), 0));
    const max = Math.max(1, ...totals);
    const rowH = barH + 26;
    const labelColW = 132;
    const chartW = 520;

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: '0.75rem', color: INK.secondary, flexWrap: 'wrap' }}>
                {series.map(s => (
                    <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                        {s.label}
                    </span>
                ))}
            </div>
            <svg width="100%" viewBox={`0 0 ${labelColW + chartW + 80} ${data.length * rowH}`} style={{ display: 'block', overflow: 'visible' }}>
                {data.map((d, i) => {
                    const y0 = i * rowH;
                    const total = series.reduce((s, sr) => s + (Number(d[sr.key]) || 0), 0);
                    let cursor = 0;
                    return (
                        <g key={d.label}>
                            <text x={labelColW - 10} y={y0 + barH / 2 + 4} textAnchor="end" fontSize="12" fill={INK.secondary}>
                                {d.label}
                            </text>
                            <line x1={labelColW} y1={y0} x2={labelColW} y2={y0 + barH} stroke={BASELINE} strokeWidth="1" />
                            {series.map((s, si) => {
                                const raw = Number(d[s.key]) || 0;
                                const w = Math.max(raw > 0 ? 2 : 0, (raw / max) * chartW - (si > 0 ? 2 : 0));
                                const x = labelColW + cursor + (si > 0 ? 2 : 0);
                                cursor += (raw / max) * chartW;
                                const isFirst = si === 0;
                                const isLast = si === series.length - 1;
                                return (
                                    <rect key={s.key} x={x} y={y0} width={w} height={barH}
                                          rx={4}
                                          fill={s.color}
                                          onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, text: `${s.label}: ${formatValue(raw)}` })}
                                          onMouseMove={(e) => setHover(h => h && { ...h, x: e.clientX, y: e.clientY })}
                                          onMouseLeave={() => setHover(null)}
                                          style={{ cursor: 'pointer' }} />
                                );
                            })}
                            <text x={labelColW + Math.max(2, (total / max) * chartW) + 8} y={y0 + barH / 2 + 4} fontSize="11" fontWeight="700" fill={INK.primary}>
                                {formatValue(total)}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {hover && (
                <div style={{ position: 'fixed', left: hover.x, top: hover.y - 12, transform: 'translate(-50%, -100%)', zIndex: 50 }}>
                    <Tooltip x={0} y={0}>{hover.text}</Tooltip>
                </div>
            )}
        </div>
    );
}
