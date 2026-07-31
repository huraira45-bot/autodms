-- 105_cash_credit_expense_perm.sql
-- Grants the new report:cash_credit_expense permission to the admin group.
-- Owner ask 2026-07-31.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:cash_credit_expense'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:cash_credit_expense');
    PRINT 'Granted report:cash_credit_expense to admin group.';
END
ELSE
    PRINT 'report:cash_credit_expense already granted to admin.';

PRINT '105_cash_credit_expense_perm complete.';
