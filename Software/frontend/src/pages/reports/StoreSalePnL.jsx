// Store Sale P&L — revenue vs cost per finalized SS invoice, rolled up by
// party (with Walk-in as the single Cash bucket). Owner ask 2026-07-22.
import React from 'react';
import { Store } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

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
            <label style={S.ctrlLabel}>
                Mode
                <select value={params.mode || ''}
                        onChange={e => updateParam('mode', e.target.value)}
                        style={S.ctrlInput}>
                    <option value="">All</option>
                    <option value="CASH">Cash only (walk-in)</option>
                    <option value="CREDIT">Credit only (named party)</option>
                </select>
            </label>
        </>
    );
}

export default function StoreSalePnL() {
    return (
        <ReportShell
            title="Store Sale P&L"
            subtitle="Revenue vs Cost per finalized Store Sale invoice, rolled up by Party. Anchored on voucher date so revenue ties to GL 401003001."
            icon={Store}
            endpoint="/api/reports/store-sale-pnl"
            landscape
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), mode: '' }}
            controls={Controls}
            excelExport={(data) => ({
                filename: `store-sale-pnl-${todayISO()}.csv`,
                headers: ['Date','Invoice #','Customer / Party','Mode','Lines','Revenue (Gross)','Discount','Net Revenue','Cost','Margin','Margin %'],
                rows: (data?.invoices || []).map(r => [
                    r.DocDate, r.InvoiceNo, r.Customer, r.Mode,
                    r.Lines, r.Revenue, r.Discount, r.NetRevenue, r.Cost, r.Margin, r.MarginPct,
                ]),
            })}
        >
            {(data) => {
                const t = data.totals || {};
                const marginColour = (n) => (n || 0) >= 0 ? '#166534' : '#991b1b';
                return (
                    <>
                        <div className="card" style={S.kpiRow}>
                            <KPI label="Gross Revenue"      value={`PKR ${fmt(t.Total?.Revenue    || 0)}`} big strong />
                            <KPI label="(−) Discount"       value={`PKR ${fmt(t.Total?.Discount   || 0)}`} colour="#b45309" />
                            <KPI label="(−) Cost"           value={`PKR ${fmt(t.Total?.Cost       || 0)}`} colour="#b45309" />
                            <KPI label="Margin"             value={`PKR ${fmt(t.Total?.Margin     || 0)}`}
                                 colour={marginColour(t.Total?.Margin)} strong />
                            <KPI label="Cash Margin"        value={`PKR ${fmt(t.Cash?.Margin      || 0)}`} colour="#166534" />
                            <KPI label="Credit Margin"      value={`PKR ${fmt(t.Credit?.Margin    || 0)}`} colour="#1e3a8a" />
                            <KPI label="Margin %"           value={`${t.Total?.MarginPct || 0}%`}
                                 colour={marginColour(t.Total?.MarginPct)} strong />
                        </div>

                        <PartyTable rows={data.byParty || []} totals={t} />

                        <InvoiceTable rows={data.invoices || []} />
                    </>
                );
            }}
        </ReportShell>
    );
}

