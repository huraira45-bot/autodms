-- 035_party_glid_unique.sql
-- One party per GL leaf. Prevents two parties from claiming the same A/R or
-- A/P sub-account, which previously caused loadPartyForReceivableGL to pick
-- silently by lowest PartyID.
--
-- Filtered unique index (NULLs are allowed because not every party row has
-- PartyGLID set yet during data entry).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'UX_gen_PartiesInfo_PartyGLID'
      AND object_id = OBJECT_ID('gen_PartiesInfo')
)
BEGIN
    CREATE UNIQUE INDEX UX_gen_PartiesInfo_PartyGLID
        ON gen_PartiesInfo (PartyGLID)
        WHERE PartyGLID IS NOT NULL;
END
GO

PRINT 'Migration 035 complete.';
