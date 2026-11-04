-- Add Job Controller technician names without replacing any existing view columns.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.Addata_JobCardInfoDetail') AND name='IX_JCLabour_Job_Technician')
    CREATE INDEX IX_JCLabour_Job_Technician ON dbo.Addata_JobCardInfoDetail(JobCardId)
        INCLUDE(TechnicianId,PerformedByName,Price,DiscAmt,JobStartTime,JobEndTime);
DECLARE @body NVARCHAR(MAX)=OBJECT_DEFINITION(OBJECT_ID('dbo.vw_WorkshopJobCards'));
IF @body IS NULL THROW 51069,'Workshop job card view is missing.',1;
IF NOT EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.vw_WorkshopJobCards') AND name='TechnicianNames')
BEGIN
    DECLARE @pos INT=CHARINDEX(N'FROM Addata_JobCardInfo j',@body);
    IF @pos=0 THROW 51069,'Unexpected job card view definition. Technician display was not applied.',1;
    SET @body=STUFF(@body,@pos,0,N',
        STUFF((SELECT DISTINCT '', ''+COALESCE(NULLIF(LTRIM(RTRIM(d.PerformedByName)),''''),NULLIF(LTRIM(RTRIM(e.EmployeeName)),''''),CONCAT(''Employee #'',d.TechnicianId))
            FROM dbo.Addata_JobCardInfoDetail d LEFT JOIN dbo.gen_EmployeeInfo e ON e.EmployeeID=d.TechnicianId
            WHERE d.JobCardId=j.JobCardId AND (d.TechnicianId>0 OR NULLIF(LTRIM(RTRIM(d.PerformedByName)),'''') IS NOT NULL)
            FOR XML PATH(''''),TYPE).value(''.'',''NVARCHAR(MAX)''),1,2,'''') AS TechnicianNames
        ');
    SET @body=REPLACE(@body,N'CREATE OR ALTER VIEW',N'ALTER VIEW');
    SET @body=REPLACE(@body,N'CREATE VIEW',N'ALTER VIEW');
    EXEC sys.sp_executesql @body;
END;
COMMIT TRANSACTION;
