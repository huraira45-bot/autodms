-- 150_employee_bank_portion.sql
-- Owner ask 2026-10-05: an employee can be paid partly into the bank and
-- partly in cash, not one or the other.
--
-- BankPortionAmount is a FIXED amount that goes to the bank each month; the
-- rest of the net is paid in cash. NULL or 0 means no split, so the existing
-- IsPaidByBank bit keeps its meaning on its own:
--
--   IsPaidByBank = 0                        -> all cash
--   IsPaidByBank = 1, BankPortionAmount = 0 -> all bank   (what "Bank" means today)
--   IsPaidByBank = 1, BankPortionAmount > 0 -> that much to the bank, rest cash
--
-- Every employee already on the system falls into the first two, so nothing
-- about an existing payroll changes.
--
-- Owner also dropped the rule that only EOBI employees may be paid by bank
-- (2026-07-29 → reversed 2026-10-05). No data change is needed for that --
-- it was enforced in code, not by a constraint.
-- Idempotent.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('gen_EmployeeInfo') AND name = 'BankPortionAmount'
)
BEGIN
    ALTER TABLE gen_EmployeeInfo ADD BankPortionAmount DECIMAL(18,2) NULL;
    PRINT 'Added gen_EmployeeInfo.BankPortionAmount.';
END
ELSE
    PRINT 'gen_EmployeeInfo.BankPortionAmount already exists.';

PRINT '150_employee_bank_portion complete.';
