-- =====================================================================
-- 120_import_legacy_vehicle_sales_customers.sql
-- Imports the ~337 legacy vehicle-sales customers that only exist as GL
-- sub-accounts under 201002 "CUSTOMER ADVANCES - VEHICLE PARTIES" into
-- real gen_PartiesInfo party records, so the new Booking screen's
-- customer picker can actually find and book against them.
--
-- Owner report 2026-08-07: the Booking customer picker showed every party
-- in the system instead of genuine vehicle-purchase customers. Turned out
-- the real vehicle customers were never migrated into gen_PartiesInfo at
-- all -- the old FIS system gave each vehicle customer their own dedicated
-- GL leaf account under 201002 (e.g. "201002002 MUHAMMAD RAMEEZ LIAQAT
-- CNIC:36302-7407452-1") instead of a shared control account with
-- party-level subsidiary tracking. Owner confirmed: import all of them
-- as PartyName = the raw GL title text (no CNIC parsing -- titles are too
-- inconsistently formatted to parse reliably), each linked back to its own
-- specific leaf account via PartyGLID so existing GL history stays
-- correctly attributed.
--
-- Excludes 201002 itself (the parent) and 201002998/201002999, which are
-- new Sales-module system accounts (Vehicle Premium Deferred / Booking
-- Advance Received), not customers.
--
-- Idempotent: skips any leaf that's already linked to a party (PartyGLID
-- has a UNIQUE constraint, so a naive re-run would fail without this).
-- =====================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

INSERT INTO gen_PartiesInfo (PartyName, PartyType, PartyGLID, ReadOnly)
SELECT
    LEFT(c.GLTitle, 100) AS PartyName,
    'Customer'           AS PartyType,
    c.GLCAID             AS PartyGLID,
    0                    AS ReadOnly
FROM GLChartOFAccount c
WHERE c.GLCode LIKE '201002%'
  AND c.GLCode <> '201002'
  AND c.GLLevel = 4
  AND c.Status = 1
  AND c.GLCode NOT IN ('201002998', '201002999')
  AND NOT EXISTS (
      SELECT 1 FROM gen_PartiesInfo p WHERE p.PartyGLID = c.GLCAID
  );

PRINT CONCAT(@@ROWCOUNT, ' legacy vehicle-sales customers imported from GL 201002 sub-accounts.');
PRINT '120_import_legacy_vehicle_sales_customers complete.';
