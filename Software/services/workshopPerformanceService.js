const { sql } = require('../config/db');

const technicianNameSql = (d='d', e='e') => `COALESCE(NULLIF(LTRIM(RTRIM(${d}.PerformedByName)),''),NULLIF(LTRIM(RTRIM(${e}.EmployeeName)),''),CASE WHEN ${d}.TechnicianId>0 THEN CONCAT('Employee #',${d}.TechnicianId) ELSE 'Unassigned' END)`;
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function fail(message) { const error=new Error(message);error.status=400;throw error; }
function parseFilters(query={}) {
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const from=query.from || `${today.slice(0,7)}-01`,to=query.to || today;
    for (const date of [from,to]) {
        if (typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date<'1753-01-01'
            || Number.isNaN(new Date(date+'T00:00:00Z').getTime()) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) fail('Choose valid report dates.');
    }
    if (from>to) fail('From date must not be later than To date.');
    const finalized=query.finalized || 'finalized';
    if (!['finalized','draft','all'].includes(finalized)) fail('Invalid finalized filter.');
    const view=query.view||'summary';if(!['summary','details'].includes(view))fail('Invalid report view.');
    const id = (value,label) => {
        if (value===undefined || value===null || value==='') return null;
        if (!/^\d+$/.test(String(value)) || Number(value)<=0 || Number(value)>2147483647) fail(`Invalid ${label}.`);
        return Number(value);
    };
    const technicianId=query.technicianId==='unassigned' ? 'unassigned' : id(query.technicianId,'technician');
    const departmentId=id(query.departmentId,'business unit');
    const search=String(query.search || '').trim();if(search.length>150)fail('Search must be 150 characters or fewer.');
    return {from,to,finalized,technicianId,departmentId,search,view};
}

function scopedRequest(pool, filters) {
    const rq=pool.request().input('from',sql.DateTime,new Date(filters.from+'T00:00:00Z'))
        .input('until',sql.DateTime,new Date(new Date(filters.to+'T00:00:00Z').getTime()+86400000));
    const conds=['COALESCE(j.FinalizedAt,j.JobCardDate)>=@from','COALESCE(j.FinalizedAt,j.JobCardDate)<@until'];
    if(filters.finalized==='finalized')conds.push('j.IsFinalized=1');
    if(filters.finalized==='draft')conds.push('ISNULL(j.IsFinalized,0)=0');
    if(filters.departmentId){rq.input('dept',sql.Int,filters.departmentId);conds.push('j.JobTypeId=@dept');}
    if(filters.search){
        rq.input('search',sql.NVarChar(160),'%'+filters.search.replace(/[\[\]%_\\]/g,'\\$&')+'%');
        conds.push(`(j.JobCardNo LIKE @search ESCAPE '\\' OR j.DMSJobCardNo LIKE @search ESCAPE '\\'
            OR j.VehicleRegNo LIKE @search ESCAPE '\\' OR c.endUserName LIKE @search ESCAPE '\\')`);
    }
    return {rq,where:conds.join(' AND ')};
}

