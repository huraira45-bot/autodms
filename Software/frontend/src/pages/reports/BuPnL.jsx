// Business Unit P&L — revenue (labour + parts) vs direct expenses
// (spares cost, paint cost, sublet cost) per JC business unit, with Cash /
// Credit toggle. Owner ask 2026-07-22.
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Scale } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

function BusinessUnitPicker({ params, updateParam }) {
    const [types, setTypes] = useState([]);
    useEffect(() => {
        axios.get('/api/workshop/job-types')
            .then(r => setTypes(r.data || []))
            .catch(() => setTypes([]));
    }, []);
    return (
        <label style={S.ctrlLabel}>
            Business Unit
            <select value={params.businessType || ''}
                    onChange={e => updateParam('businessType', e.target.value)}
                    style={S.ctrlInput}>
                <option value="">All</option>
                {types.map(t => (
                    <option key={t.JobCardTypeId} value={t.JobCardTypeId}>
                        {t.CardCode} — {t.Title}
                    </option>
                ))}
            </select>
        </label>
    );
}

function Controls({ params, updateParam }) {
    return (
        <>
            <label style={S.ctrlLabel}>
                From
                <input type="date" value={params.from || ''}
                       onChange={e => updateParam('from', e.target.value)}
                       style={S.ctrlInput} />
            </label>
            <label style={S.ctrlLabel}>
                To
                <input type="date" value={params.to || ''}
                       onChange={e => updateParam('to', e.target.value)}
                       style={S.ctrlInput} />
            </label>
            <BusinessUnitPicker params={params} updateParam={updateParam} />
            <label style={S.ctrlLabel}>
                Mode
                <select value={params.mode || ''}
                        onChange={e => updateParam('mode', e.target.value)}
                        style={S.ctrlInput}>
                    <option value="">All</option>
                    <option value="CASH">Cash only</option>
                    <option value="CREDIT">Credit only</option>
                </select>
            </label>
        </>
    );
}

// Colours consistent with the other Cash/Credit reports.
const CASH_BG   = '#f0fdf4';
const CREDIT_BG = '#eff6ff';

export default function BuPnL() {
    return (
        <ReportShell
            title="Business Unit P&L"
            subtitle="For each JC business unit — Labour + Parts revenue and direct expenses (spares cost, paint cost, sublet cost) with Cash / Credit split."
            icon={Scale}
            endpoint="/api/reports/bu-pnl"
            landscape
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), mode: '', businessType: '' }}
            controls={Controls}
            excelExport={(data) => ({
                filename: `bu-pnl-${todayISO()}.csv`,
                headers: [
                    'Code','Business Unit',
                    'Cash Cards','Cash Labour','Cash Parts','Cash Revenue','Cash Spares Cost','Cash Paint Cost','Cash Sublet Cost','Cash Cost','Cash Margin','Cash Margin %',
                    'Credit Cards','Credit Labour','Credit Parts','Credit Revenue','Credit Spares Cost','Credit Paint Cost','Credit Sublet Cost','Credit Cost','Credit Margin','Credit Margin %',
                    'Total Cards','Total Labour','Total Parts','Total Revenue','Total Spares Cost','Total Paint Cost','Total Sublet Cost','Total Cost','Total Margin','Total Margin %',
                ],
                rows: (data?.rows || []).map(r => [
                    r.Code, r.Name,
                    ...expandCell(r.Cash), ...expandCell(r.Credit), ...expandCell(r.Total),
                ]),
            })}
        >
            {(data) => (
                <>
                    <div className="card" style={S.kpiRow}>
                        <KPI label="Total Revenue"  value={`PKR ${fmt(data.totals?.Total?.Revenue || 0)}`} big strong />
                        <KPI label="Total Cost"     value={`PKR ${fmt(data.totals?.Total?.Cost    || 0)}`} colour="#b45309" />
                        <KPI label="Total Margin"   value={`PKR ${fmt(data.totals?.Total?.Margin  || 0)}`}
                             colour={(data.totals?.Total?.Margin || 0) >= 0 ? '#166534' : '#991b1b'} strong />
                        <KPI label="Cash Margin"    value={`PKR ${fmt(data.totals?.Cash?.Margin   || 0)}`} colour="#166534" />
                        <KPI label="Credit Margin"  value={`PKR ${fmt(data.totals?.Credit?.Margin || 0)}`} colour="#1e3a8a" />
                        <KPI label="Total Margin %"
                             value={`${data.totals?.Total?.MarginPct || 0}%`}
                             colour={(data.totals?.Total?.MarginPct || 0) >= 0 ? '#166534' : '#991b1b'} strong />
                    </div>

                    {data.rows.length === 0 ? (
                        <div className="card" style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>
                            No finalized job cards in this period.
                        </div>
                    ) : ['Cash', 'Credit', 'Total'].map(bucket => (
                        <BucketTable key={bucket} label={bucket}
                            rows={data.rows} bucketKey={bucket}
                            totals={data.totals?.[bucket]}
                            bg={bucket === 'Cash' ? CASH_BG : bucket === 'Credit' ? CREDIT_BG : '#f8fafc'} />
                    ))}
                </>
            )}
        </ReportShell>
    );
}

