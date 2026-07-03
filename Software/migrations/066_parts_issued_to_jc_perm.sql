-- 066_parts_issued_to_jc_perm.sql
-- Owner ask 2026-07-03: new report /reports/parts/issued-to-jc that lists
-- which parts were issued to which Job Cards. Grants view permission to
-- the admin group (GroupID=1). Idempotent.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:parts_issued_to_jc'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:parts_issued_to_jc');
    PRINT 'Granted report:parts_issued_to_jc to admin (GroupID=1).';
END
ELSE
    PRINT 'report:parts_issued_to_jc already granted to admin.';
GO

PRINT '066_parts_issued_to_jc_perm.sql complete.';
GO
