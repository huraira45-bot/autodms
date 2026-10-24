import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileClock, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import MasterInvoiceUploadModal from '../sales/MasterInvoiceUploadModal';
import ReportShell, { TH, TD, fmtInt } from './ReportShell';

const input = { padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 5 };
const date = value => value ? new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const csv = value => /^[=+\-@\t\r]/.test(String(value || '')) ? `'${value}` : value ?? '';

function Filters({ params, updateParam }) {
    const [search, setSearch] = useState(params.search || '');
    return <>
        <Link className="erp-btn" to="/module/sales-reports">All sale reports</Link>
        <form onSubmit={event => { event.preventDefault(); updateParam('search', search.trim() || undefined); }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input type="search" aria-label="Search customer name, CNIC, booking or chassis" placeholder="Customer name / CNIC / booking / chassis" style={{ ...input, width: 310, maxWidth: '100%' }} value={search} maxLength={150} onChange={event => setSearch(event.target.value)} />
            <button className="erp-btn" type="submit">Search</button>
            {(search || params.search) && <button className="erp-btn" type="button" onClick={() => { setSearch(''); updateParam('search', undefined); }}>Clear search</button>}
        </form>
        <label>Delivered from <input type="date" style={input} value={params.from || ''} onChange={event => updateParam('from', event.target.value || undefined)} /></label>
        <label>To <input type="date" style={input} value={params.to || ''} onChange={event => updateParam('to', event.target.value || undefined)} /></label>
    </>;
}

export default function DeliveredMasterInvoices() {
    const { hasModule } = useAuth();
    const canUpload = ['sales_master_settlement', 'sales_admin_settings', 'sales_gm'].some(hasModule);
    const [upload, setUpload] = useState(null);
    const [message, setMessage] = useState('');
    return <>
        {message && <div className="erp-alert success no-print" role="status">{message}</div>}
        <ReportShell title="Delivered Vehicles — Master Invoice Pending" icon={FileClock} endpoint="sales/delivered-master-invoices" defaultParams={{}}
            subtitle="Delivered bookings awaiting the Master invoice file. Historical bookings are excluded."
            controls={props => <Filters {...props} />} superWide
            printFilterSummary={params => [params.search && `Search: ${params.search}`, params.from && `Delivered from ${params.from}`, params.to && `to ${params.to}`].filter(Boolean).join(' | ') || 'All delivered non-historical bookings with a pending Master invoice'}
            excelExport={data => ({ filename: 'delivered-vehicles-master-invoice-pending.csv',
                headers: ['Booking', 'Booking date', 'Delivery date', 'Days pending', 'Customer', 'CNIC', 'Model', 'Variant', 'Chassis', 'Engine', 'Gate pass', 'Salesperson', 'Booking status'],
                rows: data.rows.map(row => [row.BookingNo, row.BookingDate, row.DeliveryDate, row.DaysSinceDelivery, row.CustomerName, row.CNIC, row.ModelName, row.VariantName, row.ChasisNo, row.EngineNo, row.GatePassNo, row.SalespersonName, row.Status].map(csv)),
            })}>
            {(data, { reload, loading }) => <>
                <div className="card"><strong>{fmtInt(data.total)}</strong> delivered vehicles awaiting Master invoice upload</div>
                {!canUpload && <div className="erp-alert no-print">Uploading requires Master settlement, Sales settings or Sales GM access.</div>}
                <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr><TH>Booking</TH><TH>Delivered</TH><TH align="right">Days pending</TH><TH>Customer / CNIC</TH><TH>Vehicle</TH><TH>Chassis / engine</TH><TH>Gate pass</TH><TH>Salesperson</TH><TH>Status</TH><th className="no-print" style={{ padding: 10 }}>Action</th></tr></thead>
                    <tbody>{!data.rows.length && <tr><td colSpan={10} style={{ padding: 24 }}>No delivered bookings with a pending Master invoice match these filters.</td></tr>}
                        {data.rows.map(row => <tr key={row.BookingID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <TD><Link to={`/sales/bookings/${row.BookingID}`}>{row.BookingNo}</Link><div><small>Booked {date(row.BookingDate)}</small></div></TD>
                            <TD>{date(row.DeliveryDate)}</TD><TD align="right">{fmtInt(row.DaysSinceDelivery)}</TD>
                            <TD>{row.CustomerName}<div><small>{row.CNIC || 'CNIC not recorded'}</small></div></TD>
                            <TD>{row.ModelName}<div><small>{row.VariantName}</small></div></TD>
                            <TD>{row.ChasisNo || '—'}<div><small>{row.EngineNo}</small></div></TD><TD>{row.GatePassNo || '—'}</TD>
                            <TD>{row.SalespersonName}</TD><TD>{row.Status}</TD>
                            <td className="no-print" style={{ padding: 10 }}>{canUpload && <button className="erp-btn erp-btn-primary" disabled={loading} onClick={() => { setMessage(''); setUpload({ booking: row, reload }); }}><Upload size={14} /> Upload Master Invoice</button>}</td>
                        </tr>)}
                    </tbody>
                </table></div>
            </>}
        </ReportShell>
        {upload && <MasterInvoiceUploadModal booking={upload.booking} onClose={() => setUpload(null)}
            onSaved={() => { const { booking, reload } = upload; setUpload(null); setMessage(`Master invoice uploaded for ${booking.BookingNo}.`); reload(); }} />}
    </>;
}
