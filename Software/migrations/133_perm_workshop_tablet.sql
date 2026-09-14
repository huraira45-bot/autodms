-- 133_perm_workshop_tablet.sql
-- Service tablet app, Phase 0 (owner plan 2026-09-14).
--
-- Grants workshop_tablet — access to the /tablet screens and the diagnostics
-- upload — to admin. Service advisors are ticked on from Role Permissions:
-- which groups count as advisors is the owner's call, not a guess made here.
--
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions
               WHERE GroupID = 1 AND PermissionKey = 'workshop_tablet')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'workshop_tablet');
    PRINT '133: granted workshop_tablet to admin.';
END
ELSE
    PRINT '133: admin already has workshop_tablet.';

PRINT '133_perm_workshop_tablet complete.';
