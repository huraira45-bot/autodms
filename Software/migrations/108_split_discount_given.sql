-- ================================================================
-- 108 — Split DEFAULT_DISCOUNT_GIVEN into Service (Job Card) vs Store
--        Sale discount accounts
-- ================================================================
-- Owner ask 2026-08-01: Job Card and Store Sale discounts currently hit
-- the same GL account (DEFAULT_DISCOUNT_GIVEN). Wants them separate so
-- each can be tracked/reported independently.
--
-- New roles: SERVICE_DISCOUNT_GIVEN (Job Card), STORE_SALE_DISCOUNT_GIVEN
-- (Store Sale + SSR, since SSR reverses a Store Sale). DEFAULT_DISCOUNT_GIVEN
-- stays registered (legacy/historical only — old vouchers already posted
-- against it) but the posting code no longer resolves it going forward.
--
-- Both new roles are seeded to whatever GLCAID DEFAULT_DISCOUNT_GIVEN
-- currently points to (if any) -- NOT split apart yet -- so this deploy
-- doesn't break Job Card / Store Sale finalize (which would otherwise
-- start failing immediately with "system account not configured" until
-- someone maps them). The owner can re-point either one to a different
-- account whenever they're ready, via Accounting Setup -- no urgency.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
PRINT '=== 108_split_discount_given ===';

-- Extend the RoleKey whitelist (same drop+recreate-with-NOCHECK pattern as
-- migrations 032/040/045/055/067 — NOCHECK grandfathers in any existing
-- rows not in this list, so nothing already assigned gets rejected).
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SystemAccounts_RoleKey')
    ALTER TABLE dms_SystemAccounts DROP CONSTRAINT CK_SystemAccounts_RoleKey;
GO

ALTER TABLE dms_SystemAccounts WITH NOCHECK ADD CONSTRAINT CK_SystemAccounts_RoleKey CHECK (
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
        'COGS_PARTS','SUBLET_COST','TRADE_DEBTORS','TRADE_CREDITORS',
        'PAINT_INVENTORY','PAINT_CONSUMPTION',
        -- New (owner ask 2026-08-01):
        'SERVICE_DISCOUNT_GIVEN','STORE_SALE_DISCOUNT_GIVEN'
    )
);
PRINT '  CK_SystemAccounts_RoleKey rebuilt (SERVICE_DISCOUNT_GIVEN, STORE_SALE_DISCOUNT_GIVEN added).';
GO

-- Seed both new roles from the current DEFAULT_DISCOUNT_GIVEN mapping, if
-- one exists, so behaviour is unchanged until the owner deliberately
-- re-points one of them.
IF EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey = 'DEFAULT_DISCOUNT_GIVEN')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey = 'SERVICE_DISCOUNT_GIVEN')
    BEGIN
        INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName)
        SELECT 'SERVICE_DISCOUNT_GIVEN', GLCAID, 'migration-108 (copied from DEFAULT_DISCOUNT_GIVEN)'
        FROM dms_SystemAccounts WHERE RoleKey = 'DEFAULT_DISCOUNT_GIVEN';
        PRINT '  SERVICE_DISCOUNT_GIVEN seeded from DEFAULT_DISCOUNT_GIVEN.';
    END
    ELSE
        PRINT '  SERVICE_DISCOUNT_GIVEN already mapped — left as-is.';

    IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey = 'STORE_SALE_DISCOUNT_GIVEN')
    BEGIN
        INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName)
        SELECT 'STORE_SALE_DISCOUNT_GIVEN', GLCAID, 'migration-108 (copied from DEFAULT_DISCOUNT_GIVEN)'
        FROM dms_SystemAccounts WHERE RoleKey = 'DEFAULT_DISCOUNT_GIVEN';
        PRINT '  STORE_SALE_DISCOUNT_GIVEN seeded from DEFAULT_DISCOUNT_GIVEN.';
    END
    ELSE
        PRINT '  STORE_SALE_DISCOUNT_GIVEN already mapped — left as-is.';
END
ELSE
    PRINT '  DEFAULT_DISCOUNT_GIVEN was never mapped — SERVICE_DISCOUNT_GIVEN / STORE_SALE_DISCOUNT_GIVEN left unmapped. Map both in Accounting Setup before finalizing a Job Card or Store Sale.';

PRINT '=== 108_split_discount_given: done ===';
