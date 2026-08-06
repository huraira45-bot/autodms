-- ================================================================
-- 116 — data_FinanceVoucherInfo.SourceDocType: allow HR disbursement tag
-- ================================================================
-- Owner ask 2026-08-07: bring back bulk salary disbursement (paying out
-- the already-accrued net salary in cash/bank), removed 2026-07-29 in
-- favor of manual CPV/BPV entry. The new bulk postDisbursement endpoint
-- tags its vouchers 'HR_SALARY_DISBURSE', which isn't in the
-- whitelist yet (mirrors migration 099's pattern exactly for
-- HR_SALARY_ACCRUAL).
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
PRINT '=== 116_hr_salary_disbursement_sourcedoctype ===';

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
            'JOBCARD', 'JC_PAINT_CONS', 'JC_ADV_APPLY',
            'GRN', 'GRTN',
            'PAINT_GRN', 'PAINT_GRTN',
            'STORE_SALE', 'SSR',
            'SALES_PAYMENT', 'MASTER_INVOICE', 'SALES_DELIVERY',
            'SALES_INCENTIVE_ACCRUAL', 'SALES_INCENTIVE_DISB',
            'MASTER_INCENTIVE_RECEIPT', 'PAY_MASTER', 'CHEQUE',
            'HR_SALARY_ACCRUAL', 'HR_SALARY_DISBURSE'
        )
    );
PRINT '  CK_VoucherInfo_SourceDocType rebuilt (HR_SALARY_DISBURSE added).';
GO

PRINT '=== 116_hr_salary_disbursement_sourcedoctype: done ===';
