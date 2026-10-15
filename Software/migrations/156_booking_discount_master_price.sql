-- Customer discounts must not reduce the fallback amount due to Master.
SET XACT_ABORT ON;
IF COL_LENGTH('dbo.dms_SalesBookings','MasterPriceBeforeDiscount') IS NULL
BEGIN
    ALTER TABLE dbo.dms_SalesBookings ADD MasterPriceBeforeDiscount DECIMAL(18,2) NULL;
    PRINT '156: added pre-discount Master price snapshot.';
END;
GO
