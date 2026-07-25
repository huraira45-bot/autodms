-- ================================================================
-- Purge paint_ItemUOM rows whose UoM is in the wrong family
-- relative to the item's current base PaintUOMID.
--
-- Family rule (from migration 070):
--   Scale = 0  => counting family (Piece)
--   Scale > 0  => weight/volume family (Gram, Kg, Litre, ML, Gallon)
--
-- Symptom: after the recent backfill, items whose base UoM was
-- flipped (e.g. Gram -> Piece for REGMAL) still had leftover
-- paint_ItemUOM rows from the OLD family. The Issue-line picker
-- offered the wrong UoM, and save failed with the "counting vs
-- weight/volume" validation error.
--
-- Only cross-family rows are deleted. Legitimate alternate UoMs
-- within the same family (e.g. Litre + ML for a fluid item)
-- are kept.
--
-- Dry-run by default. Flip ROLLBACK -> COMMIT after review.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
BEGIN TRANSACTION;

PRINT '--- Rows that WILL be deleted ---';
SELECT pi.PaintCode, pi.PaintName,
       baseU.UOMName AS ItemBaseUoM, baseU.Scale AS BaseScale,
       altU.UOMName  AS StrayLineUoM, altU.Scale AS AltScale,
       iu.FactorToBase
  FROM paint_ItemUOM iu
  INNER JOIN paint_Item pi   ON pi.PaintItemID = iu.PaintItemID
  INNER JOIN paint_UOM  baseU ON baseU.PaintUOMID = pi.PaintUOMID
  INNER JOIN paint_UOM  altU  ON altU.PaintUOMID  = iu.PaintUOMID
 WHERE (ISNULL(baseU.Scale, 0) = 0 AND ISNULL(altU.Scale, 0) > 0)
    OR (ISNULL(baseU.Scale, 0) > 0 AND ISNULL(altU.Scale, 0) = 0)
 ORDER BY pi.PaintName, altU.UOMName;

DECLARE @deleted INT = 0;
DELETE iu
  FROM paint_ItemUOM iu
  INNER JOIN paint_Item pi   ON pi.PaintItemID = iu.PaintItemID
  INNER JOIN paint_UOM  baseU ON baseU.PaintUOMID = pi.PaintUOMID
  INNER JOIN paint_UOM  altU  ON altU.PaintUOMID  = iu.PaintUOMID
 WHERE (ISNULL(baseU.Scale, 0) = 0 AND ISNULL(altU.Scale, 0) > 0)
    OR (ISNULL(baseU.Scale, 0) > 0 AND ISNULL(altU.Scale, 0) = 0);
SET @deleted = @@ROWCOUNT;

PRINT '--- SUMMARY ---';
SELECT @deleted AS RowsDeleted;

ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;
