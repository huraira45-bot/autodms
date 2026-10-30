-- Preserve the complete payroll used for posting, independently of employee master changes.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.hr_SalarySheetSnapshots','U') IS NULL
BEGIN
    CREATE TABLE dbo.hr_SalarySheetSnapshots (
        MonthID CHAR(7) NOT NULL CONSTRAINT PK_hr_SalarySheetSnapshots PRIMARY KEY,
        SnapshotVersion INT NOT NULL CONSTRAINT DF_hr_SalarySnapshotVersion DEFAULT 1,
        SheetJSON NVARCHAR(MAX) NOT NULL,
        SnapshotBasis NVARCHAR(24) NOT NULL,
        FirstVoucherID INT NULL,
        CapturedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_hr_SalarySnapshotCaptured DEFAULT SYSUTCDATETIME(),
        CapturedByUserID INT NULL,
        CapturedByName NVARCHAR(100) NULL,
        CONSTRAINT CK_hr_SalarySnapshot_JSON CHECK (ISJSON(SheetJSON)=1),
        CONSTRAINT CK_hr_SalarySnapshot_Basis CHECK (SnapshotBasis IN ('POSTED','LEGACY_CURRENT'))
    );
END;
COMMIT TRANSACTION;
GO
CREATE OR ALTER TRIGGER dbo.trg_hr_SalarySheetSnapshots_Immutable
ON dbo.hr_SalarySheetSnapshots
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 51068, 'Posted salary sheet snapshots cannot be changed or deleted.', 1;
END;
GO
