-- Separate data-only historical records. Existing bookings remain unchanged.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.dms_SalesBookings','IsExtremeHistorical') IS NULL
 ALTER TABLE dbo.dms_SalesBookings ADD IsExtremeHistorical BIT NOT NULL CONSTRAINT DF_SalesBookings_ExtremeHistorical DEFAULT(0) WITH VALUES;
IF COL_LENGTH('dbo.dms_SalesBookings','HistoricalVoucherReference') IS NULL
 ALTER TABLE dbo.dms_SalesBookings ADD HistoricalVoucherReference NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.dms_SalesBookings','HistoricalEntryNotes') IS NULL
 ALTER TABLE dbo.dms_SalesBookings ADD HistoricalEntryNotes NVARCHAR(2000) NULL;
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_SalesBookings_ExtremeHistorical')
 EXEC('ALTER TABLE dbo.dms_SalesBookings ADD CONSTRAINT CK_SalesBookings_ExtremeHistorical CHECK(IsExtremeHistorical=0 OR IsHistorical=1)');
COMMIT TRANSACTION;
