-- 085_revert_ac_filter_phantom_fix.sql
-- Owner ask 2026-07-17: back out the +1 adjustment posted by
-- migration 080 for AC FILTER ASSY OSHAN (ItemId 3424 on live,
-- ManualNumber F202F280103-1105). The marker remark from
-- migration 080 uniquely identifies the row pair, so we can
-- delete just the detail row plus its header without touching
-- any other stock movement.
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @marker NVARCHAR(200) = 'Reconcile phantom -1 on 2026-03-09 (PPM-7007 predates opening stock)';

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @stockIOID INT = (
        SELECT TOP 1 StockIOID
        FROM   data_StockInOutInfo
        WHERE  Remarks = @marker
    );

    IF @stockIOID IS NULL
    BEGIN
        PRINT '085: no marker row found — migration 080 was never applied or already reverted. No-op.';
        COMMIT TRANSACTION;
        RETURN;
    END

    DELETE FROM data_StockInOutDetail WHERE StockIOID = @stockIOID;
    DELETE FROM data_StockInOutInfo   WHERE StockIOID = @stockIOID;

    PRINT '085: removed StockIOID=' + CAST(@stockIOID AS NVARCHAR(10)) +
          ' (migration 080 +1 adjustment for AC FILTER ASSY OSHAN).';

    COMMIT TRANSACTION;
    PRINT '085_revert_ac_filter_phantom_fix complete.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'FAILED: ' + @errMsg;
    THROW;
END CATCH;
