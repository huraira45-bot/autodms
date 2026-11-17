-- Plain names on extreme bookings, without creating/linking a party.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.dms_SalesBookings','HistoricalCustomerName') IS NULL
 ALTER TABLE dbo.dms_SalesBookings ADD HistoricalCustomerName NVARCHAR(200) NULL;
ALTER TABLE dbo.dms_SalesBookings ALTER COLUMN PartyID INT NULL;
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_SalesBookings_CustomerIdentity')
 EXEC('ALTER TABLE dbo.dms_SalesBookings ADD CONSTRAINT CK_SalesBookings_CustomerIdentity CHECK(PartyID IS NOT NULL OR (IsExtremeHistorical=1 AND NULLIF(LTRIM(RTRIM(HistoricalCustomerName)),N'''') IS NOT NULL))');
COMMIT TRANSACTION;
