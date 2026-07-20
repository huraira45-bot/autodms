-- Ad-hoc report: customers who have opened more than one job card on the
-- same vehicle (owner ask 2026-07-20). Run on the LIVE DB — dev has ~5
-- rows and returns nothing useful.
--
-- Run:  sqlcmd -S localhost -d temp_db1 -E -W -i ad-hoc\repeat_vehicle_jobcards.sql -o repeat_vehicles.txt
--
-- The grouping key is (EndUserID, VehicleRegNo). If a customer sold the
-- vehicle and a new owner also brought it in under their own profile,
-- that shows up as two different rows — which is what we want; we're
-- surfacing "customers with repeat visits on one of their vehicles",
-- not "vehicles with many owners".

SET NOCOUNT ON;

--------------------------------------------------------------------
-- 1) Summary: top 50 (customer, vehicle) pairs by visit count
--------------------------------------------------------------------
;WITH v AS (
    SELECT  j.EndUserID,
            j.VehicleRegNo,
            COUNT(*)                                              AS VisitCount,
            MIN(j.JobCardDate)                                    AS FirstVisit,
            MAX(j.JobCardDate)                                    AS LastVisit,
            DATEDIFF(DAY, MIN(j.JobCardDate), MAX(j.JobCardDate)) AS SpanDays,
            SUM(CASE WHEN ISNULL(j.IsFinalized,0)=1 THEN 1 ELSE 0 END) AS Finalized,
            SUM(CASE WHEN ISNULL(j.IsFinalized,0)=0 THEN 1 ELSE 0 END) AS Draft
    FROM    Addata_JobCardInfo j
    WHERE   ISNULL(j.VehicleRegNo,'') <> ''
    GROUP BY j.EndUserID, j.VehicleRegNo
    HAVING  COUNT(*) >= 2
)
SELECT TOP 50
       v.VisitCount                              AS Visits,
       v.Finalized,
       v.Draft,
       v.VehicleRegNo                            AS RegNo,
       LEFT(ISNULL(c.endUserName,''), 40)        AS Customer,
       c.PhoneNo                                 AS Phone,
       CONVERT(varchar(10), v.FirstVisit, 120)   AS FirstVisit,
       CONVERT(varchar(10), v.LastVisit, 120)    AS LastVisit,
       v.SpanDays                                AS DaysSpan
FROM   v
LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = v.EndUserID
ORDER  BY v.VisitCount DESC, v.LastVisit DESC;

PRINT '';
PRINT '=== Detail — every JC for the (customer, reg) pairs above ===';
PRINT '';

--------------------------------------------------------------------
-- 2) Detail: every JC for those pairs — reg no, date, JC no, type,
--    kilometer, advisor. Useful for spotting comeback / rework
--    patterns (same vehicle back within N days for a similar type).
--------------------------------------------------------------------
;WITH v AS (
    SELECT j.EndUserID, j.VehicleRegNo
    FROM   Addata_JobCardInfo j
    WHERE  ISNULL(j.VehicleRegNo,'') <> ''
    GROUP  BY j.EndUserID, j.VehicleRegNo
    HAVING COUNT(*) >= 2
)
SELECT j.VehicleRegNo                              AS RegNo,
       LEFT(ISNULL(c.endUserName,''), 30)          AS Customer,
       CONVERT(varchar(10), j.JobCardDate, 120)    AS JCDate,
       j.JobCardNo,
       t.CardCode                                  AS Type,
       j.KiloMeter                                 AS Odo,
       LEFT(ISNULL(j.ServiceAdvisor,''), 20)       AS Advisor,
       CASE WHEN ISNULL(j.IsFinalized,0)=1 THEN 'FIN' ELSE 'DRAFT' END AS Stat
FROM   Addata_JobCardInfo j
JOIN   v                     ON v.EndUserID = j.EndUserID AND v.VehicleRegNo = j.VehicleRegNo
LEFT   JOIN gen_JobCardType   t ON t.JobCardTypeId = j.JobTypeId
LEFT   JOIN addata_CustomerInfo c ON c.ProfileID   = j.EndUserID
ORDER  BY j.VehicleRegNo, j.JobCardDate DESC, j.JobCardId DESC;
