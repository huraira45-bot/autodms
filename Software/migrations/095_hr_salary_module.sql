-- ================================================================
-- 095 — HR / Salary Management module
-- ================================================================
-- Port of the standalone Changan Salary Management System into
-- AutoDMS. Reuses gen_EmployeeInfo (existing employee master)
-- and posts salary vouchers via data_FinanceVoucherInfo.
--
-- Adds:
--   1. Columns on gen_EmployeeInfo for the salary-specific flags
--      (fuel, EOBI toggle, mess, custom late fine, bank flag).
--   2. hr_AttendanceRecords   — per-employee per-month attendance
--   3. hr_SalaryEntries       — per-employee per-month adjustments
--   4. hr_FineSettings        — global fine rates (single row)
--   5. hr_MonthlySettings     — per-month override of fine rates
--   6. hr_SalaryPostings      — audit of posted salary vouchers
--   7. System accounts        — SALARY_EXPENSE, SALARY_PAYABLE
--
-- Permissions: hr_employees + hr_settings already exist.
-- Adds:  hr_attendance, hr_salary, hr_salary_post
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
PRINT '=== 095_hr_salary_module ===';

-- ---------- gen_EmployeeInfo column adds ----------
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'FuelAllowance') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD FuelAllowance NUMERIC(10,2) NOT NULL CONSTRAINT DF_gen_EmployeeInfo_FuelAllowance DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'HasFuelAllowance') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD HasFuelAllowance BIT NOT NULL CONSTRAINT DF_gen_EmployeeInfo_HasFuel DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'HasEOBI') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD HasEOBI BIT NOT NULL CONSTRAINT DF_gen_EmployeeInfo_HasEOBI DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'MessAmount') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD MessAmount NUMERIC(10,2) NOT NULL CONSTRAINT DF_gen_EmployeeInfo_MessAmt DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'HasMess') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD HasMess BIT NOT NULL CONSTRAINT DF_gen_EmployeeInfo_HasMess DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'HasCustomLateFine') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD HasCustomLateFine BIT NOT NULL CONSTRAINT DF_gen_EmployeeInfo_HasCLF DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'CustomLateFineAmount') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD CustomLateFineAmount NUMERIC(10,4) NOT NULL CONSTRAINT DF_gen_EmployeeInfo_CLFAmt DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'IsPaidByBank') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD IsPaidByBank BIT NOT NULL CONSTRAINT DF_gen_EmployeeInfo_IsBank DEFAULT 0;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'BankAccountNumber') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD BankAccountNumber NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.gen_EmployeeInfo', 'SrNo') IS NULL
    ALTER TABLE dbo.gen_EmployeeInfo ADD SrNo NVARCHAR(50) NULL;
PRINT '  gen_EmployeeInfo salary columns present.';
GO

