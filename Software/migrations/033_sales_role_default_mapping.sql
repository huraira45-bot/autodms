/*
 * Migration 033 — convenience default-mapping of sales roles to the
 * sales-specific COA leaves added in migration 032.
 *
 * This is OPTIONAL — admin can override any of these via the System Accounts UI.
 * It exists so a fresh DB has a working GL chain immediately for the sales
 * module, instead of requiring 12 manual mappings before the first booking.
 *
 * Pairings:
 *   VEHICLE_INVENTORY            → 101009
 *   BOOKING_RECEIVABLE           → 101010
 *   MASTER_INCENTIVE_RECEIVABLE  → 101011
 *   MASTER_VEHICLE_PAYABLE       → 201005
 *   BOOKING_ADVANCE              → 201006
 *   STAFF_INCENTIVE_PAYABLE      → 201007
 *   VEHICLE_SALES_REVENUE        → 402001
 *   PREMIUM_INCOME               → 402002
 *   MASTER_INCENTIVE_INCOME      → 402003
 *   COGS_VEHICLES                → 501002
 *   STAFF_INCENTIVE_EXPENSE      → 503004
 *   SALES_DISCOUNT_GIVEN         → 503005
 */

SET QUOTED_IDENTIFIER ON;

DECLARE @pairs TABLE (RoleKey NVARCHAR(50), GLCode NVARCHAR(50));
INSERT INTO @pairs VALUES
    ('VEHICLE_INVENTORY',           '101009'),
    ('BOOKING_RECEIVABLE',          '101010'),
    ('MASTER_INCENTIVE_RECEIVABLE', '101011'),
    ('MASTER_VEHICLE_PAYABLE',      '201005'),
    ('BOOKING_ADVANCE',             '201006'),
    ('STAFF_INCENTIVE_PAYABLE',     '201007'),
    ('VEHICLE_SALES_REVENUE',       '402001'),
    ('PREMIUM_INCOME',              '402002'),
    ('MASTER_INCENTIVE_INCOME',     '402003'),
    ('COGS_VEHICLES',               '501002'),
    ('STAFF_INCENTIVE_EXPENSE',     '503004'),
    ('SALES_DISCOUNT_GIVEN',        '503005');

INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName, AssignedAt)
SELECT p.RoleKey, c.GLCAID, 0, '[bootstrap — migration 033]', GETDATE()
FROM @pairs p
JOIN GLChartOFAccount c ON c.GLCode = p.GLCode
WHERE NOT EXISTS (SELECT 1 FROM dms_SystemAccounts s WHERE s.RoleKey = p.RoleKey);

PRINT 'Migration 033 complete — sales roles bootstrap-mapped to their default COA leaves.';
GO
