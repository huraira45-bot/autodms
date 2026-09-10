-- 130_store_sale_care_off.sql
-- Owner ask 2026-09-10: "in store sale add the text box name care off, user
-- can enter anything".
--
-- "Care of" on a counter sale records who the invoice is being handled
-- through -- a driver collecting for a fleet owner, a workshop picking up on
-- behalf of a customer, a company rep. Deliberately free text with no
-- validation and no link to a party: the whole point is that it covers the
-- cases the structured fields do not.
--
-- Idempotent -- safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='CareOff')
BEGIN
    ALTER TABLE data_StoreSaleInfo ADD CareOff NVARCHAR(200) NULL;
    PRINT '130: added data_StoreSaleInfo.CareOff.';
END
ELSE
    PRINT '130: data_StoreSaleInfo.CareOff already exists.';

PRINT '130_store_sale_care_off complete.';
