-- 085_revert_ac_filter_phantom_fix.sql
-- Owner ask 2026-07-17:
--   * Physical shelf count for AC FILTER ASSY OSHAN is 8.
--   * The ledger currently shows: opening arrival +8 (2026-06-30),
--     legacy issue -1 (2026-03-09, PPM-7007, predates opening),
--     and reconciliation +1 (2026-06-30, migration 080). Net = 8.
--   * Owner wants both the +1 reconciliation AND the -1 legacy phantom
--     removed so the ledger reads cleanly as a single +8 opening row.
--
-- Both deletions are targeted by unique identifiers (marker remark for
-- 080's row, exact ItemId+Date+Quantity match for the legacy row) and
-- guarded with row-count checks so the migration bails if the row set
-- is ambiguous. Idempotent — safe to re-run.
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @itemId  INT           = 3424;   -- AC FILTER ASSY OSHAN on live
DECLARE @marker  NVARCHAR(200) = 'Reconcile phantom -1 on 2026-03-09 (PPM-7007 predates opening stock)';
DECLARE @legacyDate DATE       = '2026-03-09';
DECLARE @legacyQty  DECIMAL(18,3) = -1.000;

BEGIN TRY
    BEGIN TRANSACTION;

    ----------------------------------------------------------------
    -- 1. Remove the +1 reconciliation posted by migration 080.
    ----------------------------------------------------------------
    DECLARE @markerIOID INT = (
        SELECT TOP 1 StockIOID
        FROM   data_StockInOutInfo
        WHERE  Remarks = @marker
    );

    IF @markerIOID IS NULL
        PRINT '085a: marker row not present (080 never applied or already reverted).';
    ELSE
    BEGIN
        DELETE FROM data_StockInOutDetail WHERE StockIOID = @markerIOID;
        DELETE FROM data_StockInOutInfo   WHERE StockIOID = @markerIOID;
        PRINT '085a: removed StockIOID=' + CAST(@markerIOID AS NVARCHAR(10)) +
              ' (migration 080 +1 adjustment for AC FILTER ASSY OSHAN).';
    END

    ----------------------------------------------------------------
    -- 2. Remove the 2026-03-09 -1 legacy issue for this ItemId.
    --    This row was imported from the pre-AutoDMS system and
    --    represents consumption that opening-stock (2026-06-30)
    --    already accounted for by physical count.
    ----------------------------------------------------------------
    DECLARE @legacyIOIDs TABLE (StockIOID INT PRIMARY KEY);
    INSERT INTO @legacyIOIDs (StockIOID)
    SELECT DISTINCT oi.StockIOID
    FROM   data_StockInOutInfo   oi
    JOIN   data_StockInOutDetail od ON od.StockIOID = oi.StockIOID
    WHERE  od.ItemId = @itemId
      AND  CAST(oi.StockIODate AS DATE) = @legacyDate
      AND  od.Quantity = @legacyQty;

    DECLARE @legacyCount INT = (SELECT COUNT(*) FROM @legacyIOIDs);

    IF @legacyCount = 0
        PRINT '085b: no legacy -1 issue found for ItemId ' + CAST(@itemId AS NVARCHAR(10)) +
              ' on ' + CONVERT(NVARCHAR(10), @legacyDate, 121) + ' — already cleaned or never existed.';
    ELSE IF @legacyCount > 1
    BEGIN
        DECLARE @msg NVARCHAR(400) = '085b: ABORT — ' + CAST(@legacyCount AS NVARCHAR(10)) +
            ' rows match legacy criteria (ItemId=' + CAST(@itemId AS NVARCHAR(10)) +
            ', Date=' + CONVERT(NVARCHAR(10), @legacyDate, 121) +
            ', Qty=-1). Refusing to delete an ambiguous set.';
        RAISERROR(@msg, 16, 1);
    END
    ELSE
    BEGIN
        DECLARE @legacyIOID INT = (SELECT TOP 1 StockIOID FROM @legacyIOIDs);
        DELETE FROM data_StockInOutDetail
        WHERE  StockIOID = @legacyIOID AND ItemId = @itemId AND Quantity = @legacyQty;
        -- Only remove the header if no other detail lines survive.
        IF NOT EXISTS (SELECT 1 FROM data_StockInOutDetail WHERE StockIOID = @legacyIOID)
        BEGIN
            DELETE FROM data_StockInOutInfo WHERE StockIOID = @legacyIOID;
            PRINT '085b: removed legacy StockIOID=' + CAST(@legacyIOID AS NVARCHAR(10)) +
                  ' (header + detail) — 2026-03-09 phantom -1 for AC FILTER ASSY OSHAN.';
        END
        ELSE
            PRINT '085b: removed legacy detail line for StockIOID=' + CAST(@legacyIOID AS NVARCHAR(10)) +
                  '; header kept because other detail rows still reference it.';
    END

    ----------------------------------------------------------------
    -- 3. Sanity: report the new on-hand for the item.
    ----------------------------------------------------------------
    DECLARE @onHand DECIMAL(18,3) = (
        SELECT ISNULL((SELECT SUM(Quantity) FROM data_StockArrivalDetail WHERE ItemId=@itemId),0)
             + ISNULL((SELECT SUM(Quantity) FROM data_StockInOutDetail    WHERE ItemId=@itemId),0)
    );
    PRINT '085: AC FILTER ASSY OSHAN on-hand after cleanup = ' + CAST(@onHand AS NVARCHAR(20));

    COMMIT TRANSACTION;
    PRINT '085_revert_ac_filter_phantom_fix complete.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'FAILED: ' + @errMsg;
    THROW;
END CATCH;
