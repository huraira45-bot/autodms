import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Boxes, ScrollText } from 'lucide-react';
import ReportShell, { TH, TD, fmtInt } from './ReportShell';

const input = { padding: 7, border: '1px solid #cbd5e1', borderRadius: 5, maxWidth: 230 };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const date = value => value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) : '';
const csv = value => /^[=+\-@\t\r]/.test(String(value || '')) ? `'${value}` : value ?? '';
const entry = { Opening: 'Opening snapshot', Registered: 'Registered', Delivered: 'Delivered', Returned: 'Returned', Restored: 'Stock restored', Removed: 'Removed', Edited: 'Details changed', StatusChanged: 'Status changed', VariantIn: 'Variant transfer in', VariantOut: 'Variant transfer out' };

function useOptions() {
    const [options, setOptions] = useState({ models: [], variants: [], error: '' });
    useEffect(() => {
        const abort = new AbortController();
        axios.get('/api/reports/sales/vehicle-inventory-options', { signal: abort.signal })
            .then(({ data }) => setOptions({ ...data, error: '' }))
            .catch(error => { if (!abort.signal.aborted) setOptions({ models: [], variants: [], error: error.response?.data?.error || error.message }); });
        return () => abort.abort();
    }, []);
    return options;
}
function Filters({ params, updateParam, options, ledger }) {
    return <>
        <Link className="erp-btn" to="/module/sales-reports">All sale reports</Link>
        <Link className="erp-btn" to={ledger ? '/reports/sales/vehicle-inventory-by-variant' : '/reports/sales/vehicle-inventory-ledger'}>{ledger ? 'Inventory by variant' : 'Inventory ledger'}</Link>
        {ledger && <>
            <label>From <input type="date" style={input} value={params.from || ''} onChange={e => updateParam('from', e.target.value || undefined)} /></label>
            <label>To <input type="date" style={input} value={params.to || ''} onChange={e => updateParam('to', e.target.value || undefined)} /></label>
        </>}
        <label>Model <select style={input} value={params.modelId || ''} onChange={e => { updateParam('modelId', e.target.value || undefined); updateParam('variantId', undefined); }}>
            <option value="">All models</option>{options.models.map(m => <option key={m.ModelID} value={m.ModelID}>{m.ModelName}</option>)}
        </select></label>
        <label>Variant <select style={input} value={params.variantId || ''} onChange={e => updateParam('variantId', e.target.value || undefined)}>
            <option value="">All variants</option>{options.variants.filter(v => !params.modelId || String(v.ModelID) === params.modelId).map(v => <option key={v.VariantID} value={v.VariantID}>{v.VariantCode} — {v.VariantName}</option>)}
        </select></label>
        <input aria-label={ledger ? 'Search chassis or engine' : 'Search model or variant'} placeholder={ledger ? 'Chassis / engine' : 'Model / variant'} style={input} value={params.search || ''} onChange={e => updateParam('search', e.target.value || undefined)} />
        {!ledger && <label><input type="checkbox" checked={params.inStockOnly === '1'} onChange={e => updateParam('inStockOnly', e.target.checked ? '1' : undefined)} /> In stock only</label>}
        {options.error && <span className="erp-alert danger">Cannot load filters: {options.error}</span>}
    </>;
}
function filterText(params, options) {
    return [params.from && `From ${params.from}`, params.to && `to ${params.to}`,
        params.modelId && `Model: ${options.models.find(m => String(m.ModelID) === params.modelId)?.ModelName || params.modelId}`,
        params.variantId && `Variant: ${options.variants.find(v => String(v.VariantID) === params.variantId)?.VariantName || params.variantId}`,
        params.search && `Search: ${params.search}`, params.inStockOnly === '1' && 'In stock only'].filter(Boolean).join(' | ') || 'All models and variants';
}
function Totals({ values }) {
    return <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>{values.map(([label, value]) => <span key={label}>{label}: <strong>{fmtInt(value)}</strong></span>)}</div>;
}

