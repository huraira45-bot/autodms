import React from 'react';
import { ClipboardList, Truck, TrendingUp, Wallet } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, PeriodControls } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// =====================================================================
// Booking Register
// =====================================================================
export function BookingRegister() {
    return (
        <ReportShell
            title="Booking Register"
            subtitle="Every vehicle booking in the period — customer, vehicle, status, paid vs. outstanding."
            icon={ClipboardList}
            endpoint="sales/booking-register"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Bookings',    value: fmtInt(data.totals.count) },
                        { label: 'Negotiated',  value: 'PKR ' + fmt(data.totals.negotiated) },
                        { label: 'Discount',    value: 'PKR ' + fmt(data.totals.discount) },
                        { label: 'Paid',        value: 'PKR ' + fmt(data.totals.paid) },
                        { label: 'Outstanding', value: 'PKR ' + fmt(data.totals.outstanding), strong: true },
                    ]} />
                    {Object.keys(data.totals.byStatus || {}).length > 0 && (
                        <div className="card" style={{ display: 'flex', gap: 14, padding: 10, flexWrap: 'wrap' }}>
                            {Object.entries(data.totals.byStatus).map(([s, n]) => (
                                <span key={s} style={{ background: '#f1f5f9', borderRadius: 4,
                                    padding: '4px 10px', fontSize: '0.78rem', color: '#475569' }}>
                                    {s}: <strong>{n}</strong>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Booking #</TH><TH>Date</TH><TH>Customer</TH><TH>Vehicle</TH>
                                    <TH>Executive</TH><TH>Status</TH>
                                    <TH align="right">Negotiated</TH><TH align="right">Discount</TH>
                                    <TH align="right">Paid</TH><TH align="right">Outstanding</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={10}>No bookings in this period.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={i} style={trBody}>
                                        <TD mono><strong>{r.BookingNo}</strong></TD>
                                        <TD>{r.BookedOn}</TD>
                                        <TD>{r.CustomerName}</TD>
                                        <TD>{r.Vehicle}</TD>
                                        <TD>{r.ExecutiveName}</TD>
                                        <TD><StatusPill v={r.Status} /></TD>
                                        <TD align="right" mono>{fmt(r.Negotiated)}</TD>
                                        <TD align="right" mono color={r.Discount > 0 ? '#a16207' : undefined}>{fmt(r.Discount)}</TD>
                                        <TD align="right" mono color="#15803d">{fmt(r.Paid)}</TD>
                                        <TD align="right" mono color={r.Outstanding > 0 ? '#b91c1c' : undefined} bold>{fmt(r.Outstanding)}</TD>
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
// Vehicle Inventory
// =====================================================================
export function VehicleInventory() {
    return (
        <ReportShell
            title="Vehicle Inventory"
            subtitle="All vehicles in the system — by status, location, model, with days-in-stock."
            icon={Truck}
            endpoint="sales/vehicle-inventory"
            defaultParams={{}}
            controls={() => null}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Total vehicles', value: fmtInt(data.totals.total) },
                        { label: 'In stock',       value: fmtInt(data.totals.inStock) },
                        { label: 'Value in stock', value: 'PKR ' + fmt(data.totals.valueInStock), strong: true },
                    ]} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <BreakdownCard title="By Status" data={data.totals.byStatus} />
                        <BreakdownCard title="By Model" data={data.totals.byModel} />
                    </div>
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Chassis</TH><TH>Brand</TH><TH>Model</TH><TH>Variant</TH>
                                    <TH>Color</TH><TH>Year</TH>
                                    <TH>Location</TH><TH>Status</TH>
                                    <TH align="right">Std Price</TH>
                                    <TH align="right">Days in Stock</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={10}>No vehicles registered yet.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.ChasisNo} style={trBody}>
                                        <TD mono>{r.ChasisNo}</TD>
                                        <TD>{r.Brand}</TD>
                                        <TD mono>{r.Model}</TD>
                                        <TD>{r.Variant}</TD>
                                        <TD>{r.Color}</TD>
                                        <TD>{r.Year}</TD>
                                        <TD>{r.Location}</TD>
                                        <TD><StatusPill v={r.Status} /></TD>
                                        <TD align="right" mono>{fmt(r.StandardPrice)}</TD>
                                        <TD align="right" mono color={r.DaysInStock > 60 ? '#b91c1c' : '#475569'}>
                                            {r.DaysInStock ?? '—'}
                                        </TD>
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
// Executive Performance
// =====================================================================
export function ExecutivePerformance() {
    return (
        <ReportShell
            title="Sales Executive Performance"
            subtitle="Per executive: bookings created, confirmed, cancelled, conversion %, revenue."
            icon={TrendingUp}
            endpoint="sales/executive-performance"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Executives', value: fmtInt(data.totals.execs) },
                        { label: 'Bookings',   value: fmtInt(data.totals.bookings) },
                        { label: 'Confirmed',  value: fmtInt(data.totals.confirmed) },
                        { label: 'Cancelled',  value: fmtInt(data.totals.cancelled) },
                        { label: 'Negotiated', value: 'PKR ' + fmt(data.totals.negotiated) },
                        { label: 'Collected',  value: 'PKR ' + fmt(data.totals.collected), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Executive</TH>
                                    <TH align="right">Bookings</TH>
                                    <TH align="right">Confirmed</TH>
                                    <TH align="right">Cancelled</TH>
                                    <TH align="right">Conversion %</TH>
                                    <TH align="right">Negotiated</TH>
                                    <TH align="right">Collected</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={7}>No sales-executive activity in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.ExeID || r.ExeName} style={trBody}>
                                        <TD>{r.ExeName}</TD>
                                        <TD align="right">{r.Bookings}</TD>
                                        <TD align="right" color="#15803d">{r.Confirmed}</TD>
                                        <TD align="right" color="#b91c1c">{r.Cancelled}</TD>
                                        <TD align="right" mono bold
                                            color={r.ConversionPct >= 50 ? '#15803d' : '#a16207'}>
                                            {fmt(r.ConversionPct)}%
                                        </TD>
                                        <TD align="right" mono>{fmt(r.NegotiatedRev)}</TD>
                                        <TD align="right" mono bold>{fmt(r.Collected)}</TD>
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
// Customer Advances Aging
// =====================================================================
export function CustomerAdvancesAging() {
    return (
        <ReportShell
            title="Customer Advances Aging"
            subtitle="Outstanding booking deposits, aged in 30-day buckets."
            icon={Wallet}
            endpoint="sales/customer-advances-aging"
            defaultParams={{}}
            controls={() => null}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Bookings', value: fmtInt(data.totals.bookings) },
                        { label: 'Total advance held', value: 'PKR ' + fmt(data.totals.paid), strong: true },
                    ]} />
                    {Object.keys(data.totals.byBucket || {}).length > 0 && (
                        <div className="card" style={{ display: 'flex', gap: 14, padding: 12, flexWrap: 'wrap' }}>
                            {['0-30', '31-60', '61-90', '90+'].map(b => {
                                const v = data.totals.byBucket[b];
                                if (!v) return null;
                                const colors = { '0-30': '#15803d', '31-60': '#a16207', '61-90': '#c2410c', '90+': '#b91c1c' };
                                return (
                                    <div key={b} style={{ flex: 1, minWidth: 130 }}>
                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>{b} days</div>
                                        <div style={{ color: colors[b], fontWeight: 700, fontSize: '0.95rem' }}>
                                            PKR {fmt(v.amount)}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#475569' }}>{v.count} bookings</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Booking #</TH><TH>Date</TH><TH>Customer</TH><TH>Vehicle</TH>
                                    <TH>Status</TH>
                                    <TH align="right">Negotiated</TH><TH align="right">Advance Paid</TH>
                                    <TH align="right">Age (days)</TH><TH>Bucket</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={9}>No outstanding advances.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={i} style={trBody}>
                                        <TD mono>{r.BookingNo}</TD>
                                        <TD>{r.BookedOn}</TD>
                                        <TD>{r.Customer}</TD>
                                        <TD>{r.Vehicle}</TD>
                                        <TD><StatusPill v={r.Status} /></TD>
                                        <TD align="right" mono>{fmt(r.Negotiated)}</TD>
                                        <TD align="right" mono color="#15803d" bold>{fmt(r.Paid)}</TD>
                                        <TD align="right" mono color={r.AgeDays > 90 ? '#b91c1c' : '#475569'}>{r.AgeDays}</TD>
                                        <TD><BucketPill bucket={r.Bucket} /></TD>
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

function BreakdownCard({ title, data }) {
    const entries = Object.entries(data || {});
    if (!entries.length) return null;
    return (
        <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700, color: '#475569', marginBottom: 8, fontSize: '0.85rem' }}>{title}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {entries.sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                    <span key={k} style={{ background: '#f1f5f9', borderRadius: 4,
                        padding: '4px 10px', fontSize: '0.78rem', color: '#475569' }}>
                        {k}: <strong>{n}</strong>
                    </span>
                ))}
            </div>
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

function StatusPill({ v }) {
    const palette = {
        'Confirmed':     { bg: '#dcfce7', col: '#15803d' },
        'Delivered':     { bg: '#dcfce7', col: '#15803d' },
        'Closed':        { bg: '#dcfce7', col: '#15803d' },
        'PendingApproval': { bg: '#fef3c7', col: '#92400e' },
        'PendingPayment': { bg: '#fef3c7', col: '#92400e' },
        'Cancelled':     { bg: '#fee2e2', col: '#b91c1c' },
        'AtDealer':      { bg: '#dbeafe', col: '#1e40af' },
        'Allocated':     { bg: '#dbeafe', col: '#1e40af' },
    };
    const sty = palette[v] || { bg: '#f1f5f9', col: '#475569' };
    return (
        <span style={{ background: sty.bg, color: sty.col, padding: '2px 8px',
                       borderRadius: 99, fontSize: '0.72rem', fontWeight: 600 }}>{v || '—'}</span>
    );
}

function BucketPill({ bucket }) {
    const palette = {
        '0-30':  { bg: '#dcfce7', col: '#15803d' },
        '31-60': { bg: '#fef3c7', col: '#a16207' },
        '61-90': { bg: '#fed7aa', col: '#c2410c' },
        '90+':   { bg: '#fee2e2', col: '#b91c1c' },
    };
    const sty = palette[bucket] || { bg: '#f1f5f9', col: '#475569' };
    return (
        <span style={{ background: sty.bg, color: sty.col, padding: '2px 8px',
                       borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{bucket}</span>
    );
}
