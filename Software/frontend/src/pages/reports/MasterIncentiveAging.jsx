import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Award } from 'lucide-react';
import ReportShell, { TH, TD, fmt } from './ReportShell';
const today = () => new Date(Date.now() + 300 * 60000).toISOString().slice(0, 10);
const safe = value => /^[=+\-@\t\r]/.test(String(value || '')) ? `'${value}` : value ?? '';
function Filters({ params, updateParam }) {
    const [variants, setVariants] = useState([]), [search, setSearch] = useState(params.search || '');
    useEffect(() => { axios.get('/api/reports/sales/master-incentive-options').then(r => setVariants(r.data)).catch(() => {}); }, []);
    return <>
        <Link className="erp-btn" to="/sales/master-incentive-rates">Incentive rates</Link>
        <label>As of <input type="date" value={params.asOf} onChange={e => updateParam('asOf', e.target.value || today())} /></label>
        <label>Booking from <input type="date" value={params.from || ''} onChange={e => updateParam('from', e.target.value || undefined)} /></label>
        <label>To <input type="date" value={params.to || ''} onChange={e => updateParam('to', e.target.value || undefined)} /></label>
        <select aria-label="Vehicle variant" value={params.variantId || ''} onChange={e => updateParam('variantId', e.target.value || undefined)}>
            <option value="">All variants</option>{variants.map(v => <option key={v.VariantID} value={v.VariantID}>{v.VariantName}</option>)}
        </select>
        <select aria-label="Balances to show" value={params.show || 'outstanding'} onChange={e => updateParam('show', e.target.value)}>
            <option value="outstanding">Outstanding / refund due</option><option value="all">All incentive bookings</option>
        </select>
        <form onSubmit={e => { e.preventDefault(); updateParam('search', search.trim() || undefined); }} style={{ display: 'flex', gap: 6 }}>
            <input type="search" maxLength={150} value={search} onChange={e => setSearch(e.target.value)} placeholder="DMS / booking / customer / CNIC / chassis" />
            <button className="erp-btn" type="submit">Search</button>
        </form>
    </>;
}
export default function MasterIncentiveAging() {
    return <ReportShell title="Master Incentive Aging — Booking Wise" subtitle="Aged from booking date. Tracked incentive and posted accrual are shown separately; historical bookings are excluded."
        icon={Award} endpoint="sales/master-incentive-aging" defaultParams={{ asOf: today(), show: 'outstanding' }} controls={props => <Filters {...props} />} superWide
        excelExport={data => ({ filename: `master-incentive-aging-${data.asOf}.csv`,
            headers: ['Booking', 'DMS number', 'Booking date', 'Customer', 'CNIC', 'Model', 'Variant', 'Chassis', 'Salesperson', 'Booking status', 'Incentive', 'Posted incentive', 'Received gross', 'Outstanding', 'Refund due to Master', 'Age days', 'Bucket', 'Ledger state', 'Vouchers'],
            rows: data.rows.map(r => [r.BookingNo, r.DMSBookingNumber, r.BookingDate, r.CustomerName, r.CNIC, r.ModelName, r.VariantName, r.ChasisNo, r.Salesperson, r.BookingStatus,
                r.Accrued, r.PostedAccrued, r.Received, r.Outstanding, r.RefundDueToMaster, r.AgeDays, r.Bucket, r.LedgerState, r.VoucherNumbers].map(safe)) })}>
        {data => <>
            <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <span>Bookings <strong>{data.totals.bookings}</strong></span><span>Accrued <strong>{fmt(data.totals.accrued)}</strong></span>
                <span>Posted <strong>{fmt(data.totals.posted)}</strong></span><span>Received (gross) <strong>{fmt(data.totals.received)}</strong></span>
                <span>Outstanding <strong>{fmt(data.totals.outstanding)}</strong></span><span>Refund due to Master <strong>{fmt(data.totals.refundDue)}</strong></span>
            </div>
            <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>{Object.entries(data.totals.buckets).map(([b, v]) => <span key={b}>{b} days: <strong>{fmt(v)}</strong></span>)}</div>
            <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Booking / DMS', 'Booking date', 'Customer / CNIC', 'Variant / chassis', 'Salesperson', 'Incentive', 'Posted', 'Received', 'Outstanding', 'Refund due', 'Age / bucket', 'Ledger / vouchers'].map(h => <TH key={h}>{h}</TH>)}</tr></thead>
                <tbody>{data.rows.map(r => <tr key={r.BookingID}>
                    <TD><Link to={`/sales/bookings/${r.BookingID}`}>{r.BookingNo}</Link><div>DMS: {r.DMSBookingNumber || '—'}</div><div>{r.BookingStatus}</div></TD>
                    <TD>{r.BookingDate}</TD><TD>{r.CustomerName}<div>{r.CNIC || '—'}</div></TD><TD>{r.ModelName}<div>{r.VariantName}</div><div>{r.ChasisNo || '—'}</div></TD><TD>{r.Salesperson || '—'}</TD>
                    <TD align="right">{fmt(r.Accrued)}</TD><TD align="right">{fmt(r.PostedAccrued)}</TD><TD align="right">{fmt(r.Received)}</TD>
                    <TD align="right" bold>{fmt(r.Outstanding)}</TD><TD align="right">{fmt(r.RefundDueToMaster)}</TD><TD>{r.AgeDays} days<div>{r.Bucket}</div></TD><TD>{r.LedgerState}<div>{r.VoucherNumbers || '—'}</div></TD>
                </tr>)}{!data.rows.length && <tr><TD>No matching incentives.</TD></tr>}</tbody>
            </table></div>
        </>}
    </ReportShell>;
}