export function VehicleInventoryByVariant() {
    const options = useOptions();
    return <ReportShell title="Vehicle Inventory by Variant" icon={Boxes} endpoint="sales/vehicle-inventory-by-variant"
        subtitle="Current registered stock by model and variant. Delivered and returned vehicles are excluded from stock."
        defaultParams={{}} superWide printFilterSummary={p => filterText(p, options)}
        controls={props => <Filters {...props} options={options} />}
        excelExport={data => ({ filename: 'vehicle-inventory-by-variant.csv',
            headers: ['Model', 'Variant code', 'Variant', 'Recorded vehicles', 'In stock', 'At Master', 'In transit', 'At dealer', 'Allocated', 'Delivered', 'Returned', 'Open allocation stock'],
            rows: data.rows.map(r => [r.ModelName, r.VariantCode, r.VariantName].map(csv).concat([r.TotalVehicles, r.InStock, r.AtMaster, r.InTransit, r.AtDealer, r.Allocated, r.Delivered, r.Returned, r.OpenAllocation])),
        })}>
        {data => <>
            <Totals values={[[ 'Variants', data.totals.variants ], [ 'In stock', data.totals.InStock ], [ 'At dealer', data.totals.AtDealer ], [ 'Allocated', data.totals.Allocated ], [ 'Delivered', data.totals.Delivered ], [ 'Returned', data.totals.Returned ]]} />
            <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr><TH>Model</TH><TH>Variant</TH>{['Recorded', 'Stock', 'At Master', 'In transit', 'At dealer', 'Allocated', 'Delivered', 'Returned', 'Open allocation'].map(label => <TH key={label} align="right">{label}</TH>)}<TH>Ledger</TH></tr></thead>
                <tbody>{!data.rows.length && <tr><td colSpan={12} style={{ padding: 24 }}>No variants match these filters.</td></tr>}
                    {data.rows.map(r => <tr key={r.VariantID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <TD>{r.ModelName}</TD><TD>{r.VariantName}<div><small>{r.VariantCode}</small></div></TD>
                        {['TotalVehicles', 'InStock', 'AtMaster', 'InTransit', 'AtDealer', 'Allocated', 'Delivered', 'Returned', 'OpenAllocation'].map(key => <TD key={key} align="right" bold={key === 'InStock'}>{fmtInt(r[key])}</TD>)}
                        <TD><Link to={`/reports/sales/vehicle-inventory-ledger?variantId=${r.VariantID}`}>View</Link></TD>
                    </tr>)}
                </tbody>
            </table></div>
            <p className="hint">Stock includes vehicles at Master, in transit, at the dealer and allocated to bookings. Open-allocation stock is included in the stock total.</p>
        </>}
    </ReportShell>;
}

export function VehicleInventoryLedger() {
    const options = useOptions();
    const [searchParams] = useSearchParams();
    const initialVariantId = searchParams.get('variantId');
    return <ReportShell title="Vehicle Inventory Ledger" icon={ScrollText} endpoint="sales/vehicle-inventory-ledger"
        subtitle="Variant-wise opening stock, movements and running balance. Dates and times use Pakistan time."
        defaultParams={{ from: today(), to: today(), ...(initialVariantId ? { variantId: initialVariantId } : {}) }} superWide
        printFilterSummary={p => filterText(p, options)} controls={props => <Filters {...props} options={options} ledger />}
        excelExport={data => ({ filename: 'vehicle-inventory-ledger.csv',
            headers: ['Row type', 'Time (Pakistan)', 'Model', 'Variant code', 'Variant', 'Chassis', 'Engine', 'Movement', 'From status', 'To status', 'From location', 'To location', 'Booking', 'Gate pass', 'Opening quantity', 'In', 'Out', 'Variant balance', 'User / source'],
            rows: [
                ...data.variants.map(v => ['Variant summary', '', csv(v.ModelName), csv(v.VariantCode), csv(v.VariantName), '', '', '', '', '', '', '', '', '', v.Opening, v.QuantityIn, v.QuantityOut, v.Closing, '']),
                ...data.rows.map(r => ['Movement', ...[date(r.OccurredAtUtc), r.ModelName, r.VariantCode, r.VariantName, r.ChasisNo, r.EngineNo, entry[r.EntryType] || r.EntryType, r.FromStatus, r.ToStatus, r.FromLocation, r.ToLocation, r.BookingNo, r.GatePassNo].map(csv), r.OpeningQuantity, r.QuantityIn, r.QuantityOut, r.Balance, csv(r.ActorName)]),
            ],
        })}>
        {data => <>
            <div className="erp-alert">Tracking started {date(data.startedAtUtc)}. Existing vehicles form the opening snapshot; earlier movements have not been reconstructed.</div>
            <Totals values={[[ 'Opening stock', data.totals.Opening ], [ 'Stock in', data.totals.QuantityIn ], [ 'Stock out', data.totals.QuantityOut ], [ 'Closing stock', data.totals.Closing ]]} />
            <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr><TH>Model / variant</TH><TH align="right">Opening</TH><TH align="right">In</TH><TH align="right">Out</TH><TH align="right">Closing</TH></tr></thead>
                <tbody>{data.variants.map(v => <tr key={v.VariantID}><TD>{v.ModelName} — {v.VariantName}</TD>{['Opening', 'QuantityIn', 'QuantityOut', 'Closing'].map(key => <TD key={key} align="right" bold>{fmtInt(v[key])}</TD>)}</tr>)}</tbody>
            </table></div>
            <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr><TH>Time</TH><TH>Variant</TH><TH>Chassis / engine</TH><TH>Movement</TH><TH>Status</TH><TH>Location</TH><TH>Booking / gate pass</TH><TH align="right">Opening</TH><TH align="right">In</TH><TH align="right">Out</TH><TH align="right">Balance</TH><TH>User / source</TH></tr></thead>
                <tbody>{!data.rows.length && <tr><td colSpan={12} style={{ padding: 24 }}>No movements in this period. Opening and closing stock are shown above.</td></tr>}
                    {data.rows.map(r => <tr key={r.MovementID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <TD>{date(r.OccurredAtUtc)}</TD><TD>{r.VariantName}<div><small>{r.ModelName} · {r.VariantCode}</small></div></TD>
                        <TD>{r.ChasisNo}<div><small>{r.EngineNo}</small></div></TD><TD>{entry[r.EntryType] || r.EntryType}</TD>
                        <TD>{r.FromStatus || '—'} → {r.ToStatus || 'Removed'}</TD><TD>{r.ToLocation || r.FromLocation || '—'}</TD>
                        <TD>{r.BookingID ? <Link to={`/sales/bookings/${r.BookingID}`}>{r.BookingNo || r.BookingID}</Link> : '—'}<div><small>{r.GatePassNo}</small></div></TD>
                        {[r.OpeningQuantity, r.QuantityIn, r.QuantityOut, r.Balance].map((value, index) => <TD key={index} align="right" bold={index === 3}>{fmtInt(value)}</TD>)}<TD>{r.ActorName}</TD>
                    </tr>)}
                </tbody>
            </table></div>
            <p className="hint">Registering a chassis adds one stock unit. Status, location and allocation changes within stock have zero quantity effect. Delivery, return or deletion removes the unit. Each variant has its own running balance; opening entries initialize that balance. Ledger entries remain after a permitted vehicle deletion.</p>
        </>}
    </ReportShell>;
}
