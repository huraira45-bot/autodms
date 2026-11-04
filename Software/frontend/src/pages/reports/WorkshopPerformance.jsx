import React,{useEffect,useState} from 'react';
import axios from 'axios';
import {Link} from 'react-router-dom';
import {UserCog,Building2} from 'lucide-react';
import ReportShell,{PeriodControls,fmt} from './ReportShell';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fieldStyle={padding:'7px 9px',border:'1px solid #cbd5e1',borderRadius:5};
const date=v=>v?String(v).replace('T',' ').replace(/\.\d{3}Z$/,'').slice(0,19):'';
const column=(key,label,numeric=false)=>({key,label,numeric});
const techSummary=[column('Rank','#',true),column('TechnicianName','Technician'),column('JobCards','Jobs',true),column('JobLines','Work lines',true),
    column('CompletedLines','Completed lines',true),column('GrossLabour','Gross labour',true),column('Discount','Discount',true),column('NetLabour','Net labour',true),
    column('RecordedHours','Recorded hours',true),column('AveragePerJob','Average / job',true)];
const deptSummary=[column('Rank','#',true),column('DepartmentName','Business Unit / department'),column('JobCards','Jobs',true),column('FinalizedCards','Finalized',true),
    column('DraftCards','Draft',true),column('NetLabour','Net labour',true),column('Parts','Parts',true),column('Sublet','Sublet',true),column('NetBusiness','Net business',true),column('AveragePerJob','Average / job',true)];
const jobColumns=[column('JobCardNo','Job card'),column('DMSJobCardNo','DMS number'),column('ReportDate','Period date'),column('CustomerName','Customer'),column('VehicleRegNo','Registration')];
const techDetails=[...jobColumns,column('DepartmentName','Business Unit'),column('TechnicianName','Technician'),column('WorkDescription','Work performed'),
    column('BayNo','Bay'),column('WorkStatus','Work status'),column('NetLabour','Net labour',true),column('RecordedHours','Recorded hours',true),column('Started','Started'),column('Ended','Finished')];
const deptDetails=[...jobColumns,column('DepartmentName','Business Unit'),column('Finalized','Status'),column('JobLines','Labour lines',true),
    column('NetLabour','Net labour',true),column('Parts','Parts',true),column('Sublet','Sublet',true),column('NetBusiness','Net business',true)];

function Filters({params,updateParam,options,technicians}){
    const [search,setSearch]=useState(params.search||'');
    useEffect(()=>{setSearch(params.search||'');},[params.search]);
    return <>
        <PeriodControls params={params} updateParam={updateParam}/>
        <label>Jobs <select aria-label="Finalized status" style={fieldStyle} value={params.finalized} onChange={e=>updateParam('finalized',e.target.value)}>
            <option value="finalized">Finalized only</option><option value="draft">Draft only (estimated)</option><option value="all">All (includes estimates)</option>
        </select></label>
        <label>Business Unit <select style={fieldStyle} value={params.departmentId||''} onChange={e=>updateParam('departmentId',e.target.value)}>
            <option value="">All</option>{options.departments.map(d=><option key={d.DepartmentID} value={d.DepartmentID}>{d.DepartmentName}</option>)}
        </select></label>
        {technicians&&<label>Technician <select style={fieldStyle} value={params.technicianId||''} onChange={e=>updateParam('technicianId',e.target.value)}>
            <option value="">All</option><option value="unassigned">Unassigned work</option>
            {options.technicians.map(t=><option key={t.EmployeeID} value={t.EmployeeID}>{t.EmployeeName}</option>)}
        </select></label>}
        <label>View <select style={fieldStyle} value={params.view} onChange={e=>updateParam('view',e.target.value)}>
            <option value="summary">Performance summary</option><option value="details">Job / work details</option>
        </select></label>
        <input aria-label="Search jobs" placeholder="Job / DMS number, customer, registration" maxLength={150} style={fieldStyle} value={search}
            onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')updateParam('search',search);}}/>
        <button type="button" className="erp-btn" onClick={()=>updateParam('search',search)}>Search jobs</button>
        {options.error&&<span role="alert" style={{color:'#b91c1c'}}>{options.error}</span>}
    </>;
}

