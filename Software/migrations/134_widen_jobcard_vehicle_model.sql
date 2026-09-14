-- 134_widen_jobcard_vehicle_model.sql
-- Owner report 2026-09-14: "String or binary data would be truncated" when
-- creating a job card.
--
-- Cause: the job card form fills "Vehicle Type / Model" (VersionCode) from the
-- customer's saved vehicle, where the model is stored in 150 characters and
-- variant names run to 300 — but Addata_JobCardInfo.VersionCode held only 50.
-- A real model such as 'OSHAN FUTURE SENSE 7 SEATER OSHAN FUTURE SENSE 7
-- SEATER' is 55 characters, so the save failed outright. VehicleCode (the
-- Year / Variant box) had the same 50 limit against a 150-character source.
-- Reproduced locally before this change: error 2628 on column VersionCode.
--
-- Widens VersionCode to 300 and VehicleCode to 150, on the job card table and
-- on Addata_JobCardInfoLog, which carries the same two 50-character columns —
-- anything copying job cards into it would otherwise hit the identical error
-- one step later.
--
-- Nullability and collation are read from each existing column and kept
-- exactly; a bare ALTER COLUMN would silently reset both. Increasing a
-- variable-length column is a metadata-only change, so it is quick even on a
-- large table. Views over these tables cache column sizes, so they are
-- refreshed afterwards.
--
-- Only ever widens, never shrinks. Idempotent — safe to re-run.
SET NOCOUNT ON;

DECLARE @targets TABLE (TableName SYSNAME, ColumnName SYSNAME, NewLength INT);
INSERT INTO @targets VALUES
    ('Addata_JobCardInfo',    'VersionCode', 300),
    ('Addata_JobCardInfo',    'VehicleCode', 150),
    ('Addata_JobCardInfoLog', 'VersionCode', 300),
    ('Addata_JobCardInfoLog', 'VehicleCode', 150);

DECLARE @t SYSNAME, @c SYSNAME, @len INT, @sqltext NVARCHAR(MAX);
DECLARE @curLen INT, @typeName SYSNAME, @nullable BIT, @coll SYSNAME;

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT TableName, ColumnName, NewLength FROM @targets;
OPEN cur;
FETCH NEXT FROM cur INTO @t, @c, @len;
WHILE @@FETCH_STATUS = 0
BEGIN
    SELECT @curLen = NULL, @typeName = NULL, @nullable = NULL, @coll = NULL;

    SELECT @curLen   = CASE WHEN col.max_length = -1 THEN -1
                            WHEN ty.name IN ('nvarchar', 'nchar') THEN col.max_length / 2
                            ELSE col.max_length END,
           @typeName = ty.name,
           @nullable = col.is_nullable,
           @coll     = col.collation_name
    FROM   sys.columns col
    JOIN   sys.types   ty ON ty.user_type_id = col.user_type_id
    WHERE  col.object_id = OBJECT_ID(@t) AND col.name = @c;

    IF @typeName IS NULL
        PRINT '134: ' + @t + '.' + @c + ' not found - skipped.';
    ELSE IF @typeName NOT IN ('nvarchar', 'varchar')
        PRINT '134: ' + @t + '.' + @c + ' is ' + @typeName + ', not (n)varchar - left alone.';
    ELSE IF @curLen = -1 OR @curLen >= @len
        PRINT '134: ' + @t + '.' + @c + ' is already '
            + CASE WHEN @curLen = -1 THEN 'MAX' ELSE CAST(@curLen AS VARCHAR(10)) END + ' - no change.';
    ELSE
    BEGIN
        SET @sqltext = N'ALTER TABLE ' + QUOTENAME(@t) + N' ALTER COLUMN ' + QUOTENAME(@c) + N' '
                     + @typeName + N'(' + CAST(@len AS NVARCHAR(10)) + N')'
                     + CASE WHEN @coll IS NOT NULL THEN N' COLLATE ' + @coll ELSE N'' END
                     + CASE WHEN @nullable = 1 THEN N' NULL' ELSE N' NOT NULL' END + N';';
        EXEC sp_executesql @sqltext;
        PRINT '134: widened ' + @t + '.' + @c + ' from ' + CAST(@curLen AS VARCHAR(10))
            + ' to ' + CAST(@len AS VARCHAR(10)) + '.';
    END

    FETCH NEXT FROM cur INTO @t, @c, @len;
END
CLOSE cur;
DEALLOCATE cur;
GO

-- Views over these tables keep the old column sizes in their metadata until
-- refreshed. Found by dependency, not by a fixed list, because the live
-- database's legacy views differ from this one. A legacy view that will not
-- refresh is reported and skipped rather than failing the migration.
DECLARE @v SYSNAME;
DECLARE vcur CURSOR LOCAL FAST_FORWARD FOR
    SELECT DISTINCT OBJECT_NAME(d.referencing_id)
    FROM   sys.sql_expression_dependencies d
    JOIN   sys.objects     o ON o.object_id = d.referencing_id
    JOIN   sys.sql_modules m ON m.object_id = d.referencing_id
    WHERE  d.referenced_id IN (OBJECT_ID('Addata_JobCardInfo'), OBJECT_ID('Addata_JobCardInfoLog'))
      AND  o.type = 'V'
      AND  m.is_schema_bound = 0;
OPEN vcur;
FETCH NEXT FROM vcur INTO @v;
WHILE @@FETCH_STATUS = 0
BEGIN
    BEGIN TRY
        EXEC sp_refreshview @v;
        PRINT '134: refreshed view ' + @v + '.';
    END TRY
    BEGIN CATCH
        PRINT '134: could not refresh view ' + @v + ' - ' + ERROR_MESSAGE();
    END CATCH
    FETCH NEXT FROM vcur INTO @v;
END
CLOSE vcur;
DEALLOCATE vcur;
GO

PRINT '134_widen_jobcard_vehicle_model complete.';
