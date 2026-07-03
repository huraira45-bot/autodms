-- 063_trial_balance_extract_perm.sql
-- Owner request 2026-07-03: new report /reports/trial-balance-extract.
-- Grants the new permission key to the admin group (GroupID=1). Idempotent.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:trial_balance_extract'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:trial_balance_extract');
    PRINT 'Granted report:trial_balance_extract to admin (GroupID=1).';
END
ELSE
    PRINT 'report:trial_balance_extract already granted to admin.';
GO

PRINT '063_trial_balance_extract_perm.sql complete.';
GO
