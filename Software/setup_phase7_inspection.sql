-- Phase 7: Vehicle Inspection, Accessories, Customer DOB, Birthday Widget
-- Run: sqlcmd -S localhost -d temp_db1 -E -i setup_phase7_inspection.sql

-- 1. Add DOB to addata_CustomerInfo
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='addata_CustomerInfo' AND COLUMN_NAME='DOB')
BEGIN
    ALTER TABLE addata_CustomerInfo ADD DOB DATE NULL;
    PRINT 'DOB added to addata_CustomerInfo';
END
ELSE PRINT 'DOB already exists';
GO

-- 2. Add inspection fields to Addata_JobCardInfo
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='DQIRNo')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD DQIRNo NVARCHAR(50) NULL;
    PRINT 'DQIRNo added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='CheckedByID')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD CheckedByID INT NULL;
    PRINT 'CheckedByID added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='CheckedByName')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD CheckedByName NVARCHAR(100) NULL;
    PRINT 'CheckedByName added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='ConfirmByID')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD ConfirmByID INT NULL;
    PRINT 'ConfirmByID added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='ConfirmByName')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD ConfirmByName NVARCHAR(100) NULL;
    PRINT 'ConfirmByName added';
END
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfo' AND COLUMN_NAME='WACResults')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD WACResults NVARCHAR(MAX) NULL;
    PRINT 'WACResults added';
END
GO

-- 3. Create dms_AccessoriesMaster
IF OBJECT_ID('dms_AccessoriesMaster', 'U') IS NULL
BEGIN
    CREATE TABLE dms_AccessoriesMaster (
        AccessoryID INT IDENTITY(1,1) PRIMARY KEY,
        Title       NVARCHAR(100) NOT NULL,
        IsActive    BIT NOT NULL DEFAULT 1,
        SortOrder   INT NOT NULL DEFAULT 0
    );
    PRINT 'dms_AccessoriesMaster created';
END
ELSE PRINT 'dms_AccessoriesMaster already exists';
GO

-- 4. Seed accessories
IF NOT EXISTS (SELECT 1 FROM dms_AccessoriesMaster)
BEGIN
    INSERT INTO dms_AccessoriesMaster (Title, SortOrder) VALUES
        ('Ashtray', 1), ('Cassette Player', 2), ('Clock', 3),
        ('Dikey Mat', 4), ('DVD Player', 5), ('Antenna', 6),
        ('Spare Tyre', 7), ('Jack', 8), ('Tool Kit', 9),
        ('Floor Mat', 10), ('Seat Cover', 11), ('Sun Visor', 12);
    PRINT 'Accessories seeded';
END
GO

-- 5. Create dms_JobCardAccessories
IF OBJECT_ID('dms_JobCardAccessories', 'U') IS NULL
BEGIN
    CREATE TABLE dms_JobCardAccessories (
        ID          INT IDENTITY(1,1) PRIMARY KEY,
        JobCardID   INT NOT NULL,
        AccessoryID INT NOT NULL,
        IsChecked   BIT NOT NULL DEFAULT 0,
        Qty         INT NOT NULL DEFAULT 0
    );
    PRINT 'dms_JobCardAccessories created';
END
ELSE PRINT 'dms_JobCardAccessories already exists';
GO

-- 6. Create dms_DamageMarks
IF OBJECT_ID('dms_DamageMarks', 'U') IS NULL
BEGIN
    CREATE TABLE dms_DamageMarks (
        MarkID    INT IDENTITY(1,1) PRIMARY KEY,
        JobCardID INT NOT NULL,
        XPct      DECIMAL(6,3) NOT NULL,
        YPct      DECIMAL(6,3) NOT NULL,
        Note      NVARCHAR(200) NULL,
        CreatedBy INT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
    PRINT 'dms_DamageMarks created';
END
ELSE PRINT 'dms_DamageMarks already exists';
GO

-- 7. Seed workshop_accessories module for Admin (GroupID=1)
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID=1 AND ModuleKey='workshop_accessories')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, ModuleKey) VALUES (1, 'workshop_accessories');
    PRINT 'workshop_accessories module seeded';
END
GO

-- 8. Rebuild vw_WorkshopCustomers to include DOB
IF OBJECT_ID('vw_WorkshopCustomers', 'V') IS NOT NULL DROP VIEW vw_WorkshopCustomers;
GO
CREATE VIEW vw_WorkshopCustomers AS
SELECT
    ProfileID, CustomerCode, endUserName AS CustomerName,
    PhoneNo, Email, CNIC, Address, DOB,
    ChasisNo, EngineNo, RegistrationNo,
    BrandName, versionCode AS VehicleModel,
    vehicleCode, ColorId,
    PartyID, PartyName, PartyGLID, CompanyID
FROM addata_CustomerInfo;
GO
PRINT 'vw_WorkshopCustomers rebuilt with DOB';
GO

PRINT 'Phase 7 setup complete';
GO
