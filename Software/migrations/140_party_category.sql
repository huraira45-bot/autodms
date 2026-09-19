-- =============================================================================
-- 140: Party category — Individual / Corporate / Insurance / Master Motors
--
-- Owner ask 2026-09-19: classify every party, then report unpaid job cards and
-- store sales, and recovery, by that classification.
--
-- This is a NEW field, deliberately separate from PartyType. PartyType
-- (Customer / Supplier / Insurance / Both) says how a party trades with us and
-- drives the sales customer picker, supplier screens and GL setup; the category
-- says what kind of customer they are. Overloading one onto the other would
-- have broken those pickers.
--
-- Insurance parties classify themselves from the type they already carry; the
-- rest start unclassified and are sorted on the new Party Categories screen.
-- =============================================================================
SET NOCOUNT ON;

IF COL_LENGTH('dbo.gen_PartiesInfo', 'PartyCategory') IS NULL
BEGIN
    ALTER TABLE dbo.gen_PartiesInfo ADD PartyCategory NVARCHAR(20) NULL;
    PRINT 'gen_PartiesInfo.PartyCategory added.';
END
ELSE PRINT 'gen_PartiesInfo.PartyCategory already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PartiesInfo_Category')
BEGIN
    ALTER TABLE dbo.gen_PartiesInfo
        ADD CONSTRAINT CK_PartiesInfo_Category
        CHECK (PartyCategory IS NULL OR PartyCategory IN ('Individual', 'Corporate', 'Insurance', 'MasterMotors'));
    PRINT 'CK_PartiesInfo_Category added.';
END
ELSE PRINT 'CK_PartiesInfo_Category already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PartiesInfo_Category')
    CREATE INDEX IX_PartiesInfo_Category ON dbo.gen_PartiesInfo(PartyCategory) WHERE PartyCategory IS NOT NULL;
GO

-- The 71 parties already typed as Insurance need no manual sorting.
UPDATE dbo.gen_PartiesInfo
   SET PartyCategory = 'Insurance'
 WHERE PartyCategory IS NULL AND PartyType = 'Insurance';
PRINT CONCAT(@@ROWCOUNT, ' insurance parties classified automatically.');
GO

-- Reports for the admin group.
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'report:party_outstanding_by_type')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'report:party_outstanding_by_type');
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'report:recovery_by_type')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'report:recovery_by_type');
GO

PRINT '140 done — party categories ready.';
