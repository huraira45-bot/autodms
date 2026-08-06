-- ================================================================
-- 117 — hr_SalaryPostings.PostingType: allow per-bank disbursement tags
-- ================================================================
-- CK_hr_PostingType only allowed the old fixed set (ACCRUAL,
-- PAY_CASH_NONEOBI, PAY_CASH_EOBI, PAY_CASH, PAY_BANK) left over from the
-- pre-2026-07-29 design, which had exactly one bank. The new
-- postDisbursement endpoint reuses PAY_CASH_NONEOBI / PAY_CASH_EOBI
-- as-is, but needs a PAY_BANK_<GLCAID> per distinct company bank account
-- (migration 115) — a value list can't enumerate that, so this switches
-- the bank branch to a LIKE pattern instead.
-- ================================================================
SET NOCOUNT ON;
PRINT '=== 117_hr_salary_postingtype_bank ===';

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_hr_PostingType')
BEGIN
    ALTER TABLE hr_SalaryPostings DROP CONSTRAINT CK_hr_PostingType;
    PRINT '  Dropped CK_hr_PostingType';
END
GO

ALTER TABLE hr_SalaryPostings
    ADD CONSTRAINT CK_hr_PostingType CHECK (
        PostingType IN ('ACCRUAL', 'PAY_CASH_NONEOBI', 'PAY_CASH_EOBI', 'PAY_CASH', 'PAY_BANK')
        OR PostingType LIKE 'PAY[_]BANK[_]%'
    );
PRINT '  CK_hr_PostingType rebuilt (PAY_BANK_<GLCAID> pattern added).';
GO

PRINT '=== 117_hr_salary_postingtype_bank: done ===';
