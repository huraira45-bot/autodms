-- 045_agency_model_realignment.sql
-- Realigns the Sales accounting from a (wrong) reseller model to the actual
-- agency / facilitator model: Master Changan invoices the customer directly;
-- dealer never owns the vehicle. Dealer revenue = premium + Master incentive.
--
-- New roles:
--   BOOKING_VARIANT_RECEIVABLE (Asset)    — money we've paid Master against
--                                            a booking, until the chassis is
--                                            delivered. Subsidiary by BookingID.
--   PREMIUM_DEFERRED           (Liability) — premium portion held until
--                                            delivery, when it's recognized as
--                                            PREMIUM_INCOME (Decision: defer
--                                            recognition to delivery).
--
-- Deprecated roles (kept in dms_SystemAccounts so historic vouchers resolve,
--   but the new posting services no longer write to them):
--     VEHICLE_INVENTORY, COGS_VEHICLES, VEHICLE_SALES_REVENUE,
--     MASTER_VEHICLE_PAYABLE
--
-- Companion: a one-time JV reverses the wrong legs on voucher #67
-- (BK-2026-0003) — that's a separate cleanup, not in this migration.

DECLARE @CurrentAssetsMaster INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='102006');
DECLARE @CustomerAdvanceParent INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='201002');

IF @CurrentAssetsMaster IS NULL BEGIN RAISERROR('Parent 102006 missing.', 16, 1); RETURN; END
IF @CustomerAdvanceParent IS NULL BEGIN RAISERROR('Parent 201002 missing.', 16, 1); RETURN; END

-- =========================================================================
-- 1. COA leaf — Booking Variant Receivable
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='102006021')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Status, GLLevel, ReadOnly, Companyid,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour)
    SELECT '102006021', 'Booking Variant Receivable (Vehicles Pending Delivery)',
           GLType, 0, GLNature, 1, 4, 0, Companyid,
           AccountLevelOne, AccountLevelTwo, AccountlevelThree, CAST('102006021' AS NVARCHAR(50))
    FROM GLChartOFAccount WHERE GLCAID=@CurrentAssetsMaster;
    PRINT 'Created COA leaf 102006021 (Booking Variant Receivable).';
END

-- =========================================================================
-- 2. COA leaf — Vehicle Premium Deferred
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='201002998')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Status, GLLevel, ReadOnly, Companyid,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour)
    SELECT '201002998', 'Vehicle Premium Deferred (until delivery)',
           GLType, 0, GLNature, 1, 4, 0, Companyid,
           AccountLevelOne, AccountLevelTwo, AccountlevelThree, CAST('201002998' AS NVARCHAR(50))
    FROM GLChartOFAccount WHERE GLCAID=@CustomerAdvanceParent;
    PRINT 'Created COA leaf 201002998 (Premium Deferred).';
END
GO

-- =========================================================================
-- 3. Extend RoleKey whitelist + add the two new role mappings
-- =========================================================================
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SystemAccounts_RoleKey')
    ALTER TABLE dms_SystemAccounts DROP CONSTRAINT CK_SystemAccounts_RoleKey;
GO

ALTER TABLE dms_SystemAccounts ADD CONSTRAINT CK_SystemAccounts_RoleKey CHECK (
    RoleKey IN (
        'CASH_BOOK','GENERAL_CUSTOMER','GST_PAYABLE','INPUT_GST','PST_PAYABLE',
        'POS_CLEARING','DEFAULT_DISCOUNT_GIVEN','ROUNDING_ADJUSTMENT',
        'PURCHASE_RETURN_VARIANCE','CUSTOMER_ADVANCE_RECEIVED','SUPPLIER_ADVANCE_PAID',
        'CHEQUES_ON_HAND','CHEQUES_ISSUED_UNCLEARED',
        'VEHICLE_INVENTORY','BOOKING_RECEIVABLE','BOOKING_ADVANCE',
        'BOOKING_VARIANT_RECEIVABLE','PREMIUM_DEFERRED',
        'MASTER_VEHICLE_PAYABLE','MASTER_INCENTIVE_RECEIVABLE','STAFF_INCENTIVE_PAYABLE',
        'VEHICLE_SALES_REVENUE','PREMIUM_INCOME','MASTER_INCENTIVE_INCOME',
        'COGS_VEHICLES','STAFF_INCENTIVE_EXPENSE','SALES_DISCOUNT_GIVEN',
        'INVENTORY_PARTS','PARTS_REVENUE','SERVICE_REVENUE','SUBLET_REVENUE',
        'COGS_PARTS','SUBLET_COST','TRADE_DEBTORS','TRADE_CREDITORS'
    )
);
GO

DECLARE @BVR INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='102006021');
DECLARE @PD  INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='201002998');

IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='BOOKING_VARIANT_RECEIVABLE')
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName, AssignedAt)
    VALUES ('BOOKING_VARIANT_RECEIVABLE', @BVR, 'migration-045', GETDATE());
ELSE
    UPDATE dms_SystemAccounts SET GLCAID=@BVR WHERE RoleKey='BOOKING_VARIANT_RECEIVABLE';

IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='PREMIUM_DEFERRED')
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName, AssignedAt)
    VALUES ('PREMIUM_DEFERRED', @PD, 'migration-045', GETDATE());
ELSE
    UPDATE dms_SystemAccounts SET GLCAID=@PD WHERE RoleKey='PREMIUM_DEFERRED';
GO

PRINT '045_agency_model_realignment applied.';
