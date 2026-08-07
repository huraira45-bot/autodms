-- =====================================================================
-- 120_vehicle_sales_business_access.sql
-- Adds VEHICLE_SALES as a valid dms_PartyBusinessAccess business line, and
-- bootstraps it for every party already tagged with the legacy GL account
-- 201002 "CUSTOMER ADVANCES - VEHICLE PARTIES" (gen_PartiesInfo.PartyGLID).
--
-- Owner report 2026-08-07: the new Booking customer picker showed every
-- party in the system (workshop/parts trade accounts included) instead of
-- just genuine vehicle-purchase customers -- "show the customer from this
-- [201002] not our parties". The party-business-access mechanism already
-- exists (WORKSHOP/SALES/PROCUREMENT/SUBLET/PAINT_LAB, strict opt-in) but
-- had no Vehicle Sales option yet. This bootstraps it from the pre-existing
-- legacy tagging so the picker has real data on day one; going forward,
-- newly booking-created customers are auto-granted (see NewBooking.jsx),
-- and existing ones can be managed via Settings > Party Business Access.
--
-- Idempotent: safe to re-run.
-- =====================================================================
SET NOCOUNT ON;

IF EXISTS (
    SELECT 1
    FROM   sys.check_constraints
    WHERE  name = 'CK_PBA_Business'
      AND  definition NOT LIKE '%VEHICLE_SALES%'
)
BEGIN
    PRINT 'Rebuilding CK_PBA_Business to include VEHICLE_SALES...';
    ALTER TABLE dbo.dms_PartyBusinessAccess DROP CONSTRAINT CK_PBA_Business;
    ALTER TABLE dbo.dms_PartyBusinessAccess ADD CONSTRAINT CK_PBA_Business
        CHECK (BusinessKey IN ('WORKSHOP','SALES','PROCUREMENT','SUBLET','PAINT_LAB','VEHICLE_SALES'));
END
ELSE
    PRINT 'CK_PBA_Business already includes VEHICLE_SALES.';

INSERT INTO dms_PartyBusinessAccess (PartyID, BusinessKey, GrantedByUserID)
SELECT p.PartyID, 'VEHICLE_SALES', NULL
FROM gen_PartiesInfo p
JOIN GLChartOFAccount c ON p.PartyGLID = c.GLCAID
WHERE c.GLCode = '201002'
  AND NOT EXISTS (
      SELECT 1 FROM dms_PartyBusinessAccess pba
      WHERE pba.PartyID = p.PartyID AND pba.BusinessKey = 'VEHICLE_SALES'
  );
PRINT CONCAT(@@ROWCOUNT, ' parties bootstrapped into VEHICLE_SALES from legacy GL 201002 tagging.');

PRINT '120_vehicle_sales_business_access complete.';
