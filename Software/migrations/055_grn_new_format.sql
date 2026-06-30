-- 055_grn_new_format.sql
-- New GRN format modeled on the Master Changan Motors sales-tax invoice:
--    columns: gross unit price, two discount tiers, sales tax (GST),
--    advance income tax (236G), and value-inclusive total.
--
-- This migration:
--   1. Seeds two new GL accounts and binds them to system-account roles
--      so the GRN journal builder can resolve them.
--   2. Adds the new per-line columns to data_PurchaseDetail.
--   3. Wipes existing GRN data (headers, details, the stock arrivals they
--      created, and the GL vouchers they posted) — explicit owner request.
--      Opening-stock arrivals (isManual=1) are NOT touched.
SET QUOTED_IDENTIFIER ON;
GO

-- ============================================================
-- 1. New GL accounts
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '401003003')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, GLLevel,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour,
         CompanyID, Status, ReadOnly)
    VALUES ('401003003', 'DISCOUNT RECEIVED ON PARTS', 2, 0, 2, 4,
            '01', '0', '0', '0', 1, 1, 0);
    PRINT 'Created GL 401003003 — DISCOUNT RECEIVED ON PARTS';
END

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '102005008')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, GLLevel,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour,
         CompanyID, Status, ReadOnly)
    VALUES ('102005008', 'ADVANCE TAX ON PARTS 236G', 1, 0, 1, 4,
            '01', '0', '0', '0', 1, 1, 0);
    PRINT 'Created GL 102005008 — ADVANCE TAX ON PARTS 236G';
END

DECLARE @discRecvGLCAID INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='401003003');
DECLARE @ait236GLCAID   INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='102005008');

-- ============================================================
-- 2. System-account role bindings
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='PARTS_DISCOUNT_RECEIVED')
BEGIN
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName, AssignedAt)
    VALUES ('PARTS_DISCOUNT_RECEIVED', @discRecvGLCAID, 'migration 055', GETDATE());
    PRINT 'Bound role PARTS_DISCOUNT_RECEIVED → 401003003';
END

IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='ADVANCE_TAX_236G_PARTS')
BEGIN
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName, AssignedAt)
    VALUES ('ADVANCE_TAX_236G_PARTS', @ait236GLCAID, 'migration 055', GETDATE());
    PRINT 'Bound role ADVANCE_TAX_236G_PARTS → 102005008';
END

-- ============================================================
-- 3. New columns on data_PurchaseDetail
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseDetail' AND COLUMN_NAME='AdditionalDiscountPct')
    ALTER TABLE data_PurchaseDetail ADD AdditionalDiscountPct NUMERIC(8,3) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseDetail' AND COLUMN_NAME='AdditionalDiscountAmount')
    ALTER TABLE data_PurchaseDetail ADD AdditionalDiscountAmount DECIMAL(18,2) NULL;

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseDetail' AND COLUMN_NAME='AITAmount')
    ALTER TABLE data_PurchaseDetail ADD AITAmount DECIMAL(18,2) NULL;

-- ============================================================
-- 4. WIPE existing GRN data (owner-requested)
-- ============================================================
DECLARE @grnCount INT, @voucherCount INT, @arrivalCount INT;

SELECT @grnCount = COUNT(*) FROM data_PurchaseInfo;
SELECT @voucherCount = COUNT(*) FROM data_FinanceVoucherInfo WHERE SourceDocType='GRN';
SELECT @arrivalCount = COUNT(*) FROM data_StockArrivalInfo a
WHERE ISNULL(a.isManual, 0) = 0 AND a.RefID IN (SELECT PurchaseID FROM data_PurchaseInfo);

PRINT 'Wiping ' + CAST(@grnCount AS NVARCHAR(20)) + ' GRN(s), '
    + CAST(@voucherCount AS NVARCHAR(20)) + ' GRN voucher(s), '
    + CAST(@arrivalCount AS NVARCHAR(20)) + ' linked stock arrival(s).';

-- 4a. GL vouchers from GRNs (header + detail + party-ledger)
DECLARE @grnVouchers TABLE (VoucherID INT);
INSERT INTO @grnVouchers SELECT VoucherID FROM data_FinanceVoucherInfo WHERE SourceDocType='GRN';

DELETE FROM dms_PartyLedger
WHERE VoucherID IN (SELECT VoucherID FROM @grnVouchers)
   OR AllocatedToVoucherID IN (SELECT VoucherID FROM @grnVouchers);

DELETE FROM data_FinanceVoucherDetail
WHERE VoucherID IN (SELECT VoucherID FROM @grnVouchers);

DELETE FROM data_FinanceVoucherInfo
WHERE VoucherID IN (SELECT VoucherID FROM @grnVouchers);

-- 4b. Stock arrivals (skip opening-stock manual arrivals)
DECLARE @grnArrivals TABLE (ArrivalID INT);
INSERT INTO @grnArrivals
SELECT ArrivalID FROM data_StockArrivalInfo
WHERE ISNULL(isManual, 0) = 0
  AND RefID IN (SELECT PurchaseID FROM data_PurchaseInfo);

DELETE FROM data_StockArrivalDetail
WHERE ArrivalID IN (SELECT ArrivalID FROM @grnArrivals);

DELETE FROM data_StockArrivalInfo
WHERE ArrivalID IN (SELECT ArrivalID FROM @grnArrivals);

-- 4c. GRN headers + details
DELETE FROM data_PurchaseDetail;
DELETE FROM data_PurchaseInfo;

PRINT '055_grn_new_format.sql complete.';
GO
