import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import ReportShell, { TH, TD, fmtInt } from './ReportShell';
import { formatDeliveryMonth } from '../../utils/deliveryMonth';

const csv = value => /^[=+\-@\t\r]/.test(String(value || '')) ? `'${value}` : value ?? '';
function Controls({ params, updateParam }) {
    const [search, setSearch] = useState(params.search || '');
    return <>
        <Link className="erp-btn" to="/module/sales-reports">All sale reports</Link>
        <form style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} onSubmit={event => { event.preventDefault(); updateParam('search', search.trim()); }}>
            <input type="search" aria-label="Account code or account name" placeholder="Enter account code or account name" maxLength={150} value={search}
                onChange={event => setSearch(event.target.value)} style={{ padding: '8px 10px', width: 330, maxWidth: '100%', border: '1px solid #cbd5e1', borderRadius: 5 }} />
            <button type="submit" className="erp-btn erp-btn-primary">Find bookings</button>
            {(search || params.search) && <button type="button" className="erp-btn" onClick={() => { setSearch(''); updateParam('search', ''); }}>Clear</button>}
        </form>
    </>;
}

export default function AccountBookingLinks() {
    return <ReportShell title="Account Booking Links" icon={Landmark} endpoint="sales/account-bookings" defaultParams={{ search: '' }} superWide
        subtitle="Find which sales bookings are linked to a customer account. Search by account code or account name."
        controls={props => <Controls {...props} />} printFilterSummary={params => params.search ? `Account search: ${params.search}` : 'Enter an account code or name'}
        excelExport={data => ({ filename: 'account-booking-links.csv',
            headers: ['Account code', 'Account name', 'Customer', 'CNIC', 'Booking', 'Booking date', 'Promised month', 'Model', 'Variant', 'Chassis', 'Salesperson', 'Status', 'Record type'],
            rows: data.rows.map(row => [row.AccountCode, row.AccountName, row.CustomerName, row.CNIC, row.BookingNo || 'No booking linked', row.BookingDate,
                row.PromisedDeliveryMonth, row.ModelName, row.VariantName, row.ChasisNo, row.SalespersonName, row.Status,
                row.BookingID ? (row.IsHistorical ? 'Historical' : 'Regular') : ''].map(csv)),
        })}>
        {data => data.searchRequired ? <div className="card">Enter an account code or name above, then click <strong>Find bookings</strong>.</div> : <>
            <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                <span>Matching accounts: <strong>{fmtInt(data.totals.accounts)}</strong></span>
                <span>Linked accounts: <strong>{fmtInt(data.totals.linkedAccounts)}</strong></span>
                <span>Bookings: <strong>{fmtInt(data.totals.bookings)}</strong></span>
                <span>Accounts without bookings: <strong>{fmtInt(data.totals.unlinkedAccounts)}</strong></span>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr><TH>Account</TH><TH>Customer / CNIC</TH><TH>Booking</TH><TH>Booked</TH><TH>Promised month</TH><TH>Vehicle / chassis</TH><TH>Salesperson</TH><TH>Status</TH><TH>Record type</TH></tr></thead>
                <tbody>{!data.rows.length && <tr><td colSpan={9} style={{ padding: 24 }}>No accounts match this code or name.</td></tr>}
                    {data.rows.map(row => <tr key={`${row.AccountID}-${row.PartyID || 0}-${row.BookingID || 0}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <TD><strong>{row.AccountCode}</strong><div>{row.AccountName}</div></TD>
                        <TD>{row.CustomerName || '—'}<div><small>{row.CNIC}</small></div></TD>
                        <TD>{row.BookingID ? <Link to={`/sales/bookings/${row.BookingID}`}>{row.BookingNo}</Link> : <strong>No booking linked</strong>}</TD>
                        <TD>{row.BookingDate || '—'}</TD><TD>{row.BookingID ? formatDeliveryMonth(row.PromisedDeliveryMonth) : '—'}</TD>
                        <TD>{row.ModelName}<div><small>{row.VariantName}</small></div><div><small>{row.ChasisNo}</small></div></TD>
                        <TD>{row.SalespersonName || '—'}</TD><TD>{row.Status || '—'}</TD>
                        <TD>{row.BookingID ? (row.IsHistorical ? 'Historical' : 'Regular') : '—'}</TD>
                    </tr>)}
                </tbody>
            </table></div>
            <p className="hint">Shows the account currently assigned to the booking’s customer. Includes closed, cancelled and historical bookings.</p>
        </>}
    </ReportShell>;
}
