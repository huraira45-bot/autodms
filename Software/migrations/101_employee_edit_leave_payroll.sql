-- 101_employee_edit_leave_payroll.sql
-- Owner ask 2026-07-31: (1) let HR edit an existing employee's core details,
-- (2) mark an employee as having left (IsActive off + ResignDate, already
-- had a ResignDate column that nothing wrote to), (3) exclude specific
-- active employees (e.g. the CEO, who draws no salary) from the salary
-- sheet without marking them inactive.
--
-- IsOnPayroll is intentionally separate from IsActive: IsActive=0 means
-- "no longer employed" (leaves the whole Employees list); IsOnPayroll=0
-- means "still employed, just not paid through this system" (stays in
-- the Employees list, just skipped by the salary sheet).
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.gen_EmployeeInfo') AND name = 'IsOnPayroll'
)
BEGIN
    ALTER TABLE dbo.gen_EmployeeInfo ADD IsOnPayroll BIT NOT NULL DEFAULT 1;
    PRINT '  gen_EmployeeInfo.IsOnPayroll added (default 1 = on payroll).';
END
ELSE
    PRINT '  gen_EmployeeInfo.IsOnPayroll already exists.';
GO

-- Recreate vw_ActiveEmployees to surface IsOnPayroll + ResignDate.
CREATE OR ALTER VIEW vw_ActiveEmployees AS
SELECT
    EmployeeID, EmployeeNo, EmployeeName, FatherName, CNICno, MobileNo,
    EmployeeGender, PermanentAddress, DOB, EmailAddress, JoiningDate,
    ResignDate,
    DepartmentID, DesignationID, MachineId, BasicSalary, EmployeeGLID,
    IsTechnician, ReportsToID, IsActive, IsOnPayroll,
    SrNo, HasEOBI, EOBI, HasFuelAllowance, FuelAllowance,
    HasMess, MessAmount, HasCustomLateFine, CustomLateFineAmount,
    IsPaidByBank, BankAccountNumber
FROM gen_EmployeeInfo
WHERE IsActive = 1;
GO
PRINT '  vw_ActiveEmployees recreated with IsOnPayroll + ResignDate.';
GO

PRINT '101_employee_edit_leave_payroll complete.';
