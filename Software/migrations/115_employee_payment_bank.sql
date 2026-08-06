-- =====================================================================
-- 115_employee_payment_bank.sql  (owner ask 2026-08-07)
--
-- The Bank Letter print (letter to a bank asking them to debit "our
-- account" and transfer salaries) only ever supported ONE bank -- all
-- bank-paid employees were lumped into a single letter regardless of
-- which company bank account they're actually paid from. This adds a
-- per-employee PaymentBankGLCAID (FK to dms_BankAccounts, the same
-- bank list used by Vouchers / Receive Payment everywhere else), so
-- employees can be split across the company's different bank accounts
-- and the Bank Letter can be generated once per bank.
--
-- Nullable: cash-paid employees don't need one; existing bank-paid
-- employees start unassigned until the operator picks a bank on
-- Employee Salary Settings.
--
-- Idempotent.
-- =====================================================================
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE  object_id = OBJECT_ID('dbo.gen_EmployeeInfo')
      AND  name = 'PaymentBankGLCAID'
)
BEGIN
    ALTER TABLE dbo.gen_EmployeeInfo ADD PaymentBankGLCAID INT NULL;
    PRINT '  gen_EmployeeInfo.PaymentBankGLCAID column added.';
END
ELSE
    PRINT '  gen_EmployeeInfo.PaymentBankGLCAID already exists.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_EmployeeInfo_PaymentBank'
)
BEGIN
    ALTER TABLE dbo.gen_EmployeeInfo
        ADD CONSTRAINT FK_EmployeeInfo_PaymentBank
        FOREIGN KEY (PaymentBankGLCAID) REFERENCES dbo.dms_BankAccounts(GLCAID);
    PRINT '  FK_EmployeeInfo_PaymentBank added.';
END
ELSE
    PRINT '  FK_EmployeeInfo_PaymentBank already exists.';
GO

-- vw_ActiveEmployees uses an explicit column list, so it needs the new
-- column added by hand or GET /api/employees (which reads from it by
-- default) will never see it.
CREATE OR ALTER VIEW vw_ActiveEmployees AS
SELECT
    EmployeeID, EmployeeNo, EmployeeName, FatherName, CNICno, MobileNo,
    EmployeeGender, PermanentAddress, DOB, EmailAddress, JoiningDate,
    ResignDate,
    DepartmentID, DesignationID, MachineId, BasicSalary, EmployeeGLID,
    IsTechnician, ReportsToID, IsActive, IsOnPayroll,
    SrNo, HasEOBI, EOBI, HasFuelAllowance, FuelAllowance,
    HasMess, MessAmount, HasCustomLateFine, CustomLateFineAmount,
    IsPaidByBank, BankAccountNumber, PaymentBankGLCAID
FROM gen_EmployeeInfo
WHERE IsActive = 1;
GO
PRINT '  vw_ActiveEmployees recreated with PaymentBankGLCAID.';

PRINT '115_employee_payment_bank complete.';
