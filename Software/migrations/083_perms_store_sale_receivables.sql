-- 083_perms_store_sale_receivables.sql
-- Owner clarification 2026-07-17: the "Payments to Parties" report from
-- migration 082 was misaimed — owner wants a receivable view (money owed
-- FROM parties on Store Sales), not a payables view. The permission key
-- has been renamed to report:store_sale_receivables. This migration
-- migrates the admin grant to the new key.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:store_sale_receivables'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:store_sale_receivables');
    PRINT 'Granted report:store_sale_receivables to admin.';
END
ELSE
    PRINT 'report:store_sale_receivables already granted.';

-- Drop the stale key from every group that had it.
DECLARE @removed INT = 0;
DELETE FROM dms_ModulePermissions WHERE PermissionKey = 'report:payments_to_parties';
SET @removed = @@ROWCOUNT;
PRINT CONCAT('Removed report:payments_to_parties from ', @removed, ' group(s).');

PRINT '083_perms_store_sale_receivables complete.';
