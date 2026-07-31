-- 104_pnl_department_perm.sql
-- Grants the new report:pnl_department permission to the admin group so
-- the "P&L by Department" report is visible immediately on live.
-- Owner ask 2026-07-31.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:pnl_department'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:pnl_department');
    PRINT 'Granted report:pnl_department to admin group.';
END
ELSE
    PRINT 'report:pnl_department already granted to admin.';

PRINT '104_pnl_department_perm complete.';
