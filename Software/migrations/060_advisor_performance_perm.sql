-- 060_advisor_performance_perm.sql
-- Owner request 2026-07-01: new report /reports/service/advisor-performance
-- Grants the new permission key to the admin group (GroupID=1). Idempotent.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:advisor_performance'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:advisor_performance');
    PRINT 'Granted report:advisor_performance to admin (GroupID=1).';
END
ELSE
    PRINT 'report:advisor_performance already granted to admin.';
GO

PRINT '060_advisor_performance_perm.sql complete.';
GO
