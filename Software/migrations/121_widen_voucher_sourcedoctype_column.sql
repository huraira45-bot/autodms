-- =====================================================================
-- 121_widen_voucher_sourcedoctype_column.sql
--
-- data_FinanceVoucherInfo.SourceDocType has been NVARCHAR(20) since its
-- original migration (001_accounting_foundation.sql), but the
-- CK_VoucherInfo_SourceDocType CHECK constraint has since been widened by
-- many later migrations to allow values longer than 20 characters --
-- notably MASTER_INCENTIVE_RECEIPT (24 chars) and SALES_INCENTIVE_ACCRUAL
-- (23 chars). Nobody ever widened the COLUMN itself to match.
--
-- Effect: any INSERT with one of those two SourceDocType values gets
-- silently truncated to fit the 20-char column (e.g. "MASTER_INCENTIVE_REC"),
-- which then fails CK_VoucherInfo_SourceDocType because the truncated string
-- isn't itself a listed value -- surfaces as a CHECK constraint violation
-- that looks unrelated to column size.
--
-- Owner report 2026-08-08: recording a Master Incentive receipt failed this
-- way. SALES_INCENTIVE_ACCRUAL has the same problem -- and now that
-- STAFF_INCENTIVE_EXPENSE/STAFF_INCENTIVE_PAYABLE are correctly mapped
-- (fix_sales_system_account_roles.sql, same day), postAccrualVoucher no
-- longer short-circuits on SYSTEM_ACCOUNT_NOT_CONFIGURED and actually
-- reaches this INSERT -- salesIncentiveController.accrueForBooking does NOT
-- swallow this error, so it would roll back the ENTIRE booking-creation or
-- negotiation-approval transaction it's called from.
--
-- Widens to NVARCHAR(50) -- matches the size already used for this same
-- column-purpose elsewhere (dms_SalesPayments.PaymentMode etc.) and gives
-- real headroom so this class of bug can't recur from a merely-longer key.
--
-- Idempotent: only alters if still NVARCHAR(20).
-- =====================================================================
SET NOCOUNT ON;

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'data_FinanceVoucherInfo' AND COLUMN_NAME = 'SourceDocType'
      AND CHARACTER_MAXIMUM_LENGTH = 20
)
BEGIN
    PRINT 'Widening data_FinanceVoucherInfo.SourceDocType from NVARCHAR(20) to NVARCHAR(50)...';

    -- IX_VoucherInfo_Source (SourceDocType, SourceDocID) depends on the
    -- column and blocks ALTER COLUMN -- drop and recreate identically.
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VoucherInfo_Source')
        DROP INDEX IX_VoucherInfo_Source ON dbo.data_FinanceVoucherInfo;

    ALTER TABLE dbo.data_FinanceVoucherInfo ALTER COLUMN SourceDocType NVARCHAR(50) NULL;

    CREATE NONCLUSTERED INDEX IX_VoucherInfo_Source
        ON dbo.data_FinanceVoucherInfo (SourceDocType, SourceDocID);

    PRINT '121_widen_voucher_sourcedoctype_column applied.';
END
ELSE
    PRINT '121_widen_voucher_sourcedoctype_column already applied (no-op).';
