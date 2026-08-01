-- 110_voucher_line_department_tagging.sql
-- Owner ask 2026-08-01 (follow-up to migration 109): department tagging
-- moves from the whole voucher down to each individual voucher LINE, so a
-- JV that mixes an expense line with a non-expense line (or two expense
-- lines belonging to different departments) can be tagged precisely. Adds
-- an explicit IsExpense flag per line too, so a line the owner doesn't want
-- to attribute to a department (the cash/bank settlement leg, an asset/
-- liability leg, a correction JV, etc.) can be marked "not an expense" and
-- drop out of the tagging queue without needing a department at all.
--
-- data_FinanceVoucherInfo.DepartmentID (migration 109) is left in place but
-- no longer written to by new code -- superseded by line-level tagging.
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'data_FinanceVoucherDetail' AND COLUMN_NAME = 'DepartmentID'
)
BEGIN
    ALTER TABLE data_FinanceVoucherDetail ADD DepartmentID INT NULL;
    PRINT 'Added DepartmentID to data_FinanceVoucherDetail.';
END
ELSE
    PRINT 'DepartmentID already exists on data_FinanceVoucherDetail.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_VoucherDetail_Department'
)
BEGIN
    ALTER TABLE data_FinanceVoucherDetail
        ADD CONSTRAINT FK_VoucherDetail_Department
        FOREIGN KEY (DepartmentID) REFERENCES gen_DepartmentInfo(DepartmentID);
    PRINT 'Added FK_VoucherDetail_Department.';
END
ELSE
    PRINT 'FK_VoucherDetail_Department already exists.';
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'data_FinanceVoucherDetail' AND COLUMN_NAME = 'IsExpense'
)
BEGIN
    -- NULL = undecided (still needs review), 1 = confirmed expense (needs a
    -- department), 0 = confirmed NOT an expense (skip, no department needed).
    ALTER TABLE data_FinanceVoucherDetail ADD IsExpense BIT NULL;
    PRINT 'Added IsExpense to data_FinanceVoucherDetail.';
END
ELSE
    PRINT 'IsExpense already exists on data_FinanceVoucherDetail.';
GO

-- One-time courtesy backfill: anyone who already tagged a whole voucher via
-- the migration-109 header field gets that department copied down onto its
-- in-scope lines (Debit > 0, Operating Expense 502xxx), so nothing already
-- tagged goes back to "needs department" after this change.
UPDATE d
SET d.DepartmentID = v.DepartmentID, d.IsExpense = 1
FROM data_FinanceVoucherDetail d
JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
JOIN GLChartOFAccount c ON c.GLCAID = d.GLCAID
WHERE v.DepartmentID IS NOT NULL
  AND d.DepartmentID IS NULL
  AND d.Debit > 0
  AND c.GLCode LIKE '502%';
PRINT 'Backfilled line-level DepartmentID from any existing header-level tags: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' line(s).';

PRINT '110_voucher_line_department_tagging complete.';
