import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Wallet } from 'lucide-react';
import ReportShell, { TH, TD, fmt } from './ReportShell';
import { formatDeliveryMonth } from '../../utils/deliveryMonth';

const control = { padding: 7, border: '1px solid #cbd5e1', borderRadius: 5, maxWidth: 220 };
const text = value => /^[=+\-@\t\r]/.test(String(value || '')) ? `'${value}` : (value || '');
const statusLabels = { complete: 'Complete', partial: 'Partial', unpaid: 'Unpaid', unpriced: 'Price not set', remaining: 'Balance remaining' };
function PaymentStatus({ value }) {
    const color = { complete: '#15803d', partial: '#b45309', unpaid: '#b91c1c', unpriced: '#64748b' }[value];
    return <span style={{ color, fontWeight: 600 }}>{statusLabels[value] || value}</span>;
}
function PaymentFilter({ title, value, onChange }) {
    return <label>{title} <select style={control} value={value || ''} onChange={e => onChange(e.target.value || undefined)}>
        <option value="">All payments</option>
        <option value="complete">Complete</option><option value="partial">Partial</option>
        <option value="unpaid">Unpaid</option><option value="remaining">Balance remaining (partial + unpaid)</option>
        <option value="unpriced">Price not set</option>
    </select></label>;
}

