-- 119_sales_reports_cro_reports_perm.sql
-- Grants sales_reports and cro_reports to the admin group. Both keys are
-- already registered in config/modules.js and already checked correctly by
-- the sidebar (App.jsx) and by navigationConfig.js (as of this same
-- change), but were never actually granted to any group -- so even admin
-- couldn't see the Sales Reports / CRO Reports screens.
-- Owner report 2026-08-07: Vehicle Sales hub showed almost nothing for
-- admin -- most of that turned out to be a navigationConfig.js key
-- mismatch (fixed alongside this migration, no DB change needed for that
-- part); these two were a genuine missing grant.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'sales_reports'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'sales_reports');
    PRINT 'Granted sales_reports to admin group.';
END
ELSE
    PRINT 'sales_reports already granted to admin.';

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'cro_reports'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'cro_reports');
    PRINT 'Granted cro_reports to admin group.';
END
ELSE
    PRINT 'cro_reports already granted to admin.';

PRINT '119_sales_reports_cro_reports_perm complete.';
