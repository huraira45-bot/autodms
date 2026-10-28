-- Explicit Admin-only booking date right, controlled in Admin Rights.
-- Run once through run-pending-migrations.js so revocations stay revoked.
SET NOCOUNT ON;
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID=1 AND PermissionKey='sales_booking_date')
    INSERT INTO dms_ModulePermissions(GroupID,PermissionKey) VALUES(1,'sales_booking_date');
