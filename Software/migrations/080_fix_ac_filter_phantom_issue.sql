-- 080_fix_ac_filter_phantom_issue.sql
-- Owner report 2026-07-15: AC FILTER ASSY OSHAN (ItemId 3424,
-- ManualNumber F202F280103-1105) shows on-hand=0 but physical count = 1.
--
-- Root cause: data_StockInOutDetail row (StockIOID=284) dated 2026-03-09
-- posts a -1 issue against JC PPM-7007. That JC + issue predate the
-- AutoDMS opening-stock date (2026-06-30). Opening stock counted parts
-- physically remaining on the shelf, which already excluded the one
-- PPM-7007 consumed. So the 2026-03-09 issue is double-counted: once
-- by the migration row and once implicitly by opening stock.
--
-- Fix: post a +1 stock adjustment dated 2026-06-30 (opening date, so
-- period reports show it as opening-stock refinement, not as a new
-- movement). Narration explains the reconciliation for future audit.
-- Idempotent: skips if the marker adjustment already exists.
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @adjustmentDate DATETIME = '2026-06-30';
DECLARE @itemId         INT      = 3424;
DECLARE @rate           DECIMAL(14,5) = 8183.05;   -- current weighted rate
DECLARE @whId           INT      = 3;
DECLARE @marker NVARCHAR(200) = 'Reconcile phantom -1 on 2026-03-09 (PPM-7007 predates opening stock)';

BEGIN TRY
    BEGIN TRANSACTION;

    -- Idempotency check
    IF EXISTS (
        SELECT 1
        FROM   data_StockInOutInfo   oi
        JOIN   data_StockInOutDetail od ON od.StockIOID = oi.StockIOID
        WHERE  od.ItemId = @itemId AND oi.Remarks = @marker
    )
    BEGIN
        PRINT '080: reconciliation already posted — no-op.';
        COMMIT TRANSACTION;
        RETURN;
    END

    -- 1. Header — StockType='Adjustment' if the CK allows it; fall back to 'Issue'
    -- with positive quantity if the constraint is strict. Look at existing rows
    -- to pick whichever value is already used for opening-style adjustments.
    DECLARE @stockType NVARCHAR(50) = (
        SELECT TOP 1 StockType
        FROM   data_StockInOutInfo
        WHERE  StockType IN ('Adjustment','Opening','GRN','Issue')
        ORDER  BY CASE StockType
                    WHEN 'Adjustment' THEN 1
                    WHEN 'Opening'    THEN 2
                    WHEN 'GRN'        THEN 3
                    WHEN 'Issue'      THEN 4
                  END
    );
    IF @stockType IS NULL SET @stockType = 'Adjustment';

    DECLARE @stockIONo INT = ISNULL((SELECT MAX(StockIONo) FROM data_StockInOutInfo), 0) + 1;
    DECLARE @newStockIOID INT;

    INSERT INTO data_StockInOutInfo
        (EntryUserID, EntryUserDateTime, CompanyID, StockIODate, StockType,
         Remarks, StockIONo, WHID, IsTaxable, ReadOnly)
    VALUES
        (NULL, GETDATE(), 1, @adjustmentDate, @stockType,
         @marker, @stockIONo, @whId, 0, 0);
    SET @newStockIOID = SCOPE_IDENTITY();

    -- 2. Detail — +1 positive quantity for AC FILTER
    INSERT INTO data_StockInOutDetail
        (StockIOID, ItemId, Quantity, StockRate)
    VALUES
        (@newStockIOID, @itemId, 1.000, @rate);

    PRINT '080: posted +1 adjustment for ItemId 3424 (AC FILTER ASSY OSHAN)';
    PRINT '     StockIOID=' + CAST(@newStockIOID AS NVARCHAR(10)) +
          '  StockIONo=' + CAST(@stockIONo AS NVARCHAR(10)) +
          '  Date=' + CONVERT(NVARCHAR(10), @adjustmentDate, 121);

    -- Sanity: print the new running total.
    DECLARE @newOnHand DECIMAL(18,3) = (
        SELECT ISNULL((SELECT SUM(Quantity) FROM data_StockArrivalDetail WHERE ItemId=@itemId),0)
             + ISNULL((SELECT SUM(Quantity) FROM data_StockInOutDetail    WHERE ItemId=@itemId),0)
    );
    PRINT '     New on-hand = ' + CAST(@newOnHand AS NVARCHAR(20));

    COMMIT TRANSACTION;
    PRINT '080_fix_ac_filter_phantom_issue complete.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'FAILED: ' + @errMsg;
    THROW;
END CATCH;
