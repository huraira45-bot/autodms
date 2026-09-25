-- 144_estimate_payment_and_fuel.sql
-- Service tablet: how the customer will pay, and the fuel in the tank.
--
-- Owner report 2026-09-25:
--   * the tablet had no payment mode at all. Every job card it opened was
--     written as Cash (serviceIntakeController hard-coded PaymentType:'Cash'),
--     so a credit customer's job card went to the wrong ledger at finalize.
--     The desk form has offered Cash / Credit / POS / Bank Transfer all along.
--   * the walk-around at the vehicle is where fuel level is seen, and the job
--     card has carried a FuelLevel column all along -- the tablet simply had
--     nowhere to put it, so it was left at whatever the job card defaulted to.
--
-- These live on the ESTIMATE, not only on the job card, because they are
-- settled at the vehicle while the advisor is still building the estimate;
-- the sign step then hands them to the job card with everything else.
--
-- PartyID / PaymentCO / PaymentBankID mirror Addata_JobCardInfo exactly, so
-- the sign step can pass them straight through without translating anything.
-- No foreign keys, for the same reason the job card has none on these: a party
-- or bank account retired later must not make an old estimate unreadable.
--
-- Idempotent -- safe to re-run.
SET NOCOUNT ON;

IF COL_LENGTH('dms_ServiceEstimates', 'FuelLevel') IS NULL
BEGIN
    -- 'Empty', '1/8' ... 'Full' -- the same words the desk form offers, kept
    -- as text rather than a number so the two screens cannot drift apart.
    ALTER TABLE dms_ServiceEstimates ADD FuelLevel NVARCHAR(20) NULL;
    PRINT '144: added dms_ServiceEstimates.FuelLevel.';
END
GO

IF COL_LENGTH('dms_ServiceEstimates', 'PaymentType') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD PaymentType NVARCHAR(30) NULL;
    PRINT '144: added dms_ServiceEstimates.PaymentType.';
END
GO

IF COL_LENGTH('dms_ServiceEstimates', 'PartyID') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD PartyID INT NULL;
    PRINT '144: added dms_ServiceEstimates.PartyID.';
END
GO

IF COL_LENGTH('dms_ServiceEstimates', 'PaymentCO') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD PaymentCO NVARCHAR(150) NULL;
    PRINT '144: added dms_ServiceEstimates.PaymentCO.';
END
GO

IF COL_LENGTH('dms_ServiceEstimates', 'PaymentBankID') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD PaymentBankID INT NULL;
    PRINT '144: added dms_ServiceEstimates.PaymentBankID.';
END
GO

-- Only the four the desk form offers. An estimate drafted before this
-- migration has NULL, which the sign step reads as Cash -- exactly what it
-- was already doing.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ServiceEstimates_PaymentType')
BEGIN
    ALTER TABLE dms_ServiceEstimates WITH CHECK ADD CONSTRAINT CK_ServiceEstimates_PaymentType
        CHECK (PaymentType IS NULL OR PaymentType IN ('Cash', 'Credit', 'POS', 'Bank Transfer'));
    PRINT '144: added CK_ServiceEstimates_PaymentType.';
END
GO

PRINT '144_estimate_payment_and_fuel complete.';
