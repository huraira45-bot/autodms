import React from 'react';
import { Tag, ShoppingCart, BarChart3, Boxes, Scale } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, yearStartISO, PeriodControls, AsOfControl, SingleDateControl } from './ReportShell';

// ---- Discount Given (Care-Off) ----
export function DiscountGiven() {
    return (
        <ReportShell
            title="Discount Given Report"
            subtitle="Care-Off discount events by authoriser."
            icon={Tag}
            endpoint="discount-given"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {Object.entries(data.byAuthoriser).map(([auth, cnt]) => (
                            <div key={auth} style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                                <strong>{auth}</strong>: {cnt} event{cnt > 1 ? 's' : ''}
                            </div>
                        ))}
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No discount events in this period.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>When</TH><TH>Job Card</TH><TH>Action</TH><TH>Old → New</TH>
                                        <TH>Authoriser</TH><TH>Changed By</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.AuditID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD>{new Date(r.ChangedAt).toLocaleString()}</TD>
                                            <TD mono color="#475569">{r.JobCardNo || '—'}</TD>
                                            <TD>{r.Action}</TD>
                                            <TD color="#64748b">{r.OldValue || '∅'} → {r.NewValue || '∅'}</TD>
                                            <TD>{r.Authoriser || '—'}</TD>
                                            <TD>{r.ChangedByName}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// ---- Sales Register ----
export function SalesRegister() {
    return (
        <ReportShell
            title="Sales Register"
            subtitle="All invoiced sales (SI / SS / SSR) for a period."
            icon={ShoppingCart}
            endpoint="sales-register"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{data.from} → {data.to}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Grand Total: PKR {fmt(data.grandTotal)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {Object.entries(data.byType).map(([t, amt]) => (
                                <div key={t} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                                    <strong style={{ color: '#1e40af' }}>{t}</strong>: {fmt(amt)}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No sales in this period.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Date</TH><TH>Voucher</TH><TH>Type</TH><TH>Source</TH>
                                        <TH>Remarks</TH><TH>Created By</TH><TH align="right">Amount</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD>{new Date(r.VoucherDate).toLocaleDateString()}</TD>
                                            <TD mono color="#475569">{r.VoucherNo}</TD>
                                            <TD>{r.VoucherType}</TD>
                                            <TD>{r.SourceDocType ? `${r.SourceDocType} #${r.SourceDocID}` : '—'}</TD>
                                            <TD color="#475569">{r.Remarks}</TD>
                                            <TD>{r.CreatedByName}</TD>
                                            <TD align="right" bold>{fmt(r.TotalAmount)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// ---- Gross Margin ----
export function GrossMargin() {
    return (
        <ReportShell
            title="Gross Margin Report"
            subtitle="Per Job Card: Revenue − COGS − Sublet = Margin."
            icon={BarChart3}
            endpoint="gross-margin"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>
                            {data.from} → {data.to}
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <KPI label="Revenue" value={data.totals.revenue} />
                            <KPI label="COGS" value={data.totals.cogs} color="#b91c1c" />
                            <KPI label="Sublet" value={data.totals.subletCost} color="#b91c1c" />
                            <KPI label="Margin" value={data.totals.margin} color="#1e40af" />
                            <KPI label="Margin %" value={data.totals.marginPct + '%'} color="#1e40af" raw />
                        </div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No invoiced Job Cards in this period.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>JC No</TH><TH>Date</TH><TH>Party</TH>
                                        <TH align="right">Revenue</TH><TH align="right">COGS</TH>
                                        <TH align="right">Sublet</TH><TH align="right">Margin</TH>
                                        <TH align="right">Margin %</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.JobCardID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD mono color="#475569">{r.JobCardNo}</TD>
                                            <TD>{new Date(r.JobCardDate).toLocaleDateString()}</TD>
                                            <TD>{r.PartyName || '—'}</TD>
                                            <TD align="right">{fmt(r.revenue)}</TD>
                                            <TD align="right">{fmt(r.cogs)}</TD>
                                            <TD align="right">{fmt(r.subletCost)}</TD>
                                            <TD align="right" bold color={r.margin < 0 ? '#b91c1c' : '#15803d'}>{fmt(r.margin)}</TD>
                                            <TD align="right" bold>{r.marginPct}%</TD>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

const KPI = ({ label, value, color, raw }) => (
    <div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color }}>{raw ? value : `PKR ${fmt(value)}`}</div>
    </div>
);

// ---- Inventory Valuation ----
export function InventoryValuation() {
    return (
        <ReportShell
            title="Inventory Valuation"
            subtitle="On-hand stock × weighted average rate."
            icon={Boxes}
            endpoint="inventory-valuation"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>As of {data.asOf}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Total Value: PKR {fmt(data.totalValue)}</div>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{data.rows.length} items in stock</div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No on-hand inventory.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Item</TH><TH align="right">On Hand</TH>
                                        <TH align="right">Rate</TH><TH align="right">Value</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.ItemId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD>{r.ItemName}</TD>
                                            <TD align="right">{fmtInt(r.OnHand)}</TD>
                                            <TD align="right">{fmt(r.Rate)}</TD>
                                            <TD align="right" bold>{fmt(r.Value)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={3} style={{ padding: 12, fontWeight: 700 }}>Total</td>
                                        <TD align="right" bold>{fmt(data.totalValue)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// ---- General-Customer Daily Reconciliation ----
export function GenCustReconciliation() {
    return (
        <ReportShell
            title="General Customer Reconciliation"
            subtitle="Daily transit balance on the General Customer account — should sum to zero at close-of-day."
            icon={Scale}
            endpoint="gencust-reconciliation"
            defaultParams={{ date: todayISO() }}
            controls={SingleDateControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{
                        background: data.balanced ? '#f0fdf4' : '#fef2f2',
                        border: '1px solid ' + (data.balanced ? '#bbf7d0' : '#fecaca'),
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: 20
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{data.date}</div>
                            <div style={{ fontWeight: 700, color: data.balanced ? '#15803d' : '#b91c1c' }}>
                                {data.balanced ? 'Reconciled — net is zero' : `Out of balance by PKR ${fmt(data.net)}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                            <KPI label="Debits" value={data.totalDr} />
                            <KPI label="Credits" value={data.totalCr} />
                            <KPI label="Net" value={data.net} color={data.balanced ? '#15803d' : '#b91c1c'} />
                        </div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No movements on this date.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Voucher</TH><TH>Type</TH><TH>Party / JC</TH><TH>Narration</TH>
                                        <TH align="right">Debit</TH><TH align="right">Credit</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD mono color="#475569">{r.VoucherNo}</TD>
                                            <TD>{r.VoucherType}</TD>
                                            <TD>{r.PartyName}{r.JobCardNo ? ` · JC ${r.JobCardNo}` : ''}</TD>
                                            <TD color="#64748b">{r.Narration}</TD>
                                            <TD align="right">{Number(r.Debit)  ? fmt(r.Debit)  : '—'}</TD>
                                            <TD align="right">{Number(r.Credit) ? fmt(r.Credit) : '—'}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Total</td>
                                        <TD align="right" bold>{fmt(data.totalDr)}</TD>
                                        <TD align="right" bold>{fmt(data.totalCr)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}
