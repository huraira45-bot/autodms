-- Explicit historical Master confirmation; voucher matching is optional.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.dms_SalesBookings','HistoricalMasterApprovedAmount') IS NULL
BEGIN
    ALTER TABLE dbo.dms_SalesBookings ADD
        HistoricalMasterApprovedAmount DECIMAL(18,2) NULL,
        HistoricalMasterApprovedAt DATETIME NULL,
        HistoricalMasterApprovedByUserID INT NULL,
        HistoricalMasterApprovedByName NVARCHAR(100) NULL,
        HistoricalMasterApprovalNotes NVARCHAR(1000) NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SalesBookings_HistoricalMasterApproval')
    ALTER TABLE dbo.dms_SalesBookings ADD CONSTRAINT CK_SalesBookings_HistoricalMasterApproval
        CHECK (HistoricalMasterApprovedAmount IS NULL OR (IsHistorical=1 AND HistoricalMasterApprovedAmount>0));
COMMIT TRANSACTION;
PRINT '155: historical Master payment can be approved without voucher matching.';
GO
