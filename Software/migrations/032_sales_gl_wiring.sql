/*
 * Migration 032 — Sales module GL wiring
 *
 * Adds the Chart-of-Account leaves, system-account roles, and ledger columns
 * required to post sales-side activity into GL (data_FinanceVoucherInfo /
 * data_FinanceVoucherDetail / dms_PartyLedger) following the §14 framework.
 *
 * 1. New COA leaves under existing parents (Current Assets, Current Liabilities,
 *    Revenue, COGS, Operating Expenses) — vehicle inventory, booking receivable,
 *    incentive receivable, vehicle payable, booking advance, staff payable,
 *    vehicle sales revenue, premium income, Master incentive earned,
 *    COGS-vehicles, staff incentive expense, sales discount given.
 * 2. New system-account RoleKey entries for code resolution (resolveRole).
 * 3. BookingID column on dms_PartyLedger so per-booking receivable balances
 *    can be queried.
 * 4. BookingID column on data_FinanceVoucherDetail for line-level traceability.
 *
 * Note: no role is auto-bound to a GLCAID — admin must map each in
 *       Accounting › System Accounts (same pattern as workshop roles).
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- 1. New COA leaves
-- =========================================================================
DECLARE @parentCA   INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='101');
DECLARE @parentCL   INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='201');
DECLARE @parentRev  INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='4');
DECLARE @parentCOGS INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='501');
DECLARE @parentOpEx INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='503');

-- 1a. Vehicle Sales Revenue header (parent under REVENUE)
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='402')
BEGIN
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Status, Companyid, AccountLevelOne, AccountLevelTwo, GLLevel)
    VALUES ('402', 'Vehicle Sales Revenue', 0, 1, 2, 1, 1, '01', '0', 2);
END

DECLARE @parentVehRev INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='402');

-- 1b. Leaf accounts
DECLARE @leaves TABLE (
    GLCode NVARCHAR(50),
    GLTitle NVARCHAR(200),
    GLNature TINYINT,    -- 1=Debit, 2=Credit
    GLLevel INT
);

INSERT INTO @leaves VALUES
    ('101009', 'Vehicle Inventory',              1, 3),
    ('101010', 'Booking Receivable',             1, 3),
    ('101011', 'Master Incentive Receivable',    1, 3),
    ('201005', 'Master Vehicle Payable',         2, 3),
    ('201006', 'Booking Advance Received',       2, 3),
    ('201007', 'Staff Incentive Payable',        2, 3),
    ('402001', 'Vehicle Sales Revenue',          2, 3),
    ('402002', 'Premium Income',                 2, 3),
    ('402003', 'Master Incentive Income',        2, 3),
    ('501002', 'COGS - Vehicles',                1, 3),
    ('503004', 'Staff Incentive Expense',        1, 3),
    ('503005', 'Sales Discount Given',           1, 3);

INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Status, Companyid, AccountLevelOne, AccountLevelTwo, GLLevel)
SELECT l.GLCode, l.GLTitle, 0, 0, l.GLNature, 1, 1, '01', '0', l.GLLevel
FROM @leaves l
WHERE NOT EXISTS (SELECT 1 FROM GLChartOFAccount c WHERE c.GLCode = l.GLCode);

PRINT 'Added sales COA leaves (skipped any that already existed)';

-- =========================================================================
-- 2. New system-account role keys (one row per role; GLCAID stays NULL
--    until admin maps it via the Accounting › System Accounts page).
--    The dms_SystemAccounts table has a UNIQUE constraint on RoleKey so the
--    NOT EXISTS check is purely defensive.
-- =========================================================================
DECLARE @roles TABLE (RoleKey NVARCHAR(50));
INSERT INTO @roles VALUES
    ('VEHICLE_INVENTORY'),
    ('BOOKING_RECEIVABLE'),
    ('BOOKING_ADVANCE'),
    ('MASTER_VEHICLE_PAYABLE'),
    ('MASTER_INCENTIVE_RECEIVABLE'),
    ('STAFF_INCENTIVE_PAYABLE'),
    ('VEHICLE_SALES_REVENUE'),
    ('PREMIUM_INCOME'),
    ('MASTER_INCENTIVE_INCOME'),
    ('COGS_VEHICLES'),
    ('STAFF_INCENTIVE_EXPENSE'),
    ('SALES_DISCOUNT_GIVEN');

-- We only insert role rows that don't already exist. The GLCAID is left NULL
-- because admin must map them. NOTE: the dms_SystemAccounts table requires
-- AssignedBy/AssignedByName even on initial insert — we use system-bootstrap
-- markers so it's clear the mapping has never been administratively set.
IF OBJECT_ID('dbo.dms_SystemAccounts','U') IS NOT NULL
BEGIN
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName, AssignedAt)
    SELECT r.RoleKey, NULL, 0, '[bootstrap — needs admin mapping]', GETDATE()
    FROM @roles r
    WHERE NOT EXISTS (SELECT 1 FROM dms_SystemAccounts s WHERE s.RoleKey = r.RoleKey);
END

PRINT 'Inserted sales system-account role rows (unmapped — admin must assign GLCAID)';

-- =========================================================================
-- 3. dms_PartyLedger.BookingID — for per-booking receivable subsidiary balance
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.dms_PartyLedger') AND name='BookingID')
BEGIN
    ALTER TABLE dbo.dms_PartyLedger ADD BookingID INT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id=OBJECT_ID('dbo.dms_PartyLedger') AND name='FK_dmsPartyLedger_Booking'
)
BEGIN
    ALTER TABLE dbo.dms_PartyLedger
      ADD CONSTRAINT FK_dmsPartyLedger_Booking
      FOREIGN KEY (BookingID) REFERENCES dms_SalesBookings(BookingID);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_dmsPartyLedger_Booking' AND object_id=OBJECT_ID('dbo.dms_PartyLedger'))
BEGIN
    CREATE INDEX IX_dmsPartyLedger_Booking ON dbo.dms_PartyLedger(BookingID) WHERE BookingID IS NOT NULL;
END
GO

-- =========================================================================
-- 4. data_FinanceVoucherDetail.BookingID — for line-level booking traceability
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.data_FinanceVoucherDetail') AND name='BookingID')
BEGIN
    ALTER TABLE dbo.data_FinanceVoucherDetail ADD BookingID INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FinVoucherDetail_Booking' AND object_id=OBJECT_ID('dbo.data_FinanceVoucherDetail'))
BEGIN
    CREATE INDEX IX_FinVoucherDetail_Booking ON dbo.data_FinanceVoucherDetail(BookingID) WHERE BookingID IS NOT NULL;
END
GO

-- =========================================================================
-- 5a. Widen CK_SystemAccounts_RoleKey to accept the new sales roles
--     (the constraint hardcodes the legal role-key list; we drop+recreate).
-- =========================================================================
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SystemAccounts_RoleKey')
BEGIN
    ALTER TABLE dms_SystemAccounts DROP CONSTRAINT CK_SystemAccounts_RoleKey;
END
GO

ALTER TABLE dms_SystemAccounts ADD CONSTRAINT CK_SystemAccounts_RoleKey CHECK (
    RoleKey IN (
        -- workshop / shared roles (original set)
        'CASH_BOOK', 'GENERAL_CUSTOMER', 'GST_PAYABLE', 'INPUT_GST', 'PST_PAYABLE',
        'POS_CLEARING', 'DEFAULT_DISCOUNT_GIVEN', 'ROUNDING_ADJUSTMENT',
        'PURCHASE_RETURN_VARIANCE', 'CUSTOMER_ADVANCE_RECEIVED', 'SUPPLIER_ADVANCE_PAID',
        'CHEQUES_ON_HAND',
        -- sales roles (migration 032)
        'VEHICLE_INVENTORY', 'BOOKING_RECEIVABLE', 'BOOKING_ADVANCE',
        'MASTER_VEHICLE_PAYABLE', 'MASTER_INCENTIVE_RECEIVABLE',
        'STAFF_INCENTIVE_PAYABLE', 'VEHICLE_SALES_REVENUE', 'PREMIUM_INCOME',
        'MASTER_INCENTIVE_INCOME', 'COGS_VEHICLES', 'STAFF_INCENTIVE_EXPENSE',
        'SALES_DISCOUNT_GIVEN'
    )
);
GO

-- =========================================================================
-- 5. dms_SalesBookings — add DeliveryVoucherID for traceability
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.dms_SalesBookings') AND name='DeliveryVoucherID')
BEGIN
    ALTER TABLE dbo.dms_SalesBookings ADD DeliveryVoucherID INT NULL;
END
GO

PRINT 'Migration 032 complete — sales COA + roles + ledger BookingID columns ready.';
GO
