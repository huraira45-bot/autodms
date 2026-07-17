-- 082_perms_party_reports.sql
-- Grant the two new report permissions to the admin group so the reports
-- show up immediately on live. Owner ask 2026-07-17.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:party_open_invoices'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:party_open_invoices');
    PRINT 'Granted report:party_open_invoices to admin.';
END
ELSE
    PRINT 'report:party_open_invoices already granted.';

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:payments_to_parties'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:payments_to_parties');
    PRINT 'Granted report:payments_to_parties to admin.';
END
ELSE
    PRINT 'report:payments_to_parties already granted.';

PRINT '082_perms_party_reports complete.';
