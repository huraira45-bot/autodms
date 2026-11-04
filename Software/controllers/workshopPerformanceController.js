const {getPool}=require('../config/db');
const service=require('../services/workshopPerformanceService');
exports.technicians=async(req,res)=>{
    try{const filters=service.parseFilters(req.query),pool=await getPool();
        const {details,...report}=service.technicianReport(await service.technicianLines(pool,filters),filters);
        res.json({...report,rows:filters.view==='details'?details:report.rows});}
    catch(error){res.status(error.status||500).json({error:error.message});}
};
exports.departments=async(req,res)=>{
    try{const filters=service.parseFilters(req.query),pool=await getPool();
        const {details,...report}=service.departmentReport(await service.departmentJobs(pool,filters),filters);
        res.json({...report,rows:filters.view==='details'?details:report.rows});}
    catch(error){res.status(error.status||500).json({error:error.message});}
};
exports.options=async(_req,res)=>{
    try{
        const pool=await getPool(),r=await pool.request().query(`
            SELECT DISTINCT e.EmployeeID,e.EmployeeName FROM gen_EmployeeInfo e
            JOIN Addata_JobCardInfoDetail d ON d.TechnicianId=e.EmployeeID ORDER BY e.EmployeeName;
            SELECT JobCardTypeId AS DepartmentID,Title AS DepartmentName FROM gen_JobCardType ORDER BY Title;`);
        res.json({technicians:r.recordsets[0],departments:r.recordsets[1]});
    }catch(error){res.status(500).json({error:error.message});}
};
