-- 084_perm_item_ledger.sql
-- Grant the new Item Ledger report permission to the admin group so the
-- report shows up immediately on live. Owner ask 2026-07-17.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:item_ledger'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:item_ledger');
    PRINT 'Granted report:item_ledger to admin.';
END
ELSE
    PRINT 'report:item_ledger already granted.';

PRINT '084_perm_item_ledger complete.';
