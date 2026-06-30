import React from 'react';
import { Clock, Truck, Users } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, AsOfControl } from './ReportShell';

function AgingTable({ kind, data }) {
    const isReceivable = kind === 'receivable';
    return (
        <>
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{data.asOf}</div>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                        Total {isReceivable ? 'Receivable' : 'Payable'}: PKR {fmt(data.totals.total)}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    {['current', 'b31_60', 'b61_90', 'b90plus'].map(k => (
                        <div key={k} style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem', minWidth: 100 }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>
                                {k === 'current' ? '0–30' : k === 'b31_60' ? '31–60' : k === 'b61_90' ? '61–90' : '90+'}
                            </div>
                            <div style={{ fontWeight: 700 }}>{fmt(data.totals[k])}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="card">
                {data.rows.length === 0 ? (
                    <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No outstanding balances.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <TH>Party</TH><TH align="right">0–30</TH><TH align="right">31–60</TH>
                                <TH align="right">61–90</TH><TH align="right">90+</TH><TH align="right">Total</TH>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map(r => (
                                <tr key={r.PartyID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <TD>{r.PartyName}</TD>
                                    <TD align="right">{fmt(r.current)}</TD>
                                    <TD align="right">{fmt(r.b31_60)}</TD>
                                    <TD align="right">{fmt(r.b61_90)}</TD>
                                    <TD align="right" color={r.b90plus > 0 ? '#b91c1c' : undefined}>{fmt(r.b90plus)}</TD>
                                    <TD align="right" bold>{fmt(r.total)}</TD>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                <td style={{ padding: 12, fontWeight: 700 }}>Total</td>
                                {['current','b31_60','b61_90','b90plus','total'].map(k => (
                                    <TD key={k} align="right" bold>{fmt(data.totals[k])}</TD>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </>
    );
}

export function ReceivablesAging() {
    return (
        <ReportShell
            title="Receivables Aging"
            subtitle="Customer outstanding balances by age bucket."
            icon={Clock}
            endpoint="receivables-aging"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => <AgingTable kind="receivable" data={data} />}
        </ReportShell>
    );
}

export function PayablesAging() {
    return (
        <ReportShell
            title="Payables Aging"
            subtitle="Supplier outstanding balances by age bucket."
            icon={Truck}
            endpoint="payables-aging"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => <AgingTable kind="payable" data={data} />}
        </ReportShell>
    );
}

// ---- Insurance Aging (placeholder until §14.10 builds the data) ----
export function InsuranceAging() {
    return (
        <ReportShell
            title="Insurance Claims Aging"
            subtitle="Insurance-side outstanding balances by age."
            icon={Clock}
            endpoint="insurance-aging"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => (
                <div className="card" style={{ padding: 32, textAlign: 'center', color: '#475569' }}>
                    <Clock size={32} style={{ color: '#94a3b8', marginBottom: 12 }} />
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Insurance split-receivable not yet enabled</div>
                    <div style={{ fontSize: '0.875rem', color: '#64748b', maxWidth: 600, margin: '0 auto' }}>
                        {data.note}
                    </div>
                </div>
            )}
        </ReportShell>
    );
}

// ---- Walk-in JC Pending Payment ----
// Lists every General-Customer-tagged JC SI voucher that the cashier hasn't
// settled yet (Cash / POS / Bank Transfer / Cheque). One row per pending RO.
export function WalkInOutstanding() {
    return (
        <ReportShell
            title="Walk-in JC Pending Payment"
            subtitle="JCs invoiced against General Customer that still need cashier receipt."
            icon={Users}
            endpoint="walkin-outstanding"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{data.asOf}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                                Outstanding: PKR {fmt(data.totals.outstanding)} · across {data.rows.length} JC{data.rows.length === 1 ? '' : 's'}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                            Invoiced PKR {fmt(data.totals.invoiced)} · Paid PKR {fmt(data.totals.paid)}
                        </div>
                    </div>
                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No walk-in JCs awaiting payment.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>JC #</TH>
                                        <TH>Date</TH>
                                        <TH>Payment Mode</TH>
                                        <TH align="right">Invoiced</TH>
                                        <TH align="right">Paid</TH>
                                        <TH align="right">Outstanding</TH>
                                        <TH align="right">Age</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD bold>{r.JobCardNo}</TD>
                                            <TD>{r.JobCardDate?.slice(0,10)}</TD>
                                            <TD>{r.PaymentType}</TD>
                                            <TD align="right">{fmt(r.Invoiced)}</TD>
                                            <TD align="right">{fmt(r.Paid)}</TD>
                                            <TD align="right" bold>{fmt(r.Outstanding)}</TD>
                                            <TD align="right" color={r.AgeDays > 30 ? '#b91c1c' : undefined}>{r.AgeDays}d</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={3} style={{ padding: 12, fontWeight: 700 }}>Total</td>
                                        <TD align="right" bold>{fmt(data.totals.invoiced)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.paid)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.outstanding)}</TD>
                                        <TD></TD>
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
