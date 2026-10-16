-- Scheduling metadata only; does not change prices, payments or GL entries.
SET XACT_ABORT ON;
IF COL_LENGTH('dbo.dms_SalesBookings','PromisedDeliveryMonth') IS NULL
    ALTER TABLE dbo.dms_SalesBookings ADD PromisedDeliveryMonth DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SalesBookings_DeliveryMonth')
    ALTER TABLE dbo.dms_SalesBookings ADD CONSTRAINT CK_SalesBookings_DeliveryMonth
        CHECK (PromisedDeliveryMonth IS NULL OR DAY(PromisedDeliveryMonth)=1);
PRINT '159: optional promised delivery month added to bookings.';
GO
