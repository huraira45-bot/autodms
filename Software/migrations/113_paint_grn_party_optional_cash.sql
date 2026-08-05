-- 113_paint_grn_party_optional_cash.sql
-- Owner ask 2026-08-07: Cash Paint GRNs shouldn't require picking a formal
-- Supplier party -- a quick cash buy may be from someone not on file at
-- all. Credit GRNs still require a party (it's who the payable is owed
-- to). PartyID must become nullable to allow that; the FK to
-- gen_PartiesInfo still applies whenever a value IS set.
SET NOCOUNT ON;

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'paint_GRN' AND COLUMN_NAME = 'PartyID' AND IS_NULLABLE = 'NO'
)
BEGIN
    ALTER TABLE paint_GRN ALTER COLUMN PartyID INT NULL;
    PRINT 'paint_GRN.PartyID is now nullable.';
END
ELSE
    PRINT 'paint_GRN.PartyID already nullable.';

PRINT '113_paint_grn_party_optional_cash complete.';
