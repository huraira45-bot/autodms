import React from 'react';
import { Wrench, Activity, ShieldCheck, UserCog } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, yearStartISO, PeriodControls } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// =====================================================================
// Job Card Register
// =====================================================================
export function JobCardRegister() {
    return (
        <ReportShell
            title="Job Card Register"
            subtitle="All workshop job cards in the period — customer, vehicle, advisor, labour/parts/sublet/total."
            icon={Wrench}
            endpoint="service/job-card-register"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Cards',  value: fmtInt(data.totals.count) },
                        { label: 'Labour', value: 'PKR ' + fmt(data.totals.labour) },
                        { label: 'Parts',  value: 'PKR ' + fmt(data.totals.parts) },
                        { label: 'Sublet', value: 'PKR ' + fmt(data.totals.sublet) },
                        { label: 'Total',  value: 'PKR ' + fmt(data.totals.total), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Card #</TH><TH>Date</TH><TH>Customer</TH><TH>Vehicle</TH>
                                    <TH>Advisor</TH><TH>Status</TH>
                                    <TH align="right">Labour</TH><TH align="right">Parts</TH>
                                    <TH align="right">Sublet</TH><TH align="right">Total</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={10}>No job cards in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.JobCardId} style={trBody}>
                                        <TD mono><strong>{r.JobCardNo}</strong></TD>
                                        <TD>{r.JobCardDate}</TD>
                                        <TD>{r.CustomerName}<div style={subText}>{r.CustomerCode}</div></TD>
                                        <TD mono>{r.VehicleRegNo}<div style={subText}>{r.ChasisNo}</div></TD>
                                        <TD>{r.ServiceAdvisor}</TD>
                                        <TD><StatusPill v={r.Status} finalized={r.IsFinalized} /></TD>
                                        <TD align="right" mono>{fmt(r.LabourAmount)}</TD>
                                        <TD align="right" mono>{fmt(r.PartsAmount)}</TD>
                                        <TD align="right" mono>{fmt(r.SubletAmount)}</TD>
                                        <TD align="right" mono bold>{fmt(r.TotalAmount)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Service Revenue Summary (per-day)
// =====================================================================
export function ServiceRevenueSummary() {
    return (
        <ReportShell
            title="Service Revenue Summary"
            subtitle="Daily labour / parts / sublet revenue across all job cards in the period."
            icon={Activity}
            endpoint="service/revenue-summary"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Days',   value: fmtInt(data.totals.days) },
                        { label: 'Cards',  value: fmtInt(data.totals.cards) },
                        { label: 'Labour', value: 'PKR ' + fmt(data.totals.labour) },
                        { label: 'Parts',  value: 'PKR ' + fmt(data.totals.parts) },
                        { label: 'Sublet', value: 'PKR ' + fmt(data.totals.sublet) },
                        { label: 'Total',  value: 'PKR ' + fmt(data.totals.total), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Day</TH><TH align="right">Cards</TH>
                                    <TH align="right">Labour</TH><TH align="right">Parts</TH>
                                    <TH align="right">Sublet</TH><TH align="right">Total</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={6}>No activity in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.Day} style={trBody}>
                                        <TD>{r.Day}</TD>
                                        <TD align="right">{r.Cards}</TD>
                                        <TD align="right" mono>{fmt(r.Labour)}</TD>
                                        <TD align="right" mono>{fmt(r.Parts)}</TD>
                                        <TD align="right" mono>{fmt(r.Sublet)}</TD>
                                        <TD align="right" mono bold>{fmt(r.Total)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Insurance Claims
// =====================================================================
export function InsuranceClaims() {
    return (
        <ReportShell
            title="Insurance Claims"
            subtitle="Job cards billed to insurance customers — claim status and amount."
            icon={ShieldCheck}
            endpoint="service/insurance-claims"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Claims',     value: fmtInt(data.totals.count) },
                        { label: 'Finalized',  value: fmtInt(data.totals.finalized) },
                        { label: 'Claim Amt',  value: 'PKR ' + fmt(data.totals.claimAmount), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Card #</TH><TH>Date</TH><TH>Customer</TH><TH>Vehicle</TH>
                                    <TH>Insurance Company</TH><TH>Delivered</TH>
                                    <TH>Status</TH><TH align="right">Claim Amount</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={8}>No insurance claims in this period.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={i} style={trBody}>
                                        <TD mono>{r.JobCardNo}</TD>
                                        <TD>{r.JobCardDate}</TD>
                                        <TD>{r.CustomerName}</TD>
                                        <TD mono>{r.VehicleRegNo}</TD>
                                        <TD>{r.InsuranceCompany}</TD>
                                        <TD>{r.DeliveryDate || '—'}</TD>
                                        <TD><StatusPill v={r.Status} finalized={r.IsFinalized} /></TD>
                                        <TD align="right" mono bold>{fmt(r.ClaimAmount)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Mechanic Productivity
// =====================================================================
export function MechanicProductivity() {
    return (
        <ReportShell
            title="Mechanic Productivity"
            subtitle="Per-technician job-line count and labour value in the period."
            icon={UserCog}
            endpoint="service/mechanic-productivity"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Technicians', value: fmtInt(data.totals.techs) },
                        { label: 'Job Cards',   value: fmtInt(data.totals.jobCards) },
                        { label: 'Job Lines',   value: fmtInt(data.totals.jobLines) },
                        { label: 'Gross Labour',value: 'PKR ' + fmt(data.totals.grossLabour) },
                        { label: 'Net Labour',  value: 'PKR ' + fmt(data.totals.netLabour), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Technician</TH>
                                    <TH align="right">Job Cards</TH>
                                    <TH align="right">Lines</TH>
                                    <TH align="right">Gross Labour</TH>
                                    <TH align="right">Discount</TH>
                                    <TH align="right">Net Labour</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={6}>No technician activity in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.TechnicianId} style={trBody}>
                                        <TD>{r.TechnicianName}</TD>
                                        <TD align="right">{r.JobCards}</TD>
                                        <TD align="right">{r.JobLines}</TD>
                                        <TD align="right" mono>{fmt(r.GrossLabour)}</TD>
                                        <TD align="right" mono color="#b91c1c">{fmt(r.Discount)}</TD>
                                        <TD align="right" mono bold>{fmt(r.NetLabour)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Shared bits
// =====================================================================
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const trHeader   = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const trBody     = { borderBottom: '1px solid #f1f5f9' };
const subText    = { fontSize: '0.72rem', color: '#94a3b8' };

function SummaryBar({ items }) {
    return (
        <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: 14 }}>
            {items.map(it => (
                <div key={it.label}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>{it.label}</div>
                    <div style={{ fontWeight: it.strong ? 700 : 600, fontSize: it.strong ? '1.1rem' : '0.95rem',
                                  color: it.strong ? '#1e40af' : '#0f172a' }}>{it.value}</div>
                </div>
            ))}
        </div>
    );
}

function Empty({ cols, children }) {
    return (
        <tr>
            <td colSpan={cols} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                {children}
            </td>
        </tr>
    );
}

function StatusPill({ v, finalized }) {
    const palette = {
        'Open':        { bg: '#fef3c7', col: '#92400e' },
        'In Progress': { bg: '#dbeafe', col: '#1e40af' },
        'InProgress':  { bg: '#dbeafe', col: '#1e40af' },
        'Closed':      { bg: '#dcfce7', col: '#15803d' },
        'Finalized':   { bg: '#dcfce7', col: '#15803d' },
        'Cancelled':   { bg: '#fee2e2', col: '#b91c1c' },
    };
    const label = v || (finalized ? 'Finalized' : 'Open');
    const sty = palette[label] || { bg: '#f1f5f9', col: '#475569' };
    return (
        <span style={{ background: sty.bg, color: sty.col, padding: '2px 8px',
                       borderRadius: 99, fontSize: '0.72rem', fontWeight: 600 }}>{label}</span>
    );
}
