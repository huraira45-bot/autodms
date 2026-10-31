-- Booking assignment roster. Starts empty: Accounts/Admin explicitly chooses staff.
-- Existing bookings, HR records and incentive history are not changed.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_SalesExecutives','U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_SalesExecutives (
        EmployeeID INT NOT NULL PRIMARY KEY
            REFERENCES dbo.gen_EmployeeInfo(EmployeeID),
        IsEnabled BIT NOT NULL DEFAULT 1,
        UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedByUserID INT NULL,
        UpdatedByName NVARCHAR(100) NULL
    );
END;
IF OBJECT_ID('dbo.dms_SalesExecutiveChanges','U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_SalesExecutiveChanges (
        ChangeID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EmployeeID INT NOT NULL REFERENCES dbo.gen_EmployeeInfo(EmployeeID),
        PreviousEnabled BIT NULL,
        IsEnabled BIT NOT NULL,
        ChangedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        ActorUserID INT NULL,
        ActorName NVARCHAR(100) NULL
    );
END;
COMMIT TRANSACTION;
