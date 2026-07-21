-- =============================================================================
-- Reassign every Job Card tagged with Service Advisor "MAHNOOR" to
-- "Muhammad Ramzan". Owner ask 2026-07-21.
--
-- Discovery output (autodms_prod on 2026-07-21):
--   - MAHNOOR (ServiceAdvisorID 1006) is tagged on 193 JCs
--   - CreatedBy on every one of those 193 is already Ramzan (UserID 67);
--     Mahnoor has no GLUser login. So the "creator" side needs no change,
--     only the ServiceAdvisor tag.
--   - Muhammad Ramzan (ServiceAdvisorID 1092) is the target advisor.
--
-- Also updates dms_CRO_Complaints.ServiceAdvisor (if that table has any
-- row tagged with Mahnoor) so downstream CRO reports stay consistent.
--
-- Safe to re-run: after the first successful run, subsequent runs report
-- 0 rows affected.
-- =============================================================================
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS       ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @fromName NVARCHAR(100) = N'MAHNOOR';
DECLARE @fromId   INT           = 1006;
DECLARE @toName   NVARCHAR(100) = N'Muhammad Ramzan';
DECLARE @toId     INT           = 1092;

PRINT '=== BEFORE ===';
SELECT ServiceAdvisor, ServiceAdvisorID, COUNT(*) AS JCs
FROM   Addata_JobCardInfo
WHERE  ServiceAdvisor IN (@fromName, @toName) OR ServiceAdvisorID IN (@fromId, @toId)
GROUP  BY ServiceAdvisor, ServiceAdvisorID
ORDER  BY ServiceAdvisor;

BEGIN TRANSACTION;

-- Job Card headers
UPDATE Addata_JobCardInfo
SET    ServiceAdvisor   = @toName,
       ServiceAdvisorID = @toId
WHERE  ServiceAdvisor = @fromName OR ServiceAdvisorID = @fromId;

DECLARE @jcAffected INT = @@ROWCOUNT;

-- CRO Complaints — only if both the table and the ServiceAdvisor column
-- exist on this environment (schema drift is common across dev/live).
DECLARE @croAffected INT = 0;
IF OBJECT_ID('dbo.dms_CRO_Complaints', 'U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID('dbo.dms_CRO_Complaints')
                  AND name = 'ServiceAdvisor')
BEGIN
    EXEC sp_executesql
        N'UPDATE dms_CRO_Complaints SET ServiceAdvisor=@to WHERE ServiceAdvisor=@from',
        N'@to NVARCHAR(100), @from NVARCHAR(100)',
        @to=@toName, @from=@fromName;
    SET @croAffected = @@ROWCOUNT;
END;

COMMIT TRANSACTION;

PRINT '';
PRINT '=== SUMMARY ===';
PRINT 'Addata_JobCardInfo rows reassigned: ' + CAST(@jcAffected  AS NVARCHAR(10));
PRINT 'dms_CRO_Complaints rows reassigned: ' + CAST(@croAffected AS NVARCHAR(10));

PRINT '';
PRINT '=== AFTER ===';
SELECT ServiceAdvisor, ServiceAdvisorID, COUNT(*) AS JCs
FROM   Addata_JobCardInfo
WHERE  ServiceAdvisor IN (@fromName, @toName) OR ServiceAdvisorID IN (@fromId, @toId)
GROUP  BY ServiceAdvisor, ServiceAdvisorID
ORDER  BY ServiceAdvisor;
