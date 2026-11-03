-- Preserve original snapshots and every subsequent lock/unlock revision.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.hr_SalarySheetSnapshots','U') IS NULL
    THROW 51069,'Apply migration 166_salary_sheet_snapshots.sql first.',1;
IF OBJECT_ID('dbo.hr_SalarySheetLockHistory','U') IS NULL
BEGIN
    CREATE TABLE dbo.hr_SalarySheetLockHistory (
        ControlID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        MonthID CHAR(7) NOT NULL,
        Action VARCHAR(6) NOT NULL,
        SnapshotVersion INT NOT NULL DEFAULT 1,
        SheetJSON NVARCHAR(MAX) NULL,
        SnapshotBasis NVARCHAR(24) NULL,
        FirstVoucherID INT NULL,
        CapturedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        CapturedByUserID INT NULL,
        CapturedByName NVARCHAR(100) NULL,
        Reason NVARCHAR(500) NOT NULL,
        CONSTRAINT CK_SalaryLock_Month CHECK(MonthID>='2026-10'),
        CONSTRAINT CK_SalaryLock_Action CHECK (
            (Action='UNLOCK' AND SheetJSON IS NULL AND SnapshotBasis IS NULL) OR
            (Action='LOCK' AND SheetJSON IS NOT NULL AND ISJSON(SheetJSON)=1
                AND SnapshotBasis IS NOT NULL AND SnapshotBasis IN ('POSTED','LEGACY_CURRENT','MANUAL'))),
        CONSTRAINT CK_SalaryLock_Reason CHECK(LEN(LTRIM(RTRIM(Reason)))>=5)
    );
    CREATE INDEX IX_SalaryLock_Month ON dbo.hr_SalarySheetLockHistory(MonthID,ControlID DESC);
END;
COMMIT TRANSACTION;
GO
CREATE OR ALTER TRIGGER dbo.trg_hr_SalarySheetLockHistory_Immutable
ON dbo.hr_SalarySheetLockHistory AFTER UPDATE,DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM deleted)
        THROW 51068,'Salary lock history cannot be changed or deleted.',1;
END;
GO
