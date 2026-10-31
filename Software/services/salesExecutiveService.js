const { sql } = require('../config/db');

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    error.statusCode = status;
    throw error;
}

function employeeId(value) {
    if (!['number', 'string'].includes(typeof value)) fail('Choose a valid sales executive.');
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) fail('Choose a valid sales executive.');
    return id;
}

function canManage(user) {
    return Number(user?.groupId) === 1 || user?.modules?.includes('sales_admin_settings')
        || user?.permissions?.includes('sales_admin_settings');
}

function requireManager(req, res, next) {
    if (canManage(req.user)) return next();
    return res.status(403).json({ error: 'Sales settings permission is required to set up sales executives.' });
}

// HR active status is independent of inclusion in this roster.
const activeEmployeeSql = 'e.IsActive=1 AND e.ResignDate IS NULL';

async function requireExecutive(tx, value) {
    const id = employeeId(value);
    const row = (await new sql.Request(tx).input('executive', sql.Int, id).query(`
        SELECT e.EmployeeID, e.EmployeeName
        FROM dbo.dms_SalesExecutives s WITH (HOLDLOCK)
        JOIN dbo.gen_EmployeeInfo e WITH (HOLDLOCK) ON e.EmployeeID=s.EmployeeID
        WHERE s.EmployeeID=@executive AND s.IsEnabled=1 AND ${activeEmployeeSql}`)).recordset[0];
    if (!row) fail('This employee is not an enabled Sales Executive. Choose someone from Vehicle Sales > Sales Executives.');
    return row;
}

async function setEnabled(tx, value, enabled, user) {
    if (!canManage(user)) fail('Sales settings permission is required.', 403);
    const id = employeeId(value);
    if (typeof enabled !== 'boolean') fail('IsEnabled must be true or false.');
    const existing = (await new sql.Request(tx).input('id', sql.Int, id).query(`
        SELECT IsEnabled FROM dbo.dms_SalesExecutives WITH (UPDLOCK,HOLDLOCK) WHERE EmployeeID=@id`)).recordset[0];
    const employee = (await new sql.Request(tx).input('id', sql.Int, id).query(`
        SELECT e.EmployeeID, e.EmployeeName, CASE WHEN ${activeEmployeeSql} THEN 1 ELSE 0 END AS IsAvailable
        FROM dbo.gen_EmployeeInfo e WITH (HOLDLOCK) WHERE e.EmployeeID=@id`)).recordset[0];
    if (!employee) fail('Employee not found.', 404);
    if (enabled && !employee.IsAvailable) fail('Only active employees who have not resigned can be enabled.');
    if (existing && Boolean(existing.IsEnabled) === enabled) return { message: 'No change.', EmployeeID: id, IsEnabled: enabled };
    await new sql.Request(tx).input('id', sql.Int, id).input('enabled', sql.Bit, enabled)
        .input('uid', sql.Int, user?.userId || null).input('name', sql.NVarChar(100), user?.userName || null)
        .query(existing ? `UPDATE dbo.dms_SalesExecutives SET IsEnabled=@enabled,UpdatedAt=SYSUTCDATETIME(),
            UpdatedByUserID=@uid,UpdatedByName=@name WHERE EmployeeID=@id`
            : `INSERT dbo.dms_SalesExecutives(EmployeeID,IsEnabled,UpdatedByUserID,UpdatedByName) VALUES(@id,@enabled,@uid,@name)`);
    await new sql.Request(tx).input('id', sql.Int, id).input('old', sql.Bit, existing ? existing.IsEnabled : null)
        .input('enabled', sql.Bit, enabled).input('uid', sql.Int, user?.userId || null)
        .input('name', sql.NVarChar(100), user?.userName || null).query(`
            INSERT dbo.dms_SalesExecutiveChanges(EmployeeID,PreviousEnabled,IsEnabled,ActorUserID,ActorName)
            VALUES(@id,@old,@enabled,@uid,@name)`);
    return { message: enabled ? 'Sales executive enabled.' : 'Sales executive disabled.', EmployeeID: id, IsEnabled: enabled };
}

function sendError(res, error, fallbackStatus = 500) {
    const missingSetup = error.number === 208 && /dms_SalesExecutive/i.test(error.message);
    return res.status(missingSetup ? 503 : error.status || error.statusCode || fallbackStatus).json({
        error: missingSetup ? 'Sales Executive setup needs migration 168_sales_executives.sql. Ask your administrator to apply it.' : error.message,
    });
}

module.exports = { employeeId, canManage, requireManager, activeEmployeeSql, requireExecutive, setEnabled, sendError };