export default function BookingPaymentReport() {
    const [options, setOptions] = useState({ models: [], variants: [], salespeople: [] });
    const [optionsError, setOptionsError] = useState('');
    const [retry, setRetry] = useState(0);
    const [loadingOptions, setLoadingOptions] = useState(true);
    useEffect(() => {
        const abort = new AbortController();
        setLoadingOptions(true); setOptionsError('');
        axios.get('/api/reports/sales/booking-payments/options', { signal: abort.signal })
            .then(({ data }) => setOptions(data))
            .catch(error => { if (!abort.signal.aborted) setOptionsError(error.response?.data?.error || error.message); })
            .finally(() => { if (!abort.signal.aborted) setLoadingOptions(false); });
        return () => abort.abort();
    }, [retry]);

    const filterSummary = params => [
        params.from && `Booked from ${params.from}`, params.to && `to ${params.to}`,
        params.modelId && `Model: ${options.models.find(m => String(m.ModelID) === params.modelId)?.ModelName || params.modelId}`,
        params.variantId && `Variant: ${options.variants.find(v => String(v.VariantID) === params.variantId)?.VariantName || params.variantId}`,
        params.salespersonId && `Salesperson: ${options.salespeople.find(s => String(s.SalespersonID) === params.salespersonId)?.SalespersonName || params.salespersonId}`,
        params.customerPayment && `Customer: ${statusLabels[params.customerPayment]}`,
        params.masterPayment && `Master: ${statusLabels[params.masterPayment]}`,
        params.search && `Search: ${params.search}`,
    ].filter(Boolean).join(' | ') || 'All non-cancelled bookings; current payment position';

    return <>
        {optionsError && <div className="erp-alert danger no-print">Cannot load booking filters: {optionsError} <button type="button" className="erp-btn" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
        <ReportShell title="Booking Payment Status" icon={Wallet} endpoint="sales/booking-payments" defaultParams={{}} superWide
            subtitle="Filter by model, variant, salesperson and customer / Master payment status. Current vehicle amounts, excluding premium and cancelled bookings."
            printFilterSummary={filterSummary}
            controls={({ params, updateParam }) => <>
                <Link className="erp-btn" to="/module/sales-reports">All sale reports</Link>
                <label>Booking from <input type="date" style={control} value={params.from || ''} onChange={e => updateParam('from', e.target.value || undefined)} /></label>
                <label>To <input type="date" style={control} value={params.to || ''} onChange={e => updateParam('to', e.target.value || undefined)} /></label>
                <label>Model <select disabled={loadingOptions} style={control} value={params.modelId || ''} onChange={e => { updateParam('modelId', e.target.value || undefined); updateParam('variantId', undefined); }}>
                    <option value="">All models</option>
                    {options.models.map(m => <option key={m.ModelID} value={m.ModelID}>{m.ModelName || `Model #${m.ModelID}`}</option>)}
                </select></label>
                <label>Variant <select disabled={loadingOptions} style={control} value={params.variantId || ''} onChange={e => updateParam('variantId', e.target.value || undefined)}>
                    <option value="">All variants</option>
                    {options.variants.filter(v => !params.modelId || String(v.ModelID) === params.modelId).map(v => <option key={v.VariantID} value={v.VariantID}>{v.VariantName || `Variant #${v.VariantID}`}</option>)}
                </select></label>
                <label>Salesperson <select disabled={loadingOptions} style={control} value={params.salespersonId || ''} onChange={e => updateParam('salespersonId', e.target.value || undefined)}>
                    <option value="">All salespeople</option>
                    {options.salespeople.map(s => <option key={s.SalespersonID} value={s.SalespersonID}>{s.SalespersonName || `Employee #${s.SalespersonID}`}</option>)}
                </select></label>
                <PaymentFilter title="Customer payment" value={params.customerPayment} onChange={value => updateParam('customerPayment', value)} />
                <PaymentFilter title="Master payment" value={params.masterPayment} onChange={value => updateParam('masterPayment', value)} />
                <input aria-label="Search bookings" placeholder="Booking / customer / phone / chassis" style={control} value={params.search || ''} onChange={e => updateParam('search', e.target.value || undefined)} />
                <button type="button" className="erp-btn" onClick={() => ['from', 'to', 'modelId', 'variantId', 'salespersonId', 'customerPayment', 'masterPayment', 'search'].forEach(key => updateParam(key, undefined))}>Clear filters</button>
            </>}
            excelExport={data => ({ filename: 'booking-payment-status.csv',
                headers: ['Booking', 'Booking date', 'Promised month', 'Customer', 'Phone', 'Model', 'Variant', 'Chassis', 'Salesperson', 'Booking status', 'Historical', 'Vehicle price', 'Customer received', 'Customer balance', 'Customer overpaid', 'Customer payment status', 'Master due', 'Master paid / approved', 'Master balance', 'Master overpaid', 'Master payment status', 'Master posted remittances', 'Historical Master approved', 'Historical approval used'],
                rows: data.rows.map(r => [
                    ...[r.BookingNo, r.BookingDate, r.PromisedDeliveryMonth, r.CustomerName, r.Phone, r.ModelName, r.VariantName, r.ChasisNo, r.SalespersonName, r.Status, r.IsHistorical ? 'Yes' : 'No'].map(text),
                    r.VehiclePrice, r.VehiclePaid, r.CustomerRemaining, r.CustomerOverpaid, statusLabels[r.CustomerPaymentStatus],
                    r.MasterDue, r.MasterPaid, r.MasterRemaining, r.MasterOverpaid, statusLabels[r.MasterPaymentStatus], r.MasterLedgerRemitted, r.HistoricalMasterApprovedAmount, r.MasterApprovalUsed ? 'Yes' : 'No',
                ]),
            })}>
            {data => <>
                <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                    <span>Bookings: <strong>{data.totals.count}</strong></span>
                    <span>Vehicle price: <strong>{fmt(data.totals.VehiclePrice)}</strong></span>
                    <span>Customer received: <strong>{fmt(data.totals.VehiclePaid)}</strong></span>
                    <span>Customer balance: <strong style={{ color: '#b45309' }}>{fmt(data.totals.CustomerRemaining)}</strong></span>
                    <span>Master due: <strong>{fmt(data.totals.MasterDue)}</strong></span>
                    <span>Master paid / approved: <strong>{fmt(data.totals.MasterPaid)}</strong></span>
                    <span>Master balance: <strong style={{ color: '#b45309' }}>{fmt(data.totals.MasterRemaining)}</strong></span>
                </div>
                <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr><TH>Booking / date</TH><TH>Customer</TH><TH>Model / variant</TH><TH>Salesperson</TH><TH align="right">Vehicle price</TH><TH align="right">Customer received</TH><TH align="right">Customer balance</TH><TH>Customer payment</TH><TH align="right">Master due</TH><TH align="right">Paid to Master</TH><TH align="right">Master balance</TH><TH>Master payment</TH></tr></thead>
                    <tbody>{!data.rows.length && <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center' }}>No bookings match these filters.</td></tr>}
                        {data.rows.map(r => <tr key={r.BookingID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <TD><Link to={`/sales/bookings/${r.BookingID}`}>{r.BookingNo}</Link><div>{r.BookingDate}</div><small>{r.Status}{r.IsHistorical ? ' | Historical' : ''}</small><div><small>Promised: {formatDeliveryMonth(r.PromisedDeliveryMonth)}</small></div></TD>
                            <TD>{r.CustomerName}<div>{r.Phone}</div></TD>
                            <TD>{r.ModelName}<div>{r.VariantName}</div><small>{r.ChasisNo || 'Not allocated'}</small></TD>
                            <TD>{r.SalespersonName || 'Unassigned'}</TD>
                            <TD align="right">{fmt(r.VehiclePrice)}</TD><TD align="right">{fmt(r.VehiclePaid)}</TD>
                            <TD align="right" bold>{fmt(r.CustomerRemaining)}{r.CustomerOverpaid > 0 && <div><small>Excess: {fmt(r.CustomerOverpaid)}</small></div>}</TD>
                            <TD><PaymentStatus value={r.CustomerPaymentStatus} /></TD>
                            <TD align="right">{fmt(r.MasterDue)}</TD>
                            <TD align="right">{fmt(r.MasterPaid)}{r.MasterApprovalUsed && <div><small>Historical approval *</small></div>}</TD>
                            <TD align="right" bold>{fmt(r.MasterRemaining)}{r.MasterOverpaid > 0 && <div><small>Excess: {fmt(r.MasterOverpaid)}</small></div>}</TD>
                            <TD><PaymentStatus value={r.MasterPaymentStatus} /></TD>
                        </tr>)}
                    </tbody>
                </table></div>
                <p style={{ fontSize: 12, color: '#64748b' }}>All amounts are PKR. Customer receipts use recorded vehicle payments, including historical receipts; premium is separate. Master due uses the agreed Master amount or applicable vehicle rate. Posted direct pay orders count; voided remittances are deducted. Delivery settlement entries do not remove amounts already sent. * Historical approvals count toward Master payment without posting a voucher; Excel lists those approvals and posted remittances separately. Date filters select bookings; payment figures show their current position.</p>
            </>}
        </ReportShell>
    </>;
}
