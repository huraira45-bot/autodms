-- 111_hr_mess_amount_override.sql
-- Owner ask 2026-08-03: a dedicated Mess Sheet where the mess rate itself
-- can be raised or lowered for a single month, without permanently
-- changing the employee's default daily rate (gen_EmployeeInfo.MessAmount).
-- NULL = no override, fall back to the employee's default rate for that
-- month (same behaviour as every other nullable per-month field already on
-- this table, e.g. PaidDays/LateFineRate).
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'hr_SalaryEntries' AND COLUMN_NAME = 'MessAmountOverride'
)
BEGIN
    ALTER TABLE hr_SalaryEntries ADD MessAmountOverride DECIMAL(10,2) NULL;
    PRINT 'Added MessAmountOverride to hr_SalaryEntries.';
END
ELSE
    PRINT 'MessAmountOverride already exists on hr_SalaryEntries.';

PRINT '111_hr_mess_amount_override complete.';
