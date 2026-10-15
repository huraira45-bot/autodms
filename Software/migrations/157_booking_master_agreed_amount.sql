-- An explicitly accepted Master settlement is local to this booking; no GL posting.
SET XACT_ABORT ON;
IF COL_LENGTH('dbo.dms_SalesBookings','MasterAgreedAmount') IS NULL
BEGIN
    ALTER TABLE dbo.dms_SalesBookings ADD
        MasterAgreedAmount DECIMAL(18,2) NULL,
        MasterAgreedAt DATETIME NULL,
        MasterAgreedByUserID INT NULL,
        MasterAgreedByName NVARCHAR(100) NULL,
        MasterAgreedReason NVARCHAR(500) NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SalesBookings_MasterAgreedAmount')
    ALTER TABLE dbo.dms_SalesBookings ADD CONSTRAINT CK_SalesBookings_MasterAgreedAmount
        CHECK (MasterAgreedAmount IS NULL OR MasterAgreedAmount>0);
PRINT '157: booking-specific Master agreed amount added.';
GO
