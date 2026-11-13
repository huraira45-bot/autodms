import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import ReportShell, { TH, TD, fmtInt } from './ReportShell';
import VehicleStockStatusFilter, { stockStatusLabel } from './VehicleStockStatusFilter';
import VehicleStockTypeFilter, { stockTypeLabel } from './VehicleStockTypeFilter';
import { formatDeliveryMonth } from '../../utils/deliveryMonth';
const csv=value=>/^[=+\-@\t\r]/.test(String(value||''))?`'${value}`:value??'';
const assignmentLabel=value=>({Allocated:'Allocated',Unallocated:'Unallocated',Review:'Review booking links'}[value]||'All allocations');
function Filters({params,updateParam}){
    const [search,setSearch]=useState(params.search||'');
    return <>
        <Link className="erp-btn" to="/module/sales-reports">All sale reports</Link>
        <form onSubmit={e=>{e.preventDefault();updateParam('search',search.trim()||undefined);}} style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <input type="search" aria-label="Search chassis, DMS booking number or customer name" placeholder="Chassis / DMS booking number / customer name" maxLength={150}
                value={search} onChange={e=>setSearch(e.target.value)} style={{padding:7,width:330,maxWidth:'100%'}} />
            <button type="submit" className="erp-btn">Search</button>
            <button type="button" className="erp-btn" onClick={()=>{setSearch('');['search','stockStatus','allocationType','assignment'].forEach(key=>updateParam(key,undefined));updateParam('inStockOnly','1');}}>Reset filters</button>
        </form>
        <VehicleStockStatusFilter params={params} updateParam={updateParam}/><VehicleStockTypeFilter params={params} updateParam={updateParam}/>
        <label>Assignment <select value={params.assignment||''} onChange={e=>updateParam('assignment',e.target.value||undefined)}>
            <option value="">All allocations</option><option value="Allocated">Allocated</option><option value="Unallocated">Unallocated</option><option value="Review">Review booking links</option>
        </select></label>
        <label><input type="checkbox" checked={params.inStockOnly==='1'} onChange={e=>updateParam('inStockOnly',e.target.checked?'1':undefined)}/> In stock only (not delivered)</label>
    </>;
}
export default function VehicleAllocationReport(){
    return <ReportShell title="Vehicle Stock Allocation" icon={Truck} endpoint="sales/vehicle-stock-allocation" defaultParams={{inStockOnly:'1'}} superWide
        subtitle="See which vehicle is linked to which booking and customer. Booked / Open Allocation is the stock type; assignment shows its current customer link."
        controls={props=><Filters {...props}/>}
        printFilterSummary={p=>[p.search&&`Search: ${p.search}`,stockStatusLabel(p.stockStatus),p.allocationType&&stockTypeLabel(p.allocationType),assignmentLabel(p.assignment),p.inStockOnly==='1'&&'In stock only'].filter(Boolean).join(' | ')}
        excelExport={data=>({filename:'vehicle-stock-allocation.csv',headers:['Chassis','Engine','Model','Variant','Color','Status','Location','Stock type','Assignment','Booking','DMS booking number','Booking date','Promised month','Customer','CNIC','Phone','Salesperson','Booking status'],
            rows:data.rows.map(r=>[r.ChasisNo,r.EngineNo,r.ModelName,r.VariantName,r.Color,stockStatusLabel(r.VehicleStatus)==='All statuses'?r.VehicleStatus:stockStatusLabel(r.VehicleStatus),r.Location,stockTypeLabel(r.AllocationType),assignmentLabel(r.AllocationState),r.BookingNo,r.DMSBookingNumber,r.BookingDate,r.PromisedDeliveryMonth,r.CustomerName,r.CNIC,r.Phone,r.SalespersonName,r.BookingStatus].map(csv))})}>
        {data=><>
            <div className="card" style={{display:'flex',gap:20,flexWrap:'wrap'}}>{[['Vehicles',data.totals.vehicles],['Allocated',data.totals.allocated],['Unallocated',data.totals.unallocated],['Booked stock',data.totals.booked],['Open Allocation stock',data.totals.openAllocation],['Review links',data.totals.review]].map(([label,value])=><span key={label}>{label}: <strong>{fmtInt(value)}</strong></span>)}</div>
            <div className="card" style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr>{['Chassis / engine','Model / variant','Status / location','Stock type','Assignment','Booking / DMS number','Customer','Salesperson'].map(label=><TH key={label}>{label}</TH>)}</tr></thead>
                <tbody>{!data.rows.length&&<tr><td colSpan={8} style={{padding:24}}>No vehicles match these filters.</td></tr>}
                    {data.rows.map(r=><tr key={r.VehicleID} style={{borderBottom:'1px solid #e2e8f0'}}>
                        <TD>{r.ChasisNo}<div><small>{r.EngineNo}</small></div></TD><TD>{r.ModelName}<div>{r.VariantName}</div><small>{r.Color}</small></TD>
                        <TD>{['AtDealer','InTransit','AtMaster','Allocated'].includes(r.VehicleStatus)?stockStatusLabel(r.VehicleStatus):r.VehicleStatus}<div>{r.Location}</div></TD>
                        <TD>{stockTypeLabel(r.AllocationType)}</TD><TD>{assignmentLabel(r.AllocationState)}</TD>
                        <TD>{r.BookingID?<Link to={`/sales/bookings/${r.BookingID}`}>{r.BookingNo}</Link>:'—'}<div>DMS: {r.DMSBookingNumber||'—'}</div><small>{r.BookingStatus} {r.BookingDate}</small>{r.BookingID&&<div><small>Promised: {formatDeliveryMonth(r.PromisedDeliveryMonth)}</small></div>}</TD>
                        <TD>{r.CustomerName||(r.AllocationState==='Review'?'Review booking links':'—')}<div><small>{r.CNIC}</small></div><small>{r.Phone}</small></TD><TD>{r.SalespersonName||'—'}</TD>
                    </tr>)}
                </tbody>
            </table></div>
            {data.totals.review>0&&<p>Vehicles marked “Review booking links” have conflicting or stale assignments; a customer has not been guessed for them.</p>}
        </>}
    </ReportShell>;
}
