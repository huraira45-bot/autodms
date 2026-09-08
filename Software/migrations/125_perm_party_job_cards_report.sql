-- 125_perm_party_job_cards_report.sql
-- Grants report:party_job_cards to the admin group (owner ask 2026-09-08:
-- pick a party, see every Job Card ever raised for them and whether it's
-- been paid). The key is registered in config/permissions.js; this is the
-- grant so it actually shows up. Same pattern as 082_perms_party_reports.
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:party_job_cards'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:party_job_cards');
    PRINT 'Granted report:party_job_cards to admin.';
END
ELSE
    PRINT 'report:party_job_cards already granted.';

PRINT '125_perm_party_job_cards_report complete.';
