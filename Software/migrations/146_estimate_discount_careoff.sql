-- 146_estimate_discount_careoff.sql
-- Discounts on a service estimate, and who authorised them.
--
-- Owner ask 2026-09-26: the advisor at the vehicle must be able to give the
-- customer a discount, with a care-off standing behind it, the same way the
-- desk job card works.
--
-- The discount has to live on the ESTIMATE, not be added to the job card
-- afterwards: the customer signs a total, and a total that changes after the
-- signature is not the one they agreed to. The signature already stores a hash
-- of the lines, so a discount added after signing would invalidate it -- which
-- is the behaviour we want, not a problem to work around.
--
-- dms_ServiceEstimateLines.DiscAmt already exists (migration 135) and lineTax()
-- has always taxed the line AFTER discount, so nothing about the money maths
-- changes here. Only the authoriser is new.
--
-- CareOffID mirrors Addata_JobCardInfo.CareOffID exactly so the sign step can
-- hand it straight over. No foreign key, for the same reason the job card has
-- none: a care-off employee who leaves must not make an old estimate
-- unreadable. CareOffName is the snapshot of who it was at the time.
--
-- The cap itself is NOT stored. It is a percentage of total labour held on
-- dms_CareOff.MaxDiscountPct, and it is checked when the estimate is saved --
-- storing a copy would let the two drift apart silently.
--
-- Idempotent -- safe to re-run.
SET NOCOUNT ON;

IF COL_LENGTH('dms_ServiceEstimates', 'CareOffID') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD CareOffID INT NULL;
    PRINT '146: added dms_ServiceEstimates.CareOffID.';
END
GO

IF COL_LENGTH('dms_ServiceEstimates', 'CareOffName') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD CareOffName NVARCHAR(200) NULL;
    PRINT '146: added dms_ServiceEstimates.CareOffName.';
END
GO

-- Totals are stored net of discount, so the discount given is worth keeping
-- in its own right: without it the estimate cannot show what was taken off,
-- only the figure that was left.
IF COL_LENGTH('dms_ServiceEstimates', 'LabourDiscount') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD LabourDiscount DECIMAL(18,2) NOT NULL
        CONSTRAINT DF_ServiceEstimates_LabourDisc DEFAULT 0;
    PRINT '146: added dms_ServiceEstimates.LabourDiscount.';
END
GO

IF COL_LENGTH('dms_ServiceEstimates', 'PartsDiscount') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD PartsDiscount DECIMAL(18,2) NOT NULL
        CONSTRAINT DF_ServiceEstimates_PartsDisc DEFAULT 0;
    PRINT '146: added dms_ServiceEstimates.PartsDiscount.';
END
GO

-- A discount can be zero but never negative, which would be a surcharge
-- wearing a discount's name.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceEstimateLines_Disc')
BEGIN
    ALTER TABLE dms_ServiceEstimateLines WITH CHECK ADD CONSTRAINT CK_ServiceEstimateLines_Disc
        CHECK (DiscAmt >= 0);
    PRINT '146: added CK_ServiceEstimateLines_Disc.';
END
GO

PRINT '146_estimate_discount_careoff complete.';