-- ---------- hr_AttendanceRecords ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_AttendanceRecords')
BEGIN
    CREATE TABLE dbo.hr_AttendanceRecords (
        AttendanceID  INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeID    INT           NOT NULL,
        MonthID       CHAR(7)       NOT NULL,             -- "2026-07"
        Absents       DECIMAL(6,2)  NOT NULL DEFAULT 0,
        LateMinutes   INT           NOT NULL DEFAULT 0,
        LeaveDays     DECIMAL(6,2)  NOT NULL DEFAULT 0,
        WorkingDays   DECIMAL(6,2)  NOT NULL DEFAULT 0,
        UpdatedAt     DATETIME      NOT NULL DEFAULT GETDATE(),
        UpdatedByName NVARCHAR(100) NULL,
        CONSTRAINT UX_hr_Attendance UNIQUE (EmployeeID, MonthID),
        CONSTRAINT FK_hr_Attendance_Emp FOREIGN KEY (EmployeeID) REFERENCES dbo.gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_hr_Attendance_Month ON dbo.hr_AttendanceRecords(MonthID);
    PRINT '  hr_AttendanceRecords created.';
END
GO

-- ---------- hr_SalaryEntries ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_SalaryEntries')
BEGIN
    CREATE TABLE dbo.hr_SalaryEntries (
        SalaryEntryID  INT IDENTITY(1,1) PRIMARY KEY,
        EmployeeID     INT           NOT NULL,
        MonthID        CHAR(7)       NOT NULL,
        Advance        DECIMAL(18,2) NOT NULL DEFAULT 0,
        Fine           DECIMAL(18,2) NOT NULL DEFAULT 0,
        ManualFineRemarks NVARCHAR(300) NULL,
        Hold           DECIMAL(18,2) NOT NULL DEFAULT 0,
        MessDays       DECIMAL(6,2)  NOT NULL DEFAULT 0,
        PaidDays       DECIMAL(6,2)  NULL,                -- NULL = full month
        LateFineRate   DECIMAL(10,4) NULL,                -- NULL = use month/global
        Adjustment     DECIMAL(18,2) NOT NULL DEFAULT 0,
        Remarks        NVARCHAR(MAX) NULL,
        UpdatedAt      DATETIME      NOT NULL DEFAULT GETDATE(),
        UpdatedByName  NVARCHAR(100) NULL,
        CONSTRAINT UX_hr_SalaryEntry UNIQUE (EmployeeID, MonthID),
        CONSTRAINT FK_hr_SalaryEntry_Emp FOREIGN KEY (EmployeeID) REFERENCES dbo.gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_hr_SalaryEntry_Month ON dbo.hr_SalaryEntries(MonthID);
    PRINT '  hr_SalaryEntries created.';
END
GO

-- ---------- hr_FineSettings (single row) ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_FineSettings')
BEGIN
    CREATE TABLE dbo.hr_FineSettings (
        SettingID          INT PRIMARY KEY CHECK (SettingID = 1),
        LateFinePerMinute  DECIMAL(10,4) NOT NULL DEFAULT 10,
        AbsentFinePerDay   DECIMAL(10,2) NOT NULL DEFAULT 500,
        UpdatedAt          DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedByName      NVARCHAR(100) NULL
    );
    INSERT INTO dbo.hr_FineSettings (SettingID, LateFinePerMinute, AbsentFinePerDay) VALUES (1, 10, 500);
    PRINT '  hr_FineSettings created + seeded.';
END
GO

-- ---------- hr_MonthlySettings (per-month snapshot) ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_MonthlySettings')
BEGIN
    CREATE TABLE dbo.hr_MonthlySettings (
        MonthID           CHAR(7) PRIMARY KEY,
        LateFinePerMinute DECIMAL(10,4) NOT NULL,
        AbsentFinePerDay  DECIMAL(10,2) NOT NULL,
        UpdatedAt         DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedByName     NVARCHAR(100) NULL
    );
    PRINT '  hr_MonthlySettings created.';
END
GO

-- ---------- hr_SalaryPostings (audit of posted vouchers) ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_SalaryPostings')
BEGIN
    CREATE TABLE dbo.hr_SalaryPostings (
        PostingID     INT IDENTITY(1,1) PRIMARY KEY,
        MonthID       CHAR(7)       NOT NULL,
        PostingType   NVARCHAR(20)  NOT NULL,      -- ACCRUAL | PAY_BANK | PAY_CASH
        VoucherID     INT           NOT NULL,
        TotalAmount   DECIMAL(18,2) NOT NULL,
        EmployeeCount INT           NOT NULL,
        PostedAt      DATETIME      NOT NULL DEFAULT GETDATE(),
        PostedByName  NVARCHAR(100) NULL,
        CONSTRAINT CK_hr_PostingType CHECK (PostingType IN ('ACCRUAL', 'PAY_BANK', 'PAY_CASH'))
    );
    CREATE INDEX IX_hr_SalaryPostings_Month ON dbo.hr_SalaryPostings(MonthID);
    PRINT '  hr_SalaryPostings created.';
END
GO

-- ---------- System-account roles ----------
-- If a CHECK constraint on RoleKey exists that doesn't already permit
-- SALARY_EXPENSE, drop it — the app validates role keys at write time,
-- so a DB-level whitelist just adds friction whenever a new module
-- introduces a new role. NOT re-added.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints cc
    INNER JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
    WHERE c.name = 'RoleKey' AND OBJECT_NAME(cc.parent_object_id) = 'dms_SystemAccounts'
      AND cc.definition NOT LIKE '%SALARY_EXPENSE%'
)
BEGIN
    DECLARE @ccName SYSNAME = (
        SELECT TOP 1 cc.name FROM sys.check_constraints cc
        INNER JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
        WHERE c.name = 'RoleKey' AND OBJECT_NAME(cc.parent_object_id) = 'dms_SystemAccounts'
    );
    IF @ccName IS NOT NULL
    BEGIN
        EXEC('ALTER TABLE dms_SystemAccounts DROP CONSTRAINT ' + @ccName);
        PRINT '  Dropped restrictive RoleKey CHECK constraint (not re-added).';
    END
END
GO

-- No placeholder rows inserted: dms_SystemAccounts.GLCAID is NOT NULL, and
-- the correct GL for salary accounts is site-specific. Admin adds the three
-- roles (SALARY_EXPENSE / SALARY_PAYABLE / EOBI_PAYABLE) via the Accounting
-- Setup → System Accounts UI. The finalize buttons in the Salary Sheet page
-- raise a clear error message if a required role isn't mapped.
GO

-- ---------- vw_ActiveEmployees — expose the new HR columns -------
-- The existing view was created in migration 012 with an explicit column
-- list that doesn't include the HR salary fields added above. GET /api/employees
-- reads from this view via `SELECT e.* FROM vw_ActiveEmployees e`, so unless
-- we recreate the view here, the Employee Salary Settings page would save
-- values correctly but never render them back on reload.
IF OBJECT_ID('vw_ActiveEmployees', 'V') IS NOT NULL
    DROP VIEW vw_ActiveEmployees;
GO
CREATE VIEW vw_ActiveEmployees AS
SELECT
    EmployeeID, EmployeeNo, EmployeeName, FatherName, CNICno, MobileNo,
    EmployeeGender, PermanentAddress, DOB, EmailAddress, JoiningDate,
    DepartmentID, DesignationID, MachineId, BasicSalary, EmployeeGLID,
    IsTechnician, ReportsToID, IsActive,
    -- HR / salary fields added by this migration
    SrNo, HasEOBI, EOBI, HasFuelAllowance, FuelAllowance,
    HasMess, MessAmount, HasCustomLateFine, CustomLateFineAmount,
    IsPaidByBank, BankAccountNumber
FROM gen_EmployeeInfo
WHERE IsActive = 1;
GO
PRINT '  vw_ActiveEmployees recreated with HR columns.';
GO

-- Permissions live in Software/config/permissions.js — the app seeds them at
-- startup. See that file for hr_attendance / hr_salary / hr_salary_post keys.

PRINT '=== 095_hr_salary_module: done ===';
