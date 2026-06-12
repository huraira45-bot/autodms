-- Phase 6: Care-Off Discount System Setup
-- Run with: sqlcmd -S localhost -d temp_db1 -E -i setup_phase6_careoff.sql

-- 1. Create dms_CareOff
IF OBJECT_ID('dms_CareOff', 'U') IS NULL
BEGIN
    CREATE TABLE dms_CareOff (
        CareOffID  INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeID INT NOT NULL,
        MaxDiscountPct DECIMAL(5,2) NOT NULL DEFAULT 0,
        IsActive   BIT NOT NULL DEFAULT 1,
        CreatedBy  INT NULL,
        CreatedAt  DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedBy  INT NULL,
        UpdatedAt  DATETIME NULL
    );
    PRINT 'dms_CareOff created';
END
ELSE PRINT 'dms_CareOff already exists';
GO

-- 2. Create dms_CareOffAudit
IF OBJECT_ID('dms_CareOffAudit', 'U') IS NULL
BEGIN
    CREATE TABLE dms_CareOffAudit (
        AuditID       INT IDENTITY(1,1) PRIMARY KEY,
        JobCardID     INT NULL,
        Action        NVARCHAR(50) NULL,
        CareOffID     INT NULL,
        NewValue      NVARCHAR(200) NULL,
        ChangedBy     INT NULL,
        ChangedByName NVARCHAR(100) NULL,
        ChangedAt     DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'dms_CareOffAudit created';
END
ELSE PRINT 'dms_CareOffAudit already exists';
GO

-- 3. Add CareOffID + CareOffName to Addata_JobCardInfo
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='CareOffID')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD CareOffID INT NULL;
    PRINT 'CareOffID column added to Addata_JobCardInfo';
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='CareOffName')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD CareOffName NVARCHAR(100) NULL;
    PRINT 'CareOffName column added to Addata_JobCardInfo';
END
GO

-- 4. Add DiscType to Addata_JobCardInfoDetail (Discount + DiscAmt already exist in schema)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME='Addata_JobCardInfoDetail' AND COLUMN_NAME='DiscType')
BEGIN
    ALTER TABLE Addata_JobCardInfoDetail ADD DiscType NVARCHAR(10) NULL;
    PRINT 'DiscType column added to Addata_JobCardInfoDetail';
END
GO

-- 5. Seed workshop_careoff module permission for Admin group (GroupID=1)
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID=1 AND ModuleKey='workshop_careoff')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, ModuleKey) VALUES (1, 'workshop_careoff');
    PRINT 'workshop_careoff module seeded for GroupID=1';
END
GO

PRINT 'Phase 6 setup complete';
GO
