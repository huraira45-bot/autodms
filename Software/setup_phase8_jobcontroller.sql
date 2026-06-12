-- Phase 8: Job Controller
-- Run: sqlcmd -S localhost -d temp_db1 -E -i setup_phase8_jobcontroller.sql

-- 1. Add WorkshopStatus to Addata_JobCardInfo
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='WorkshopStatus')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD WorkshopStatus NVARCHAR(50) NULL;
    PRINT 'WorkshopStatus added to Addata_JobCardInfo';
END
ELSE PRINT 'WorkshopStatus already exists';
GO

-- 2. Add assignment fields to Addata_JobCardInfoDetail
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoDetail' AND COLUMN_NAME='BayNo')
BEGIN
    ALTER TABLE Addata_JobCardInfoDetail ADD BayNo NVARCHAR(20) NULL;
    PRINT 'BayNo added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoDetail' AND COLUMN_NAME='PerformedByName')
BEGIN
    ALTER TABLE Addata_JobCardInfoDetail ADD PerformedByName NVARCHAR(100) NULL;
    PRINT 'PerformedByName added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoDetail' AND COLUMN_NAME='JobStartTime')
BEGIN
    ALTER TABLE Addata_JobCardInfoDetail ADD JobStartTime DATETIME NULL;
    PRINT 'JobStartTime added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoDetail' AND COLUMN_NAME='JobEndTime')
BEGIN
    ALTER TABLE Addata_JobCardInfoDetail ADD JobEndTime DATETIME NULL;
    PRINT 'JobEndTime added';
END
GO

-- 3. Create dms_Bays
IF OBJECT_ID('dms_Bays', 'U') IS NULL
BEGIN
    CREATE TABLE dms_Bays (
        BayID    INT IDENTITY(1,1) PRIMARY KEY,
        BayName  NVARCHAR(50) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1
    );
    INSERT INTO dms_Bays (BayName) VALUES
        ('Bay 1'),('Bay 2'),('Bay 3'),('Bay 4'),('Bay 5'),
        ('Bay 6'),('Bay 7'),('Bay 8'),('Bay 9'),('Bay 10');
    PRINT 'dms_Bays created and seeded';
END
ELSE PRINT 'dms_Bays already exists';
GO

-- 4. Seed workshop_controller module for Admin (GroupID=1)
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID=1 AND ModuleKey='workshop_controller')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, ModuleKey) VALUES (1, 'workshop_controller');
    PRINT 'workshop_controller module seeded';
END
GO

PRINT 'Phase 8 setup complete';
GO
