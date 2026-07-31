-- ================================================================
-- 103 — HR: Tax deduction (per-employee entry + department liability GL)
-- ================================================================
-- Owner ask 2026-07-31: a "Tax" box on the Salary Sheet, same treatment
-- as EOBI — reduces the employee's net pay and credits a per-department
-- "Tax Payable" liability account when the accrual JV posts, so withheld
-- income tax sits as a real liability rather than just vanishing from
-- the books. Mirrors migration 097's EOBI pattern exactly.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
PRINT '=== 103_hr_salary_tax ===';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.hr_SalaryEntries') AND name = 'Tax'
)
BEGIN
    ALTER TABLE dbo.hr_SalaryEntries ADD Tax DECIMAL(18,2) NOT NULL DEFAULT 0;
    PRINT '  hr_SalaryEntries.Tax added.';
END
ELSE
    PRINT '  hr_SalaryEntries.Tax already exists.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.hr_DepartmentSalaryAccounts') AND name = 'TaxPayableGLID'
)
BEGIN
    ALTER TABLE dbo.hr_DepartmentSalaryAccounts ADD TaxPayableGLID INT NULL;
    ALTER TABLE dbo.hr_DepartmentSalaryAccounts
        ADD CONSTRAINT FK_hr_DeptSalAccts_Tax FOREIGN KEY (TaxPayableGLID) REFERENCES dbo.GLChartOFAccount(GLCAID);
    PRINT '  hr_DepartmentSalaryAccounts.TaxPayableGLID added.';
END
ELSE
    PRINT '  hr_DepartmentSalaryAccounts.TaxPayableGLID already exists.';
GO

PRINT '=== 103_hr_salary_tax: done ===';
