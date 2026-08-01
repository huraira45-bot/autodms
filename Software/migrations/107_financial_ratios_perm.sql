-- 107_financial_ratios_perm.sql
-- Grants the new report:financial_ratios permission to the admin group.
-- Owner ask 2026-08-01.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:financial_ratios'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:financial_ratios');
    PRINT 'Granted report:financial_ratios to admin group.';
END
ELSE
    PRINT 'report:financial_ratios already granted to admin.';

PRINT '107_financial_ratios_perm complete.';
