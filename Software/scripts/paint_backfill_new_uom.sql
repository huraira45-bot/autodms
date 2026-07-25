-- ================================================================
-- Backfill paint_ItemUOM for the 21 newly-inserted paint items.
--   Rule: unit-size = 1  =>  PaintUOMID = Piece, FactorToBase = 1
--         unit-size > 1  =>  PaintUOMID = ML,    FactorToBase = unit-size
--
-- These items got StockQty + AvgCost from the earlier reconcile run
-- but paint_ItemUOM was never populated for them (the MERGE only
-- iterated matched items). This closes the gap.
--
-- Dry-run by default (ROLLBACK). Flip to COMMIT after review.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
BEGIN TRANSACTION;

IF OBJECT_ID('tempdb..#new') IS NOT NULL DROP TABLE #new;
CREATE TABLE #new (Code INT NOT NULL, UnitSize INT NOT NULL);
INSERT INTO #new (Code, UnitSize) VALUES
  (100396, 1),
  (100400, 946),
  (100401, 1),
  (100129, 1000),
  (100050, 1000),
  (100352, 1),
  (100353, 1),
  (100210, 1000),
  (100216, 355),
  (100217, 355),
  (100220, 473),
  (100221, 473),
  (100222, 141),
  (100226, 200),
  (100306, 12),
  (100320, 3),
  (100323, 3),
  (100324, 3),
  (100188, 1000),
  (100189, 1000),
  (100351, 1);

DECLARE @pieceUomId INT, @mlUomId INT;
SELECT @pieceUomId = PaintUOMID FROM paint_UOM WHERE UOMName = 'Piece';
SELECT @mlUomId    = PaintUOMID FROM paint_UOM WHERE UOMName = 'ML';
IF @pieceUomId IS NULL RAISERROR('paint_UOM Piece not found.', 16, 1);
IF @mlUomId    IS NULL RAISERROR('paint_UOM ML not found.',    16, 1);

-- 1) Force PaintUOMID on the 16 unclassified new items to ML
DECLARE @setML INT = 0;
UPDATE pi
   SET pi.PaintUOMID = @mlUomId,
       pi.UpdatedAt  = GETDATE()
  FROM paint_Item pi
  INNER JOIN #new n ON n.Code = TRY_CAST(pi.PaintCode AS INT)
 WHERE pi.PaintUOMID IS NULL AND n.UnitSize > 1;
SET @setML = @@ROWCOUNT;

-- 2) MERGE paint_ItemUOM for all 21 new items using their now-set PaintUOMID
DECLARE @uomWritten INT = 0;
MERGE paint_ItemUOM AS tgt
USING (
    SELECT pi.PaintItemID, pi.PaintUOMID,
           CAST(n.UnitSize AS DECIMAL(18,6)) AS Factor
      FROM paint_Item pi
      INNER JOIN #new n ON n.Code = TRY_CAST(pi.PaintCode AS INT)
     WHERE pi.PaintUOMID IS NOT NULL
) AS src
   ON tgt.PaintItemID = src.PaintItemID AND tgt.PaintUOMID = src.PaintUOMID
 WHEN MATCHED AND ABS(tgt.FactorToBase - src.Factor) > 0.000001 THEN
      UPDATE SET FactorToBase = src.Factor
 WHEN NOT MATCHED BY TARGET THEN
      INSERT (PaintItemID, PaintUOMID, FactorToBase)
      VALUES (src.PaintItemID, src.PaintUOMID, src.Factor);
SET @uomWritten = @@ROWCOUNT;

PRINT '--- SUMMARY ---';
SELECT @setML AS ItemsSetToML, @uomWritten AS UomRowsWritten;

PRINT '--- Final state of the 21 new items ---';
SELECT pi.PaintCode, pi.PaintName, u.UOMName AS UoM, iu.FactorToBase, pi.StockQty, pi.AvgCost
  FROM paint_Item pi
  INNER JOIN #new n ON n.Code = TRY_CAST(pi.PaintCode AS INT)
  LEFT  JOIN paint_UOM u ON u.PaintUOMID = pi.PaintUOMID
  LEFT  JOIN paint_ItemUOM iu ON iu.PaintItemID = pi.PaintItemID AND iu.PaintUOMID = pi.PaintUOMID
 ORDER BY pi.PaintName;

ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;
