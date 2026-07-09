-- =====================================================================
-- 073_voucher_sourcedoctype_paint_consumption.sql
--
-- Extend CK_VoucherInfo_SourceDocType to allow the three paint-module
-- source doc types the code has always emitted but the constraint on
-- live never covered:
--   * PAINT_GRN     — paintGRNPostingService (finalize Paint GRN)
--   * PAINT_GRTN    — paintGRTNPostingService (finalize Paint GRTN)
--   * JC_PAINT_CONS — paintIssueConsumptionService (posted at JC finalize
--                    for each B&P JC that consumed paint).
--
-- Owner reports 2026-07-09:
--   * B&P-0011 finalize fails on CK_VoucherInfo_SourceDocType (JC_PAINT_CONS)
--   * Paint Lab opening-stock GRN finalize fails on same constraint (PAINT_GRN)
--
-- Idempotent: rebuilds only if the current definition is missing any of
-- the three. Safe to re-run.
-- =====================================================================
SET NOCOUNT ON;

IF EXISTS (
    SELECT 1
    FROM   sys.check_constraints
    WHERE  name = 'CK_VoucherInfo_SourceDocType'
      AND  (definition NOT LIKE '%JC_PAINT_CONS%'
         OR definition NOT LIKE '%PAINT_GRN%'
         OR definition NOT LIKE '%PAINT_GRTN%')
)
BEGIN
    PRINT 'Rebuilding CK_VoucherInfo_SourceDocType with paint values added...';
    ALTER TABLE dbo.data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
    ALTER TABLE dbo.data_FinanceVoucherInfo ADD CONSTRAINT CK_VoucherInfo_SourceDocType
        CHECK (SourceDocType IS NULL OR SourceDocType IN (
            'CHEQUE', 'PAY_MASTER', 'MASTER_INCENTIVE_RECEIPT',
            'SALES_INCENTIVE_DISB', 'SALES_INCENTIVE_ACCRUAL',
            'SALES_DELIVERY', 'MASTER_INVOICE', 'SALES_PAYMENT',
            'SSR', 'STORE_SALE', 'GRTN', 'GRN', 'JOBCARD',
            'PAINT_GRN', 'PAINT_GRTN', 'JC_PAINT_CONS',
            'VOUCHER'
        ));
    PRINT '073_voucher_sourcedoctype_paint_consumption applied.';
END
ELSE
    PRINT '073_voucher_sourcedoctype_paint_consumption already applied (no-op).';
