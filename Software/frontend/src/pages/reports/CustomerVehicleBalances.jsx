import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import ReportShell, { TH, TD, fmt } from './ReportShell';
import { formatDeliveryMonth } from '../../utils/deliveryMonth';

const control = { padding: 8, border: '1px solid #cbd5e1', borderRadius: 5 };
const csvText = value => /^[=+\-@\t\r]/.test(String(value || '')) ? `'${value}` : (value || '');
export default function CustomerVehicleBalances() {
    return <ReportShell title="Customer Vehicle Balance Payments" icon={Wallet}
        subtitle="Current car-price balance after discounts and recorded customer payments. Premium excluded; cancelled and fully paid bookings excluded."
        endpoint="sales/customer-balances" defaultParams={{}}
        printFilterSummary={p => [p.from && `Booked from ${p.from}`, p.to && `to ${p.to}`, p.month && `Promised ${formatDeliveryMonth(p.month)}`,
            p.unpromised === '1' && 'No promised month', p.search && `Search: ${p.search}`, p.status && `Status: ${p.status}`].filter(Boolean).join(' · ') || 'All booking dates and promised months'}
        controls={({ params, updateParam }) => <>
            <label>Booking from <input type="date" style={control} value={params.from || ''} onChange={e => updateParam('from', e.target.value || undefined)} /></label>
            <label>Booking to <input type="date" style={control} value={params.to || ''} onChange={e => updateParam('to', e.target.value || undefined)} /></label>
            <label>Promised month <input type="month" style={control} value={params.month || ''} disabled={params.unpromised === '1'} onChange={e => updateParam('month', e.target.value || undefined)} /></label>
            <label><input type="checkbox" checked={params.unpromised === '1'} disabled={!!params.month} onChange={e => updateParam('unpromised', e.target.checked ? '1' : undefined)} /> No promised month</label>
            <input aria-label="Search bookings" placeholder="Booking / customer / phone / chassis" style={control} value={params.search || ''} onChange={e => updateParam('search', e.target.value || undefined)} />
            <select aria-label="Booking status" style={control} value={params.status || ''} onChange={e => updateParam('status', e.target.value || undefined)}>
                <option value="">All statuses</option>
                {['Draft','PendingApproval','PendingBookingPayment','BookingConfirmed','PendingPayment','Allocated','MasterInvoicePending','MasterInvoicePosted','ReadyForDelivery','DeliveryApproved','GatePassIssued','Delivered','Closed'].map(s => <option key={s}>{s}</option>)}
            </select>
        </>}
        excelExport={data => ({ filename: 'customer-vehicle-balances.csv',
            headers: ['Booking','Booking date','Promised delivery month','Customer','Phone','Model','Variant','Chassis','Executive','Status','Historical','Vehicle price','Vehicle paid','Balance payment'],
            rows: data.rows.map(r => [r.BookingNo,r.BookingDate,r.PromisedDeliveryMonth,r.CustomerName,r.Phone,r.ModelName,r.VariantName,r.ChasisNo,r.ExecutiveName,r.Status,r.IsHistorical ? 'Yes' : 'No'].map(csvText)
                .concat([r.VehiclePrice,r.VehiclePaid,r.Outstanding])),
        })}>
        {data => <>
            <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                <span>Bookings: <strong>{data.totals.count}</strong></span>
                <span>Vehicle price: <strong>PKR {fmt(data.totals.price)}</strong></span>
                <span>Vehicle paid: <strong>PKR {fmt(data.totals.paid)}</strong></span>
                <span style={{ color: '#b45309' }}>Balance payment: <strong>PKR {fmt(data.totals.outstanding)}</strong></span>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr><TH>Booking / date</TH><TH>Promised month</TH><TH>Customer / phone</TH><TH>Vehicle / chassis</TH><TH>Executive</TH><TH>Status</TH><TH align="right">Vehicle price</TH><TH align="right">Vehicle paid</TH><TH align="right">Balance payment</TH></tr></thead>
                <tbody>{!data.rows.length && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center' }}>No outstanding vehicle payments match these filters.</td></tr>}
                    {data.rows.map(r => <tr key={r.BookingID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <TD><Link to={`/sales/bookings/${r.BookingID}`}>{r.BookingNo}</Link><div>{r.BookingDate}</div>{r.IsHistorical && <small>Historical</small>}</TD>
                        <TD>{formatDeliveryMonth(r.PromisedDeliveryMonth)}</TD><TD>{r.CustomerName}<div>{r.Phone}</div></TD>
                        <TD>{r.ModelName} {r.VariantName}<div>{r.ChasisNo || 'Not allocated'}</div></TD><TD>{r.ExecutiveName}</TD><TD>{r.Status}</TD>
                        <TD align="right">{fmt(r.VehiclePrice)}</TD><TD align="right">{fmt(r.VehiclePaid)}</TD><TD align="right" bold color="#b45309">{fmt(r.Outstanding)}</TD>
                    </tr>)}
                </tbody>
            </table></div>
            <p style={{ fontSize: 12, color: '#64748b' }}>Historical payments count when recorded, even if the old voucher is not yet linked. This is a current booking balance, rather than a historical ledger balance.</p>
        </>}
    </ReportShell>;
}
