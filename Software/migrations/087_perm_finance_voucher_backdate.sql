-- 087_perm_finance_voucher_backdate.sql
-- Owner ask 2026-07-18: grant admin the new `finance_voucher_backdate`
-- workflow permission so the "Edit posted CPV/CRV/BPV/BRV within 5 days"
-- affordance shows up on live immediately. Idempotent.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'finance_voucher_backdate'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'finance_voucher_backdate');
    PRINT 'Granted finance_voucher_backdate to admin.';
END
ELSE
    PRINT 'finance_voucher_backdate already granted.';

PRINT '087_perm_finance_voucher_backdate complete.';
