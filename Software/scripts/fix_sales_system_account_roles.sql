-- =====================================================================
-- fix_sales_system_account_roles.sql
--
-- 5 of the Sales module's dms_SystemAccounts role mappings point at
-- GLCAIDs that don't exist in GLChartOFAccount at all (see memory
-- "sales-gl-seed-gap" — migrations 032/033 were supposed to insert 12 new
-- COA leaves and never actually did). Confirmed by cross-checking every
-- resolveRole() call in the Sales posting services against the current
-- (agency-model) code — 6 other roles in that same original backlog
-- (VEHICLE_INVENTORY, MASTER_VEHICLE_PAYABLE, COGS_VEHICLES,
-- VEHICLE_SALE_REVENUE, VEHICLE_SALES_DISCOUNT, BOOKING_CLEARING) are
-- vestigial from a pre-agency-model design and are no longer called by
-- anything — deliberately left broken, not touched here.
--
-- Owner report 2026-08-07: Master Invoice voucher displayed as "0 lines /
-- 0.00" because getVoucher's line-fetch INNER JOINs to GLChartOFAccount,
-- silently dropping any line whose GLCAID doesn't resolve to a real
-- account — the data was actually there, just invisible.
--
-- Two of the five need brand-new leaves; three already have a suitable
-- pre-existing account in the real (legacy-derived) chart and just need
-- re-pointing. Looked up by GLCode, not hardcoded GLCAID, since dev/live
-- are separately-seeded databases where the same GLCode can have a
-- different GLCAID.
--
-- Idempotent: safe to re-run.
-- =====================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

-- ---------------------------------------------------------------------
-- 1. MASTER_INCENTIVE_RECEIVABLE — new leaf under 102009 TRADE
--    RECEIVABLES - VEHICLE PARTIES (same parent BOOKING_RECEIVABLE
--    already lives under, from the 2026-06-19 fix).
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '102009002')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour,
         AccountLevelFive, AccountLevelSix, AccountLevelSeven, AccountLevelEight,
         AccountLevelNine, AccountLevelTen, GLLevel, ReadOnly)
    VALUES
        ('102009002', 'MASTER INCENTIVE RECEIVABLE', 0, 0, 1, 1, 1,
         '01', '0', '0', '0', '0', '0', '0', '0', '0', '0', 4, 0);
    PRINT 'Created 102009002 MASTER INCENTIVE RECEIVABLE.';
END

UPDATE sa SET sa.GLCAID = c.GLCAID
FROM dms_SystemAccounts sa
JOIN GLChartOFAccount c ON c.GLCode = '102009002'
WHERE sa.RoleKey = 'MASTER_INCENTIVE_RECEIVABLE';
PRINT 'MASTER_INCENTIVE_RECEIVABLE -> 102009002.';

-- ---------------------------------------------------------------------
-- 2. MASTER_INCENTIVE_INCOME — new leaf under 401001 INCOME - SALES
--    DEPARTMENT (sibling of PREMIUM ON SALES OF VEHICLE / COMMISSION
--    INCOME SALE, which already live there).
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '401001007')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour,
         AccountLevelFive, AccountLevelSix, AccountLevelSeven, AccountLevelEight,
         AccountLevelNine, AccountLevelTen, GLLevel, ReadOnly)
    VALUES
        ('401001007', 'MASTER INCENTIVE INCOME', 0, 0, 2, 1, 1,
         '01', '0', '0', '0', '0', '0', '0', '0', '0', '0', 4, 0);
    PRINT 'Created 401001007 MASTER INCENTIVE INCOME.';
END

UPDATE sa SET sa.GLCAID = c.GLCAID
FROM dms_SystemAccounts sa
JOIN GLChartOFAccount c ON c.GLCode = '401001007'
WHERE sa.RoleKey = 'MASTER_INCENTIVE_INCOME';
PRINT 'MASTER_INCENTIVE_INCOME -> 401001007.';

-- ---------------------------------------------------------------------
-- 3. PREMIUM_INCOME — re-point to the existing legacy leaf
--    401001004 PREMIUM ON SALES OF VEHICLE (already exactly matches
--    this role's purpose — no new account needed).
-- ---------------------------------------------------------------------
UPDATE sa SET sa.GLCAID = c.GLCAID
FROM dms_SystemAccounts sa
JOIN GLChartOFAccount c ON c.GLCode = '401001004'
WHERE sa.RoleKey = 'PREMIUM_INCOME';
PRINT 'PREMIUM_INCOME -> 401001004 (existing PREMIUM ON SALES OF VEHICLE).';

-- ---------------------------------------------------------------------
-- 4. STAFF_INCENTIVE_EXPENSE — re-point to the existing legacy leaf
--    502004005 EMPLOYEE INCENTIVE EXPENSE (SALES).
-- ---------------------------------------------------------------------
UPDATE sa SET sa.GLCAID = c.GLCAID
FROM dms_SystemAccounts sa
JOIN GLChartOFAccount c ON c.GLCode = '502004005'
WHERE sa.RoleKey = 'STAFF_INCENTIVE_EXPENSE';
PRINT 'STAFF_INCENTIVE_EXPENSE -> 502004005 (existing EMPLOYEE INCENTIVE EXPENSE (SALES)).';

-- ---------------------------------------------------------------------
-- 5. STAFF_INCENTIVE_PAYABLE — new leaf under 201001 TRADE PAYABLES
--    (SUPPLIERS & STATUTORY), sibling of SALARY PAYABLE / EOBI PAYABLE
--    which already live there.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '201001013')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour,
         AccountLevelFive, AccountLevelSix, AccountLevelSeven, AccountLevelEight,
         AccountLevelNine, AccountLevelTen, GLLevel, ReadOnly)
    VALUES
        ('201001013', 'STAFF INCENTIVE PAYABLE (SALES)', 0, 0, 2, 1, 1,
         '01', '0', '0', '0', '0', '0', '0', '0', '0', '0', 4, 0);
    PRINT 'Created 201001013 STAFF INCENTIVE PAYABLE (SALES).';
END

UPDATE sa SET sa.GLCAID = c.GLCAID
FROM dms_SystemAccounts sa
JOIN GLChartOFAccount c ON c.GLCode = '201001013'
WHERE sa.RoleKey = 'STAFF_INCENTIVE_PAYABLE';
PRINT 'STAFF_INCENTIVE_PAYABLE -> 201001013.';

PRINT 'fix_sales_system_account_roles complete.';
