const { sql, getPool } = require('../config/db');
const service = require('../services/salesExecutiveService');

// Booking pickers only receive enabled and HR-active employees; no HR access needed.
exports.options = async (_req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT e.EmployeeID,e.EmployeeName,e.EmployeeNo
            FROM dbo.dms_SalesExecutives s JOIN dbo.gen_EmployeeInfo e ON e.EmployeeID=s.EmployeeID
            WHERE s.IsEnabled=1 AND ${service.activeEmployeeSql}
            ORDER BY e.EmployeeName,e.EmployeeID`);
        res.json(result.recordset);
    } catch (error) { service.sendError(res, error); }
};

// Admin sees all existing roster members and active employees available to add.
exports.setup = async (_req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT e.EmployeeID,e.EmployeeName,e.EmployeeNo,d.DepartmentName,des.DesignationName,
                CASE WHEN ${service.activeEmployeeSql} THEN 1 ELSE 0 END AS IsAvailable,
                s.IsEnabled,s.UpdatedAt,s.UpdatedByName
            FROM dbo.gen_EmployeeInfo e
            LEFT JOIN dbo.dms_SalesExecutives s ON s.EmployeeID=e.EmployeeID
            LEFT JOIN dbo.gen_DepartmentInfo d ON d.DepartmentID=e.DepartmentID
            LEFT JOIN dbo.gen_DesignationInfo des ON des.DesignationID=e.DesignationID
            WHERE s.EmployeeID IS NOT NULL OR (${service.activeEmployeeSql})
            ORDER BY e.EmployeeName,e.EmployeeID`);
        res.json(result.recordset);
    } catch (error) { service.sendError(res, error); }
};

exports.save = async (req, res) => {
    let tx;
    try {
        const pool = await getPool();
        tx = new sql.Transaction(pool);
        await tx.begin();
        const result = await service.setEnabled(tx, req.params.id, req.body?.IsEnabled, req.user);
        await tx.commit();
        res.json(result);
    } catch (error) {
        if (tx) { try { await tx.rollback(); } catch {} }
        service.sendError(res, error);
    }
};
