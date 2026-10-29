-- External reference for newly created bookings. Existing records stay NULL.
SET XACT_ABORT ON;
IF COL_LENGTH('dbo.dms_SalesBookings','DMSBookingNumber') IS NULL
    ALTER TABLE dbo.dms_SalesBookings ADD DMSBookingNumber NVARCHAR(100) NULL;
PRINT '164: external DMS booking number column added; existing bookings unchanged.';
