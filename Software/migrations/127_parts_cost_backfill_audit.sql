-- 127_parts_cost_backfill_audit.sql
-- Supports the historical parts-cost correction (owner ask 2026-09-10:
-- "fix the history too for the month of august").
--
-- 1. dms_PartsCostBackfill — one row per issue line whose UnitLandedCost was
--    repaired, holding the old and new value and where the new one came from.
--    This is the audit trail AND the undo path: every write the backfill makes
--    can be reversed from this table alone. It also makes the backfill safe to
--    re-run, since already-corrected lines are skipped.
--
-- 2. Adds 'PARTS_COST_CORRECTION' to CK_VoucherInfo_SourceDocType so the
--    correcting JV can be inserted. Same drop/recreate pattern as 124; every
--    existing value is preserved.
--
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'dms_PartsCostBackfill')
BEGIN
    CREATE TABLE dms_PartsCostBackfill (
        BackfillID          INT IDENTITY(1,1) PRIMARY KEY,
        StockIssueDetailID  INT            NOT NULL,
        JobCardId           INT            NULL,
        ItemId              INT            NULL,
        IssueDate           DATETIME       NULL,
        Quantity            DECIMAL(18,4)  NULL,
        OldUnitLandedCost   DECIMAL(18,4)  NULL,
        NewUnitLandedCost   DECIMAL(18,4)  NULL,
        CostSource          NVARCHAR(60)   NULL,   -- GRN_ON_OR_BEFORE / GRN_EARLIEST / ITEM_PURCHASE_PRICE / ITEM_WEIGHTED_RATE
        WasFinalized        BIT            NULL,   -- job card already finalized => its GL needs the correcting JV
        BatchTag            NVARCHAR(40)   NULL,   -- e.g. '2026-08'
        VoucherID           INT            NULL,   -- correcting JV, once created
        AppliedAt           DATETIME       NOT NULL DEFAULT GETDATE(),
        AppliedBy           NVARCHAR(100)  NULL
    );
    CREATE INDEX IX_PartsCostBackfill_Detail ON dms_PartsCostBackfill (StockIssueDetailID);
    CREATE INDEX IX_PartsCostBackfill_Batch  ON dms_PartsCostBackfill (BatchTag);
    PRINT '127: created dms_PartsCostBackfill.';
END
ELSE
    PRINT '127: dms_PartsCostBackfill already exists.';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_VoucherInfo_SourceDocType')
BEGIN
    DECLARE @def NVARCHAR(MAX) = (SELECT definition FROM sys.check_constraints WHERE name = 'CK_VoucherInfo_SourceDocType');
    IF @def NOT LIKE '%PARTS_COST_CORRECTION%'
    BEGIN
        ALTER TABLE data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
        PRINT '127: dropped old CK_VoucherInfo_SourceDocType.';
    END
    ELSE
        PRINT '127: constraint already includes PARTS_COST_CORRECTION.';
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
        OR [SourceDocType]='FIXED_ASSET_DEPRECIATION' OR [SourceDocType]='PARTS_COST_CORRECTION'));
    ALTER TABLE data_FinanceVoucherInfo CHECK CONSTRAINT CK_VoucherInfo_SourceDocType;
    PRINT '127: recreated CK_VoucherInfo_SourceDocType with PARTS_COST_CORRECTION added.';
END
GO

PRINT '127_parts_cost_backfill_audit complete.';
