-- =============================================================================
-- 141: "Party Categories" as a permission of its own
--
-- Owner ask 2026-09-19: let a member of staff classify parties without giving
-- them Credit Parties > Edit, which also allows changing names, CNICs and
-- credit limits.
--
-- crm_party_category grants exactly one thing: open the Party Categories
-- screen and set a party's category. Anyone who already has crm_parties:edit
-- keeps that ability, so nothing needs re-granting.
-- =============================================================================
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'crm_party_category')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'crm_party_category');
    PRINT 'crm_party_category granted to the admin group.';
END
ELSE PRINT 'admin group already has crm_party_category — skipped.';
GO

PRINT '141 done — Party Categories can be granted on its own.';