function BucketTable({ label, rows, bucketKey, totals, bg }) {
    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            <div style={{ padding: '10px 12px', fontWeight: 700, color: '#334155',
                          borderBottom: '1px solid #e2e8f0', background: bg,
                          fontSize: '0.9rem' }}>
                {label} — Revenue vs Direct Expenses
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <TH>Code</TH>
                        <TH>Business Unit</TH>
                        <TH align="right">Cards</TH>
                        <TH align="right">Labour Rev</TH>
                        <TH align="right">Parts Rev</TH>
                        <TH align="right">Revenue</TH>
                        <TH align="right">Spares Cost</TH>
                        <TH align="right">Paint Cost</TH>
                        <TH align="right">Sublet Cost</TH>
                        <TH align="right">Total Cost</TH>
                        <TH align="right">Margin</TH>
                        <TH align="right">Margin %</TH>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => {
                        const c = r[bucketKey];
                        if (!c || c.Cards === 0) return null;
                        const marginColour = c.Margin >= 0 ? '#166534' : '#991b1b';
                        return (
                            <tr key={r.Code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <TD mono bold>{r.Code}</TD>
                                <TD>{r.Name}</TD>
                                <TD align="right" mono>{fmtInt(c.Cards)}</TD>
                                <TD align="right" mono>{fmt(c.LabourRevenue)}</TD>
                                <TD align="right" mono>{fmt(c.PartsRevenue)}</TD>
                                <TD align="right" mono bold>{fmt(c.Revenue)}</TD>
                                <TD align="right" mono color="#b45309">{fmt(c.PartsCost)}</TD>
                                <TD align="right" mono color="#b45309">{fmt(c.PaintCost)}</TD>
                                <TD align="right" mono color="#b45309">{fmt(c.SubletCost)}</TD>
                                <TD align="right" mono color="#b45309" bold>{fmt(c.Cost)}</TD>
                                <TD align="right" mono bold color={marginColour}>{fmt(c.Margin)}</TD>
                                <TD align="right" mono bold color={marginColour}>{c.MarginPct}%</TD>
                            </tr>
                        );
                    })}
                </tbody>
                {totals && (
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                            <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Total:</td>
                            <TD align="right" mono bold>{fmtInt(totals.Cards)}</TD>
                            <TD align="right" mono bold>{fmt(totals.LabourRevenue)}</TD>
                            <TD align="right" mono bold>{fmt(totals.PartsRevenue)}</TD>
                            <TD align="right" mono bold>{fmt(totals.Revenue)}</TD>
                            <TD align="right" mono bold color="#b45309">{fmt(totals.PartsCost)}</TD>
                            <TD align="right" mono bold color="#b45309">{fmt(totals.PaintCost)}</TD>
                            <TD align="right" mono bold color="#b45309">{fmt(totals.SubletCost)}</TD>
                            <TD align="right" mono bold color="#b45309">{fmt(totals.Cost)}</TD>
                            <TD align="right" mono bold color={totals.Margin >= 0 ? '#166534' : '#991b1b'}>{fmt(totals.Margin)}</TD>
                            <TD align="right" mono bold color={totals.Margin >= 0 ? '#166534' : '#991b1b'}>{totals.MarginPct}%</TD>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

function expandCell(c) {
    if (!c) return Array(10).fill('');
    return [c.Cards, c.LabourRevenue, c.PartsRevenue, c.Revenue,
            c.PartsCost, c.PaintCost, c.SubletCost, c.Cost, c.Margin, c.MarginPct];
}

function KPI({ label, value, colour, big, strong }) {
    return (
        <div style={S.kpi}>
            <div style={S.kpiLabel}>{label}</div>
            <div style={{
                ...S.kpiValue,
                fontSize: big ? '1.4rem' : '1.05rem',
                fontWeight: strong ? 800 : 700,
                color: colour || '#0f172a',
            }}>
                {value}
            </div>
        </div>
    );
}

const S = {
    kpiRow: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' },
    kpi: { minWidth: 140 },
    kpiLabel: {
        fontSize: '0.7rem', color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        fontWeight: 700, marginBottom: 4,
    },
    kpiValue: { lineHeight: 1.1 },
    ctrlLabel: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.85rem', color: '#334155',
    },
    ctrlInput: {
        padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6,
        fontSize: '0.85rem',
    },
};
