import React, { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, PeriodControls } from './ReportShell';

const yearStart = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

const CLASS_LABELS = {
    '1': 'ASSETS', '2': 'LIABILITIES', '3': 'EQUITY',
    '4': 'REVENUE', '5': 'EXPENSES',
};

// CSV export — one row per account, headers first, totals footer.
function downloadCSV(rows, totals, from, to) {
    const header = ['GLCode', 'GLTitle', 'Nature',
                    'OpeningDr', 'OpeningCr',
                    'PeriodDr', 'PeriodCr',
                    'ClosingDr', 'ClosingCr'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map(r => [
        r.GLCode, r.GLTitle, r.Nature,
        r.OpeningDr, r.OpeningCr,
        r.PeriodDr, r.PeriodCr,
        r.ClosingDr, r.ClosingCr,
    ].map(esc).join(','));
    const foot = [
        '', 'TOTAL', '',
        totals.openingDr, totals.openingCr,
        totals.periodDr,  totals.periodCr,
        totals.closingDr, totals.closingCr,
    ].map(esc).join(',');
    const csv = [header.join(','), ...body, foot].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-balance-extract-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function TrialBalanceExtract() {
    const [showZeroPeriod, setShowZeroPeriod] = useState(true);
    return (
        <ReportShell
            title="Trial Balance Extract"
            subtitle="Six-column movement report — Opening / Period / Closing (Dr, Cr) per account. Only accounts that moved in the period or carried a balance."
            icon={FileBarChart}
            endpoint="trial-balance-extract"
            defaultParams={{ from: yearStart(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <div className="card" style={{ padding: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Stat label="Accounts"    value={fmtInt(data.rows.length)} />
                        <Stat label="Opening Dr"  value={'PKR ' + fmt(data.totals.openingDr)} />
                        <Stat label="Opening Cr"  value={'PKR ' + fmt(data.totals.openingCr)} />
                        <Stat label="Period Dr"   value={'PKR ' + fmt(data.totals.periodDr)}  colour="#0284c7" />
                        <Stat label="Period Cr"   value={'PKR ' + fmt(data.totals.periodCr)}  colour="#0284c7" />
                        <Stat label="Closing Dr"  value={'PKR ' + fmt(data.totals.closingDr)} strong />
                        <Stat label="Closing Cr"  value={'PKR ' + fmt(data.totals.closingCr)} strong />
                        <div style={{ flex: 1 }} />
                        <button className="btn no-print" onClick={() => downloadCSV(data.rows, data.totals, data.from, data.to)}>
                            Download CSV
                        </button>
                        <label className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', color: '#475569' }}>
                            <input type="checkbox" checked={showZeroPeriod} onChange={e => setShowZeroPeriod(e.target.checked)} />
                            Include accounts with no period movement
                        </label>
                    </div>

                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                    <TH>Code</TH>
                                    <TH>Account</TH>
                                    <TH align="right">Opening Dr</TH>
                                    <TH align="right">Opening Cr</TH>
                                    <TH align="right">Period Dr</TH>
                                    <TH align="right">Period Cr</TH>
                                    <TH align="right">Closing Dr</TH>
                                    <TH align="right">Closing Cr</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {renderRows(data.rows, showZeroPeriod)}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc', fontWeight: 800 }}>
                                    <td colSpan={2} style={{ padding: 10 }}>TOTAL</td>
                                    <TD align="right" bold>{fmt(data.totals.openingDr)}</TD>
                                    <TD align="right" bold>{fmt(data.totals.openingCr)}</TD>
                                    <TD align="right" bold>{fmt(data.totals.periodDr)}</TD>
                                    <TD align="right" bold>{fmt(data.totals.periodCr)}</TD>
                                    <TD align="right" bold>{fmt(data.totals.closingDr)}</TD>
                                    <TD align="right" bold>{fmt(data.totals.closingCr)}</TD>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// Group rows by class root, render each block with a header row.
function renderRows(rows, showZeroPeriod) {
    const filtered = showZeroPeriod
        ? rows
        : rows.filter(r => r.PeriodDr > 0.005 || r.PeriodCr > 0.005);
    if (filtered.length === 0) {
        return (
            <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                    No accounts moved in this period.
                </td>
            </tr>
        );
    }
    const grouped = {};
    for (const r of filtered) {
        (grouped[r.ClassRoot] = grouped[r.ClassRoot] || []).push(r);
    }
    const out = [];
    for (const k of Object.keys(grouped).sort()) {
        out.push(
            <tr key={`h${k}`} style={{ background: '#e2e8f0' }}>
                <td colSpan={8} style={{ padding: '6px 12px', fontWeight: 800, color: '#0f172a', letterSpacing: 0.4 }}>
                    Class {k} — {CLASS_LABELS[k] || 'UNCLASSIFIED'}
                </td>
            </tr>
        );
        for (const r of grouped[k]) {
            out.push(
                <tr key={r.GLCAID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <TD mono color="#475569">{r.GLCode}</TD>
                    <TD>{r.GLTitle}</TD>
                    <TD align="right" mono>{r.OpeningDr > 0.005 ? fmt(r.OpeningDr) : '—'}</TD>
                    <TD align="right" mono>{r.OpeningCr > 0.005 ? fmt(r.OpeningCr) : '—'}</TD>
                    <TD align="right" mono color={r.PeriodDr > 0.005 ? '#0284c7' : '#94a3b8'}>{r.PeriodDr > 0.005 ? fmt(r.PeriodDr) : '—'}</TD>
                    <TD align="right" mono color={r.PeriodCr > 0.005 ? '#0284c7' : '#94a3b8'}>{r.PeriodCr > 0.005 ? fmt(r.PeriodCr) : '—'}</TD>
                    <TD align="right" mono bold>{r.ClosingDr > 0.005 ? fmt(r.ClosingDr) : '—'}</TD>
                    <TD align="right" mono bold>{r.ClosingCr > 0.005 ? fmt(r.ClosingCr) : '—'}</TD>
                </tr>
            );
        }
    }
    return out;
}

function Stat({ label, value, colour = '#0f172a', strong }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
            <span style={{ fontSize: strong ? '0.95rem' : '0.85rem', fontWeight: strong ? 800 : 700, color: colour }}>{value}</span>
        </div>
    );
}
