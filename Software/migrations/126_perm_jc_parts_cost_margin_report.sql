-- 126_perm_jc_parts_cost_margin_report.sql
-- Grants report:jc_parts_cost_margin to the admin group (owner ask
-- 2026-09-08: part cost job-card-wise, per business unit, each item with
-- its purchase price and sale price). The key is registered in
-- config/permissions.js; this is the grant so it actually appears.
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:jc_parts_cost_margin'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:jc_parts_cost_margin');
    PRINT 'Granted report:jc_parts_cost_margin to admin.';
END
ELSE
    PRINT 'report:jc_parts_cost_margin already granted.';

PRINT '126_perm_jc_parts_cost_margin_report complete.';