async function technicianLines(pool,filters) {
    const {rq,where}=scopedRequest(pool,filters);
    const conds=[where];
    if(filters.technicianId==='unassigned') conds.push("ISNULL(d.TechnicianId,0)=0 AND NULLIF(LTRIM(RTRIM(d.PerformedByName)),'') IS NULL");
    else if(filters.technicianId){rq.input('tech',sql.Int,filters.technicianId);conds.push('d.TechnicianId=@tech');}
    return (await rq.query(`SELECT d.DetailId,j.JobCardId,j.JobCardNo,j.DMSJobCardNo,j.VehicleRegNo,c.endUserName AS CustomerName,
        j.JobCardDate,j.FinalizedAt,j.IsFinalized,j.JobTypeId,t.Title AS DepartmentName,
        NULLIF(d.TechnicianId,0) AS TechnicianId,${technicianNameSql()} AS TechnicianName,
        d.Remarks AS WorkDescription,d.BayNo,d.JobStartTime,d.JobEndTime,
        CAST(ROUND(ISNULL(d.Price,0),2) AS DECIMAL(18,2)) AS GrossLabour,
        CAST(ROUND(ISNULL(d.DiscAmt,0),2) AS DECIMAL(18,2)) AS Discount,
        CASE WHEN d.JobStartTime IS NOT NULL AND d.JobEndTime>=d.JobStartTime
            THEN DATEDIFF_BIG(second,d.JobStartTime,d.JobEndTime)/3600.0 END AS RecordedHours
        FROM Addata_JobCardInfo j
        JOIN Addata_JobCardInfoDetail d ON d.JobCardId=j.JobCardId
        LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=d.TechnicianId
        LEFT JOIN gen_JobCardType t ON t.JobCardTypeId=j.JobTypeId
        LEFT JOIN addata_CustomerInfo c ON c.ProfileID=j.EndUserID
        WHERE ${conds.join(' AND ')} ORDER BY j.JobCardId DESC,d.DetailId`)).recordset;
}

function technicianReport(lines,filters) {
    const groups=new Map(),jobs=new Set();
    const details=lines.map(line=>{
        const r={...line,GrossLabour:Number(line.GrossLabour)||0,Discount:Number(line.Discount)||0};
        r.NetLabour=round(r.GrossLabour-r.Discount);
        r.TechnicianName=(r.TechnicianName||'Unassigned').trim();
        r.TechnicianKey=r.TechnicianId>0 ? `id:${r.TechnicianId}` : r.TechnicianName==='Unassigned' ? 'unassigned' : `name:${r.TechnicianName.toLowerCase()}`;
        r.DepartmentName=r.DepartmentName||'Unspecified business unit';
        r.RecordedHours=r.RecordedHours==null?null:Number(r.RecordedHours);
        const key=r.TechnicianKey;
        if(!groups.has(key))groups.set(key,{TechnicianKey:key,TechnicianId:r.TechnicianId,TechnicianName:r.TechnicianName,
            jobs:new Set(),JobLines:0,CompletedLines:0,GrossLabour:0,Discount:0,NetLabour:0,RecordedHours:0,TimedLines:0});
        const g=groups.get(key);g.jobs.add(r.JobCardId);jobs.add(r.JobCardId);g.JobLines++;
        if(r.JobEndTime)g.CompletedLines++;
        for(const field of ['GrossLabour','Discount','NetLabour'])g[field]+=r[field];
        if(r.RecordedHours!=null){g.RecordedHours+=r.RecordedHours;g.TimedLines++;}
        return r;
    });
    const rows=[...groups.values()].map(({jobs,...r})=>({...r,JobCards:jobs.size,
        GrossLabour:round(r.GrossLabour),Discount:round(r.Discount),NetLabour:round(r.NetLabour),RecordedHours:round(r.RecordedHours),
        AveragePerJob:jobs.size?round(r.NetLabour/jobs.size):0})).sort((a,b)=>b.NetLabour-a.NetLabour||a.TechnicianName.localeCompare(b.TechnicianName));
    rows.forEach((r,i)=>{r.Rank=i && r.NetLabour===rows[i-1].NetLabour ? rows[i-1].Rank : i+1;});
    const assigned=rows.filter(r=>r.TechnicianKey!=='unassigned');
    return {...filters,rows,details,totals:{techs:assigned.length,jobCards:jobs.size,jobLines:details.length,
        grossLabour:round(rows.reduce((s,r)=>s+r.GrossLabour,0)),discount:round(rows.reduce((s,r)=>s+r.Discount,0)),
        netLabour:round(rows.reduce((s,r)=>s+r.NetLabour,0)),unassignedNet:rows.find(r=>r.TechnicianKey==='unassigned')?.NetLabour||0,
        recordedHours:round(rows.reduce((s,r)=>s+r.RecordedHours,0))},
        highest:assigned[0]||null,lowest:assigned[assigned.length-1]||null};
}