function columnsFor(technicians,view){return view==='details'?(technicians?techDetails:deptDetails):(technicians?techSummary:deptSummary);}
function reportRows(data){return(data.rows||[]).map(r=>({...r,ReportDate:date(r.FinalizedAt||r.JobCardDate).slice(0,10),
    RecordedHours:r.TimedLines===0?null:r.RecordedHours,
    Started:date(r.JobStartTime),Ended:date(r.JobEndTime),Finalized:r.IsFinalized?'Finalized':'Draft',
    WorkStatus:r.JobEndTime?'Finished':r.JobStartTime?'In progress':r.TechnicianKey==='unassigned'?'Unassigned':'Assigned'}));}

function Performance({technicians}){
    const [options,setOptions]=useState({technicians:[],departments:[],error:''});
    useEffect(()=>{axios.get('/api/reports/service/performance-options').then(r=>setOptions({...r.data,error:''}))
        .catch(e=>setOptions({technicians:[],departments:[],error:e.response?.data?.error||e.message}));},[]);
    const endpoint=technicians?'technician-performance':'department-performance';
    return <ReportShell title={technicians?'Technician Performance':'Workshop Department Performance'} icon={technicians?UserCog:Building2}
        subtitle={technicians?'Job Controller assignments: work performed and net labour business by technician.':'Compare job card Business Units by net business, job counts and average job value.'}
        endpoint={`service/${endpoint}`} superWide
        defaultParams={{from:today().slice(0,7)+'-01',to:today(),finalized:'finalized',view:'summary',departmentId:'',technicianId:'',search:''}}
        controls={props=><Filters {...props} options={options} technicians={technicians}/>}
        excelExport={(data,params)=>{const columns=columnsFor(technicians,params.view);return{
            filename:`${endpoint}-${params.view}-${params.from}-${params.to}.csv`,headers:columns.map(c=>c.label),
            rows:reportRows(data).map(r=>columns.map(c=>r[c.key]??'')),
        };}}
    >{(data,{params})=>{
        const columns=columnsFor(technicians,params.view),rows=reportRows(data);
        const total=technicians?data.totals.netLabour:data.totals.NetBusiness;
        const name=r=>technicians?r?.TechnicianName:r?.DepartmentName;
        const amount=r=>technicians?r?.NetLabour:r?.NetBusiness;
        return <>
            <div className="card" style={{display:'flex',flexWrap:'wrap',gap:24,marginBottom:12}}>
                <div>Unique jobs: <strong>{data.totals.jobCards}</strong></div>
                <div>{technicians?'Net labour':'Net business'}: <strong>PKR {fmt(total)}</strong></div>
                <div>Highest recorded business: <strong>{name(data.highest)||'-'}</strong> {data.highest&&`(PKR ${fmt(amount(data.highest))})`}</div>
                <div>Lowest recorded business: <strong>{name(data.lowest)||'-'}</strong> {data.lowest&&`(PKR ${fmt(amount(data.lowest))})`}</div>
            </div>
            <p style={{fontSize:12,color:'#475569'}}>Dates use finalization date, falling back to job date. Business excludes sales tax and follows invoice line discounts.
                {technicians?' Only each technician’s own labour lines are credited; parts and sublet are excluded. Unassigned work remains visible. Recorded hours require valid start and finish times.'
                    :' Net business = labour + parts + sublet, after line discounts. Rankings compare revenue; job mix and job counts also matter.'}
                {params.finalized!=='finalized'&&' Draft values are estimates.'}</p>
            <div className="card" style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr>{columns.map(c=><th key={c.key} style={{padding:9,textAlign:c.numeric?'right':'left',background:'#f1f5f9'}}>{c.label}</th>)}</tr></thead>
                <tbody>{rows.map(r=><tr key={params.view==='details'?`job:${r.JobCardId}:line:${r.DetailId||0}`:r.TechnicianKey||`dept:${r.DepartmentID}`}>
                    {columns.map(c=><td key={c.key} style={{padding:9,textAlign:c.numeric?'right':'left',borderBottom:'1px solid #e2e8f0'}}>
                        {c.key==='JobCardNo'?<Link to={`/workshop/jobs/${r.JobCardId}`} target="_blank" rel="noreferrer">{r.JobCardNo}</Link>
                            :c.numeric?(r[c.key]==null?'-':['Rank','JobCards','JobLines','CompletedLines','FinalizedCards','DraftCards'].includes(c.key)?Number(r[c.key]).toLocaleString('en-PK'):fmt(r[c.key])):r[c.key]||'-'}
                    </td>)}
                </tr>)}</tbody>
            </table>{!rows.length&&<p>No matching work in this period.</p>}</div>
        </>;
    }}</ReportShell>;
}

export function TechnicianPerformance(){return <Performance technicians/>;}
export function DepartmentPerformance(){return <Performance technicians={false}/>;}
