-- ================================================================
-- 102 — data_FinanceVoucherInfo.SourceDocType: allow JC advance-apply tag
-- ================================================================
-- Owner report 2026-07-31: applying a walk-in advance at JC finalize
-- (services/jobCardPostingService.applyWalkInAdvanceForJC) failed with
--   "CK_VoucherInfo_SourceDocType violated"
-- because the new clearing voucher tags SourceDocType='JC_ADV_APPLY',
-- which wasn't in the whitelist. Same pattern as migration 099.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
PRINT '=== 102_voucher_source_jc_adv_apply ===';

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
            'HR_SALARY_ACCRUAL'
        )
    );
PRINT '  CK_VoucherInfo_SourceDocType rebuilt (JC_ADV_APPLY added).';
GO

PRINT '=== 102_voucher_source_jc_adv_apply: done ===';
