-- 061_business_profile.sql
-- Owner request 2026-07-02: a Business Profile settings page carrying the
-- company details + a logo. Used first by the Sales Tax Invoice print
-- template; expected to feed other printed documents over time.
-- Single-row table (seeded with one row so the UI can PUT without INSERT).
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dms_BusinessProfile', 'U') IS NULL
BEGIN
    CREATE TABLE dms_BusinessProfile (
        ProfileID       INT IDENTITY(1,1) PRIMARY KEY,
        CompanyName     NVARCHAR(200) NOT NULL,
        LegalName       NVARCHAR(200) NULL,
        Address1        NVARCHAR(300) NULL,
        Address2        NVARCHAR(300) NULL,
        City            NVARCHAR(100) NULL,
        Country         NVARCHAR(100) NULL,
        PhoneNumbers    NVARCHAR(200) NULL,
        FaxNumber       NVARCHAR(100) NULL,
        Email           NVARCHAR(200) NULL,
        Website         NVARCHAR(200) NULL,
        -- FBR tax IDs printed on the sales-tax invoice
        NTN             NVARCHAR(50)  NULL,
        STRN            NVARCHAR(50)  NULL,
        CNIC            NVARCHAR(50)  NULL,
        -- Payment instructions block
        BankName        NVARCHAR(200) NULL,
        BankAccountNo   NVARCHAR(100) NULL,
        IBAN            NVARCHAR(50)  NULL,
        -- Uploaded logo (path is relative to Software/uploads/business/)
        LogoPath        NVARCHAR(500) NULL,
        UpdatedAt       DATETIME2 NOT NULL CONSTRAINT DF_BusinessProfile_UpdatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedBy       INT           NULL,
        UpdatedByName   NVARCHAR(100) NULL
    );
    PRINT 'dms_BusinessProfile table created.';
END
ELSE
    PRINT 'dms_BusinessProfile already exists.';
GO

-- Seed the single row so the UI can PUT without INSERT/UPSERT logic.
IF NOT EXISTS (SELECT 1 FROM dms_BusinessProfile)
BEGIN
    INSERT INTO dms_BusinessProfile
        (CompanyName, LegalName, Address1, City, Country,
         PhoneNumbers, Email,
         NTN, STRN)
    VALUES
        ('CHANGAN MULTAN MOTORS',
         'CHANGAN MULTAN MOTORS',
         'NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD',
         'MULTAN', 'PAKISTAN',
         '061-111-222-388', 'info@changanmultan.com',
         NULL, NULL);
    PRINT 'Seeded default profile row.';
END
ELSE
    PRINT 'Profile already seeded.';
GO

-- Permission key wired to the admin group so the new page is reachable
IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'settings_business_profile:view'
)
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'settings_business_profile:view'),
           (1, 'settings_business_profile:edit');
GO

PRINT '061_business_profile.sql complete.';
GO
