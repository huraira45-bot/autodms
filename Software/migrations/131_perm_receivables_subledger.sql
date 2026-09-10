-- 131_perm_receivables_subledger.sql
-- Owner ask 2026-09-10: give a manager the trial-balance extract of 102008
-- TRADE RECEIVABLES - PARTS PARTIES, and the ledger behind each party.
--
-- Grants report:receivables_subledger to admin (GroupID 1) and to PARTS
-- MANAGER, resolved BY NAME rather than by a hardcoded id so it is safe on
-- any database where the group ids differ.
--
-- This permission is narrow on purpose: the report only ever reads the three
-- trade-receivable groups (102007 workshop / 102008 parts / 102009 vehicle),
-- enforced server-side in receivablesSubLedgerController. It is NOT the same
-- as report:trial_balance_extract or report:gl_detail, either of which would
-- expose the whole ledger -- cash, payroll and equity included.
--
-- Any other role can be ticked on from Role Permissions.
-- Idempotent -- safe to re-run.
SET NOCOUNT ON;

DECLARE @key NVARCHAR(100) = 'report:receivables_subledger';

-- Admin
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = @key)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, @key);
    PRINT '131: granted to admin.';
END
ELSE
    PRINT '131: admin already has it.';

-- Parts Manager, if such a group exists on this database
DECLARE @pm INT = (SELECT TOP 1 GroupID FROM GLUserGroup
                   WHERE LTRIM(RTRIM(GroupTitle)) = 'PARTS MANAGER');

IF @pm IS NULL
    PRINT '131: no PARTS MANAGER group found - tick it on in Role Permissions instead.';
ELSE IF EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = @pm AND PermissionKey = @key)
    PRINT '131: PARTS MANAGER already has it.';
ELSE
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (@pm, @key);
    PRINT '131: granted to PARTS MANAGER.';
END

PRINT '131_perm_receivables_subledger complete.';
