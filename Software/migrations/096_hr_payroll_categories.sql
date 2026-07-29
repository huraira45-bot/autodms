-- ================================================================
-- 096 — HR: split cash payroll into EOBI vs Non-EOBI vouchers
-- ================================================================
-- Owner ask 2026-07-29: payroll has two categories —
--   * Non-EOBI employees are ALWAYS paid in cash.
--   * EOBI employees may be paid via bank OR cash.
-- Each cash bucket posts its OWN voucher so the ledger keeps a
-- clean trail for each payroll type.
--
-- CHECK on hr_SalaryPostings.PostingType previously only allowed
-- ACCRUAL / PAY_BANK / PAY_CASH. This migration extends it to
-- include PAY_CASH_EOBI and PAY_CASH_NONEOBI. The old PAY_CASH
-- token stays legal so historical rows keep passing.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
PRINT '=== 096_hr_payroll_categories ===';

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_SalaryPostings')
BEGIN
    -- Drop existing CHECK on PostingType (whatever it's named)
    DECLARE @ccName SYSNAME = (
        SELECT TOP 1 cc.name FROM sys.check_constraints cc
        INNER JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
        WHERE c.name = 'PostingType' AND OBJECT_NAME(cc.parent_object_id) = 'hr_SalaryPostings'
    );
    IF @ccName IS NOT NULL
        EXEC('ALTER TABLE hr_SalaryPostings DROP CONSTRAINT ' + @ccName);

    ALTER TABLE hr_SalaryPostings ADD CONSTRAINT CK_hr_PostingType
        CHECK (PostingType IN ('ACCRUAL', 'PAY_BANK', 'PAY_CASH', 'PAY_CASH_EOBI', 'PAY_CASH_NONEOBI'));
    PRINT '  hr_SalaryPostings PostingType CHECK extended.';
END
ELSE
    PRINT '  hr_SalaryPostings missing — run 095 first.';
GO

PRINT '=== 096_hr_payroll_categories: done ===';
