-- 124_voucher_sourcedoctype_add_fixed_asset.sql
-- CK_VoucherInfo_SourceDocType whitelists every SourceDocType value the app
-- is allowed to post — caught by local verification while building fixed
-- asset depreciation (owner ask 2026-08-20): the Draft JV insert failed the
-- CHECK constraint because 'FIXED_ASSET_DEPRECIATION' wasn't in the list.
-- Drops and recreates the constraint with that value added; every existing
-- value is preserved unchanged. Idempotent — safe to re-run.
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_VoucherInfo_SourceDocType')
BEGIN
    DECLARE @def NVARCHAR(MAX) = (SELECT definition FROM sys.check_constraints WHERE name = 'CK_VoucherInfo_SourceDocType');
    IF @def NOT LIKE '%FIXED_ASSET_DEPRECIATION%'
    BEGIN
        ALTER TABLE data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
        PRINT '124: dropped old CK_VoucherInfo_SourceDocType.';
    END
    ELSE
        PRINT '124: constraint already includes FIXED_ASSET_DEPRECIATION — nothing to do.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_VoucherInfo_SourceDocType')
BEGIN
    ALTER TABLE data_FinanceVoucherInfo WITH CHECK ADD CONSTRAINT CK_VoucherInfo_SourceDocType
    CHECK ([SourceDocType] IS NULL OR ([SourceDocType]='HR_SALARY_DISBURSE' OR [SourceDocType]='HR_SALARY_ACCRUAL'
        OR [SourceDocType]='CHEQUE' OR [SourceDocType]='PAY_MASTER' OR [SourceDocType]='MASTER_INCENTIVE_RECEIPT'
        OR [SourceDocType]='SALES_INCENTIVE_DISB' OR [SourceDocType]='SALES_INCENTIVE_ACCRUAL' OR [SourceDocType]='SALES_DELIVERY'
        OR [SourceDocType]='MASTER_INVOICE' OR [SourceDocType]='SALES_PAYMENT' OR [SourceDocType]='SSR' OR [SourceDocType]='STORE_SALE'
        OR [SourceDocType]='PAINT_GRTN' OR [SourceDocType]='PAINT_GRN' OR [SourceDocType]='GRTN' OR [SourceDocType]='GRN'
        OR [SourceDocType]='JC_ADV_APPLY' OR [SourceDocType]='JC_PAINT_CONS' OR [SourceDocType]='JOBCARD' OR [SourceDocType]='VOUCHER'
        OR [SourceDocType]='FIXED_ASSET_DEPRECIATION'));
    ALTER TABLE data_FinanceVoucherInfo CHECK CONSTRAINT CK_VoucherInfo_SourceDocType;
    PRINT '124: recreated CK_VoucherInfo_SourceDocType with FIXED_ASSET_DEPRECIATION added.';
END
GO

PRINT '124_voucher_sourcedoctype_add_fixed_asset complete.';
