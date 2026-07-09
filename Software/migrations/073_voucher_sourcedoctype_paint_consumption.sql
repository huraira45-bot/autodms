-- =====================================================================
-- 073_voucher_sourcedoctype_paint_consumption.sql
--
-- Extend CK_VoucherInfo_SourceDocType to allow 'JC_PAINT_CONS'.
--
-- paintIssueConsumptionService.js posts a separate voucher on JC
-- finalize for each B&P JC that consumed paint (uses the JC's
-- source-doc slot with a unique type so reports can distinguish
-- paint-consumption postings from the main SI). The constraint on
-- data_FinanceVoucherInfo.SourceDocType was never updated to include
-- that value, so finalizing any B&P JC with paint fails with
-- CK_VoucherInfo_SourceDocType (owner report on B&P-0011, 2026-07-09).
--
-- Idempotent: skips the rebuild if the current constraint definition
-- already contains JC_PAINT_CONS.
-- =====================================================================
SET NOCOUNT ON;

IF EXISTS (
    SELECT 1
    FROM   sys.check_constraints
    WHERE  name = 'CK_VoucherInfo_SourceDocType'
      AND  definition NOT LIKE '%JC_PAINT_CONS%'
)
BEGIN
    PRINT 'Rebuilding CK_VoucherInfo_SourceDocType with JC_PAINT_CONS added...';
    ALTER TABLE dbo.data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
    ALTER TABLE dbo.data_FinanceVoucherInfo ADD CONSTRAINT CK_VoucherInfo_SourceDocType
        CHECK (SourceDocType IS NULL OR SourceDocType IN (
            'CHEQUE', 'PAY_MASTER', 'MASTER_INCENTIVE_RECEIPT',
            'SALES_INCENTIVE_DISB', 'SALES_INCENTIVE_ACCRUAL',
            'SALES_DELIVERY', 'MASTER_INVOICE', 'SALES_PAYMENT',
            'SSR', 'STORE_SALE', 'GRTN', 'GRN', 'JOBCARD',
            'JC_PAINT_CONS', 'VOUCHER'
        ));
    PRINT '073_voucher_sourcedoctype_paint_consumption applied.';
END
ELSE
    PRINT '073_voucher_sourcedoctype_paint_consumption already applied (no-op).';
