-- 148_estimate_parts_request_text.sql
-- Parts written in words, the way the complaint already is.
--
-- Owner ask 2026-10-01: an advisor standing at a car knows "front bumper, LH
-- headlight, the clips" but not the catalogue numbers, and hunting for them
-- holds up the customer. So the advisor writes what is needed in free text
-- and the parts counter turns it into real items.
--
-- Owner's two decisions, 2026-10-02:
--   * The advisor also types an ESTIMATED parts figure, so the customer still
--     signs a complete total rather than one with the parts missing.
--   * The parts counter resolves the words into actual parts on the
--     requisition screen they already work on.
--
-- Why the text is carried onto the REQUISITION and not just read off the
-- estimate: a requisition can be raised from a later revision, and the
-- counter needs the words that were signed for, not whatever the estimate
-- says by the time they look at it.
--
-- The estimated amount is deliberately NOT turned into job-card parts. Parts
-- reach the job card only when they are actually issued, which is what makes
-- the stock and the cost of sale true.
--
-- Idempotent -- safe to re-run.
SET NOCOUNT ON;

IF COL_LENGTH('dms_ServiceEstimates', 'PartsRequestText') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD PartsRequestText NVARCHAR(MAX) NULL;
    PRINT '148: added dms_ServiceEstimates.PartsRequestText.';
END
GO

IF COL_LENGTH('dms_ServiceEstimates', 'PartsEstimateAmount') IS NULL
BEGIN
    -- What the advisor reckons the written parts will come to, before GST.
    -- Taxed the same way catalogue parts are, so the signed total is arrived
    -- at the same way whichever route was used.
    ALTER TABLE dms_ServiceEstimates ADD PartsEstimateAmount DECIMAL(18,2) NOT NULL
        CONSTRAINT DF_ServiceEstimates_PartsEstAmt DEFAULT 0;
    PRINT '148: added dms_ServiceEstimates.PartsEstimateAmount.';
END
GO

-- An estimate is a guess, never a negative one.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceEstimates_PartsEstAmt')
BEGIN
    ALTER TABLE dms_ServiceEstimates WITH CHECK ADD CONSTRAINT CK_ServiceEstimates_PartsEstAmt
        CHECK (PartsEstimateAmount >= 0);
    PRINT '148: added CK_ServiceEstimates_PartsEstAmt.';
END
GO

IF COL_LENGTH('dms_PartsRequisitions', 'RequestText') IS NULL
BEGIN
    ALTER TABLE dms_PartsRequisitions ADD RequestText NVARCHAR(MAX) NULL;
    PRINT '148: added dms_PartsRequisitions.RequestText.';
END
GO

IF COL_LENGTH('dms_PartsRequisitions', 'EstimatedAmount') IS NULL
BEGIN
    -- Shown to the counter as context only: what the customer was told the
    -- parts would come to. It never prices anything.
    ALTER TABLE dms_PartsRequisitions ADD EstimatedAmount DECIMAL(18,2) NULL;
    PRINT '148: added dms_PartsRequisitions.EstimatedAmount.';
END
GO

PRINT '148_estimate_parts_request_text complete.';
