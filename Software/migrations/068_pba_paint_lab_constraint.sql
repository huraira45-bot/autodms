-- =====================================================================
-- 068_pba_paint_lab_constraint.sql
-- Extend CK_PBA_Business to allow PAINT_LAB.
--
-- 067_paint_lab_foundation.sql added PAINT_LAB as a valid business
-- option in partyController.js's `valid` whitelist, but left the DB
-- CHECK constraint on dms_PartyBusinessAccess.BusinessKey untouched.
-- Result: granting Paint Lab access to a party fails with
--   "The INSERT statement conflicted with the CHECK constraint
--    CK_PBA_Business" on column BusinessKey.
--
-- Idempotent: only rebuilds the constraint if PAINT_LAB isn't already
-- in its definition. Safe to re-run.
-- =====================================================================
SET NOCOUNT ON;

IF EXISTS (
    SELECT 1
    FROM   sys.check_constraints
    WHERE  name = 'CK_PBA_Business'
      AND  definition NOT LIKE '%PAINT_LAB%'
)
BEGIN
    PRINT 'Rebuilding CK_PBA_Business to include PAINT_LAB...';
    ALTER TABLE dbo.dms_PartyBusinessAccess DROP CONSTRAINT CK_PBA_Business;
    ALTER TABLE dbo.dms_PartyBusinessAccess ADD CONSTRAINT CK_PBA_Business
        CHECK (BusinessKey IN ('WORKSHOP','SALES','PROCUREMENT','SUBLET','PAINT_LAB'));
    PRINT '068_pba_paint_lab_constraint applied.';
END
ELSE
BEGIN
    PRINT '068_pba_paint_lab_constraint already applied (no-op).';
END