function PartyTable({ rows, totals }) {
    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            <div style={{ padding: '10px 12px', fontWeight: 700, color: '#334155',
                          borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                          fontSize: '0.9rem' }}>
                By Party — Cash (Walk-in) vs Credit (named)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <TH>Mode</TH>
                        <TH>Customer / Party</TH>
                        <TH align="right">Invoices</TH>
                        <TH align="right">Lines</TH>
                        <TH align="right">Revenue</TH>
                        <TH align="right">Discount</TH>
                        <TH align="right">Cost</TH>
                        <TH align="right">Margin</TH>
                        <TH align="right">Margin %</TH>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                            No finalized store sales in this period.
                        </td></tr>
                    )}
                    {rows.map(r => {
                        const c = r.Margin >= 0 ? '#166534' : '#991b1b';
                        return (
                            <tr key={r.Key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <TD>
                                    <span style={{
                                        background: r.Mode === 'CREDIT' ? '#dbeafe' : '#dcfce7',
                                        color: r.Mode === 'CREDIT' ? '#1e3a8a' : '#166534',
                                        padding: '2px 8px', borderRadius: 12,
                                        fontSize: '0.72rem', fontWeight: 700,
                                    }}>{r.Mode === 'CREDIT' ? 'Credit' : 'Cash'}</span>
                                </TD>
                                <TD bold>{r.Label}</TD>
                                <TD align="right" mono>{fmtInt(r.Invoices)}</TD>
                                <TD align="right" mono>{fmtInt(r.Lines)}</TD>
                                <TD align="right" mono bold>{fmt(r.Revenue)}</TD>
                                <TD align="right" mono color="#b45309">{fmt(r.Discount)}</TD>
                                <TD align="right" mono color="#b45309">{fmt(r.Cost)}</TD>
                                <TD align="right" mono bold color={c}>{fmt(r.Margin)}</TD>
                                <TD align="right" mono bold color={c}>{r.MarginPct}%</TD>
                            </tr>
                        );
                    })}
                </tbody>
                {totals && (
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                            <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Total:</td>
                            <TD align="right" mono bold>{fmtInt(totals.Total?.Invoices || 0)}</TD>
                            <TD align="right" mono bold>—</TD>
                            <TD align="right" mono bold>{fmt(totals.Total?.Revenue || 0)}</TD>
                            <TD align="right" mono bold color="#b45309">{fmt(totals.Total?.Discount || 0)}</TD>
                            <TD align="right" mono bold color="#b45309">{fmt(totals.Total?.Cost || 0)}</TD>
                            <TD align="right" mono bold color={(totals.Total?.Margin || 0) >= 0 ? '#166534' : '#991b1b'}>{fmt(totals.Total?.Margin || 0)}</TD>
                            <TD align="right" mono bold color={(totals.Total?.MarginPct || 0) >= 0 ? '#166534' : '#991b1b'}>{totals.Total?.MarginPct || 0}%</TD>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

function InvoiceTable({ rows }) {
    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            <div style={{ padding: '10px 12px', fontWeight: 700, color: '#334155',
                          borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                          fontSize: '0.9rem' }}>
                Invoice Detail
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <TH>Date</TH>
                        <TH>Invoice #</TH>
                        <TH>Customer / Party</TH>
                        <TH>Mode</TH>
                        <TH align="right">Lines</TH>
                        <TH align="right">Revenue</TH>
                        <TH align="right">Discount</TH>
                        <TH align="right">Cost</TH>
                        <TH align="right">Margin</TH>
                        <TH align="right">Margin %</TH>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                            No invoices.
                        </td></tr>
                    )}
                    {rows.map(r => {
                        const c = r.Margin >= 0 ? '#166534' : '#991b1b';
                        return (
                            <tr key={r.SaleID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <TD>{r.DocDate}</TD>
                                <TD mono color="#1e40af">{r.InvoiceNo || `SS-${r.SaleID}`}</TD>
                                <TD>{r.Customer}</TD>
                                <TD>
                                    <span style={{
                                        background: r.Mode === 'CREDIT' ? '#dbeafe' : '#dcfce7',
                                        color: r.Mode === 'CREDIT' ? '#1e3a8a' : '#166534',
                                        padding: '2px 8px', borderRadius: 12,
                                        fontSize: '0.72rem', fontWeight: 700,
                                    }}>{r.Mode === 'CREDIT' ? 'Credit' : 'Cash'}</span>
                                </TD>
                                <TD align="right" mono>{fmtInt(r.Lines)}</TD>
                                <TD align="right" mono bold>{fmt(r.Revenue)}</TD>
                                <TD align="right" mono color="#b45309">{fmt(r.Discount)}</TD>
                                <TD align="right" mono color="#b45309">{fmt(r.Cost)}</TD>
                                <TD align="right" mono bold color={c}>{fmt(r.Margin)}</TD>
                                <TD align="right" mono bold color={c}>{r.MarginPct}%</TD>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
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
