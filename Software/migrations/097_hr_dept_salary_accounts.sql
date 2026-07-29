-- ================================================================
-- 097 — HR: per-department salary GL accounts
-- ================================================================
-- Owner ask 2026-07-29: rip out the old universal SALARY_EXPENSE /
-- SALARY_PAYABLE model. Every department now has its own set of
-- 8 salary-related GL accounts:
--   * SalaryExpenseEobiGLID     — salary expense for EOBI employees
--   * SalaryExpenseNonEobiGLID  — salary expense for non-EOBI employees
--   * FuelExpenseGLID           — fuel allowance expense (both EOBI + non)
--   * AbsentFineGLID            — absent-fine income
--   * LateFineGLID              — late-fine income
--   * ManualFineGLID            — manual-fine income
--   * MessRecoveryGLID          — mess deduction income
--   * EobiPayableGLID           — EOBI liability to remit
--
-- The accrual JV posts:
--   Dr Dept.Salary Expense (EOBI variant)   prorated basic
--   Dr Dept.Fuel Expense                    fuel allowance
--     Cr Dept.Absent Fine                   absent fine
--     Cr Dept.Late Fine                     late fine
--     Cr Dept.Manual Fine                   manual fine
--     Cr Dept.Mess                          mess deduction
--     Cr Dept.EOBI Payable                  EOBI amount
--     Cr Employee GL (EmployeeGLID)         balancing amount
--
-- Advance and Hold flow naturally through Employee GL — no separate
-- legs. Advance was previously Dr Employee GL when given; the accrual
-- Cr'ing Employee GL nets it out. Hold stays as a Cr balance on
-- Employee GL after the cash payment voucher.
--
-- The old hr_SalaryEntries.Adjustment column stays in the schema
-- (defaults to 0) but is no longer surfaced in the UI or calculator.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
PRINT '=== 097_hr_dept_salary_accounts ===';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_DepartmentSalaryAccounts')
BEGIN
    CREATE TABLE dbo.hr_DepartmentSalaryAccounts (
        DepartmentID              INT PRIMARY KEY,
        SalaryExpenseEobiGLID     INT NULL,
        SalaryExpenseNonEobiGLID  INT NULL,
        FuelExpenseGLID           INT NULL,
        AbsentFineGLID            INT NULL,
        LateFineGLID              INT NULL,
        ManualFineGLID            INT NULL,
        MessRecoveryGLID          INT NULL,
        EobiPayableGLID           INT NULL,
        UpdatedAt                 DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedByName             NVARCHAR(100) NULL,
        CONSTRAINT FK_hr_DeptSalAccts_Dept  FOREIGN KEY (DepartmentID)             REFERENCES dbo.gen_DepartmentInfo(DepartmentID),
        CONSTRAINT FK_hr_DeptSalAccts_SEEobi FOREIGN KEY (SalaryExpenseEobiGLID)    REFERENCES dbo.GLChartOFAccount(GLCAID),
        CONSTRAINT FK_hr_DeptSalAccts_SENon  FOREIGN KEY (SalaryExpenseNonEobiGLID) REFERENCES dbo.GLChartOFAccount(GLCAID),
        CONSTRAINT FK_hr_DeptSalAccts_Fuel   FOREIGN KEY (FuelExpenseGLID)          REFERENCES dbo.GLChartOFAccount(GLCAID),
        CONSTRAINT FK_hr_DeptSalAccts_AbsF   FOREIGN KEY (AbsentFineGLID)           REFERENCES dbo.GLChartOFAccount(GLCAID),
        CONSTRAINT FK_hr_DeptSalAccts_LateF  FOREIGN KEY (LateFineGLID)             REFERENCES dbo.GLChartOFAccount(GLCAID),
        CONSTRAINT FK_hr_DeptSalAccts_ManF   FOREIGN KEY (ManualFineGLID)           REFERENCES dbo.GLChartOFAccount(GLCAID),
        CONSTRAINT FK_hr_DeptSalAccts_Mess   FOREIGN KEY (MessRecoveryGLID)         REFERENCES dbo.GLChartOFAccount(GLCAID),
        CONSTRAINT FK_hr_DeptSalAccts_Eobi   FOREIGN KEY (EobiPayableGLID)          REFERENCES dbo.GLChartOFAccount(GLCAID)
    );
    PRINT '  hr_DepartmentSalaryAccounts created.';
END
ELSE
    PRINT '  hr_DepartmentSalaryAccounts already exists.';
GO

PRINT '=== 097_hr_dept_salary_accounts: done ===';