async function departmentJobs(pool,filters) {
    const {rq,where}=scopedRequest(pool,filters);
    return (await rq.query(`SELECT j.JobCardId,j.JobCardNo,j.DMSJobCardNo,j.JobTypeId,t.Title AS DepartmentName,
        j.IsFinalized,j.VehicleRegNo,c.endUserName AS CustomerName,j.JobCardDate,j.FinalizedAt,
        ISNULL(l.GrossLabour,0)-ISNULL(l.Discount,0) AS NetLabour,ISNULL(l.Discount,0) AS Discount,
        ISNULL(p.Parts,0) AS Parts,ISNULL(s.Sublet,0) AS Sublet,ISNULL(l.JobLines,0) AS JobLines
        FROM Addata_JobCardInfo j
        LEFT JOIN gen_JobCardType t ON t.JobCardTypeId=j.JobTypeId
        LEFT JOIN addata_CustomerInfo c ON c.ProfileID=j.EndUserID
        OUTER APPLY(SELECT COUNT(*) AS JobLines,SUM(ROUND(ISNULL(d.Price,0),2)) AS GrossLabour,
            SUM(ROUND(ISNULL(d.DiscAmt,0),2)) AS Discount FROM Addata_JobCardInfoDetail d WHERE d.JobCardId=j.JobCardId) l
        OUTER APPLY(SELECT SUM(ROUND(ISNULL(d.IssueQuantity,0)*ISNULL(d.ItemRate,0),2)-ROUND(ISNULL(d.DiscAmt,0),2)) AS Parts
            FROM data_StockIssuetoJobCardDetail d JOIN data_StockIssuetoJobCard h ON h.StockIssueID=d.StockIssueID WHERE h.JobCardId=j.JobCardId) p
        OUTER APPLY(SELECT SUM(ROUND(ISNULL(d.PayableAmount,0),2)) AS Sublet FROM Addata_JobCardInfoSubletJobDetail d WHERE d.JobCardId=j.JobCardId) s
        WHERE ${where} ORDER BY j.JobCardId DESC`)).recordset;
}

function departmentReport(jobs,filters) {
    const groups=new Map();
    const details=jobs.map(job=>{
        const r={...job,DepartmentName:job.DepartmentName||'Unspecified business unit'};
        for(const f of ['NetLabour','Discount','Parts','Sublet','JobLines'])r[f]=Number(r[f])||0;
        r.NetBusiness=round(r.NetLabour+r.Parts+r.Sublet);
        const key=r.JobTypeId||0;
        if(!groups.has(key))groups.set(key,{DepartmentID:key,DepartmentName:r.DepartmentName,JobCards:0,FinalizedCards:0,DraftCards:0,JobLines:0,NetLabour:0,Discount:0,Parts:0,Sublet:0,NetBusiness:0});
        const g=groups.get(key);g.JobCards++;if(r.IsFinalized)g.FinalizedCards++;else g.DraftCards++;
        for(const f of ['JobLines','NetLabour','Discount','Parts','Sublet','NetBusiness'])g[f]+=r[f];
        return r;
    });
    const rows=[...groups.values()].map(r=>({...r,NetLabour:round(r.NetLabour),Parts:round(r.Parts),Sublet:round(r.Sublet),Discount:round(r.Discount),
        NetBusiness:round(r.NetBusiness),AveragePerJob:round(r.NetBusiness/r.JobCards)})).sort((a,b)=>b.NetBusiness-a.NetBusiness||a.DepartmentName.localeCompare(b.DepartmentName));
    rows.forEach((r,i)=>{r.Rank=i && r.NetBusiness===rows[i-1].NetBusiness ? rows[i-1].Rank : i+1;});
    const totals={departments:rows.length,jobCards:details.length};
    for(const f of ['NetLabour','Parts','Sublet','NetBusiness','Discount'])totals[f]=round(rows.reduce((s,r)=>s+r[f],0));
    return {...filters,rows,details,totals,highest:rows[0]||null,lowest:rows[rows.length-1]||null};
}

module.exports={technicianNameSql,parseFilters,technicianLines,technicianReport,departmentJobs,departmentReport};
