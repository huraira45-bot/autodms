-- ================================================================
-- 099 — data_FinanceVoucherInfo.SourceDocType: allow HR salary tag
-- ================================================================
-- Owner report 2026-07-29: Post Accrual (JV) failed with
--   "CK_VoucherInfo_SourceDocType violated"
-- because the new HR salary posting tags the voucher with
-- 'HR_SALARY_ACCRUAL', which wasn't in the whitelist.
--
-- Rebuilds CK_VoucherInfo_SourceDocType with the same set of legacy
-- tags plus HR_SALARY_ACCRUAL. Old bank/cash HR tags are NOT added
-- because the corresponding controllers were removed on 2026-07-29
-- (single-accrual model now — see migration 097).
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
PRINT '=== 099_voucher_source_hr_salary ===';

DECLARE @cc SYSNAME = (
    SELECT TOP 1 cc.name FROM sys.check_constraints cc
    INNER JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
    WHERE c.name = 'SourceDocType' AND OBJECT_NAME(cc.parent_object_id) = 'data_FinanceVoucherInfo'
);
IF @cc IS NOT NULL
BEGIN
    EXEC('ALTER TABLE data_FinanceVoucherInfo DROP CONSTRAINT ' + @cc);
    PRINT '  Dropped ' + @cc;
END
GO

ALTER TABLE data_FinanceVoucherInfo
    ADD CONSTRAINT CK_VoucherInfo_SourceDocType CHECK (
        SourceDocType IS NULL OR SourceDocType IN (
            'VOUCHER',
            'JOBCARD', 'JC_PAINT_CONS',
            'GRN', 'GRTN',
            'PAINT_GRN', 'PAINT_GRTN',
            'STORE_SALE', 'SSR',
            'SALES_PAYMENT', 'MASTER_INVOICE', 'SALES_DELIVERY',
            'SALES_INCENTIVE_ACCRUAL', 'SALES_INCENTIVE_DISB',
            'MASTER_INCENTIVE_RECEIPT', 'PAY_MASTER', 'CHEQUE',
            'HR_SALARY_ACCRUAL'
        )
    );
PRINT '  CK_VoucherInfo_SourceDocType rebuilt (HR_SALARY_ACCRUAL added).';
GO

PRINT '=== 099_voucher_source_hr_salary: done ===';
