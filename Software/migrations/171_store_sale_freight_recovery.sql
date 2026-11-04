-- Preserve every installed accounting role while permitting a configurable freight recovery account.
-- No account is selected automatically and no voucher is changed by this migration.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @freightRoleCheck NVARCHAR(MAX) = (
    SELECT definition FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID('dbo.dms_SystemAccounts') AND name='CK_SystemAccounts_RoleKey'
);
IF @freightRoleCheck IS NULL
    THROW 51171, 'System account role constraint is missing; investigate before installing freight recovery.', 1;
IF CHARINDEX('STORE_SALE_FREIGHT_RECOVERY', @freightRoleCheck)=0
BEGIN
    ALTER TABLE dbo.dms_SystemAccounts DROP CONSTRAINT CK_SystemAccounts_RoleKey;
    EXEC(N'ALTER TABLE dbo.dms_SystemAccounts WITH CHECK ADD CONSTRAINT CK_SystemAccounts_RoleKey CHECK ('
        + @freightRoleCheck + N' OR RoleKey=''STORE_SALE_FREIGHT_RECOVERY'')');
END;
COMMIT TRANSACTION;
