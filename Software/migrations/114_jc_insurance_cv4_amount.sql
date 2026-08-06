-- =====================================================================
-- 114_jc_insurance_cv4_amount.sql  (owner ask 2026-08-07)
--
-- CV4: a flat, manually-entered amount on the JC Insurance tab (unlike
-- Under-Insurance, which is a % of a computed base). It rides the exact
-- same "customer share" pool as depreciation and under-insurance —
-- added into customerShareTotal, split to the General Customer A/R leg
-- at finalize (jobCardJournalBuilder.js), and collected via the same
-- Receive Payment > "JC Insurance Depreciation" flow, which reduces the
-- outstanding balance as payments come in.
--
-- Idempotent.
-- =====================================================================
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE  object_id = OBJECT_ID('dbo.dms_JobCardInsurance')
      AND  name = 'CV4Amount'
)
BEGIN
    ALTER TABLE dbo.dms_JobCardInsurance
        ADD CV4Amount DECIMAL(18, 2) NOT NULL CONSTRAINT DF_JCIns_CV4 DEFAULT 0;
    PRINT '  dms_JobCardInsurance.CV4Amount column added (default 0).';
END
ELSE
    PRINT '  dms_JobCardInsurance.CV4Amount already exists.';

PRINT '114_jc_insurance_cv4_amount complete.';
