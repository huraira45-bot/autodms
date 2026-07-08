-- =====================================================================
-- 072_under_insurance_percentage.sql  (owner ask 2026-07-08)
--
-- Add a single JC-level "under-insurance" percentage. When the vehicle
-- is insured for less than replacement value, the shortfall is passed
-- to the customer as an additional payable that rides the same
-- Depreciation Receive Payment flow.
--
-- Base for the percentage = total invoice (parts + service + sublet
-- + all taxes) − depreciation total. That is exactly the amount the
-- insurer would otherwise be paying us. The percentage of that base
-- becomes an extra customer share; the insurer's share shrinks by
-- the same amount.
--
-- Idempotent.
-- =====================================================================
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE  object_id = OBJECT_ID('dbo.dms_JobCardInsurance')
      AND  name = 'UnderInsurancePct'
)
BEGIN
    ALTER TABLE dbo.dms_JobCardInsurance
        ADD UnderInsurancePct DECIMAL(5, 2) NOT NULL CONSTRAINT DF_JCIns_UnderIns DEFAULT 0;
    PRINT '  dms_JobCardInsurance.UnderInsurancePct column added (default 0).';
END
ELSE
    PRINT '  dms_JobCardInsurance.UnderInsurancePct already exists.';

PRINT '072_under_insurance_percentage complete.';
