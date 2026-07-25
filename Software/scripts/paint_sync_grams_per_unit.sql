-- ================================================================
-- Sync paint_Item.GramsPerUnit from paint_ItemUOM.FactorToBase.
--
-- Migration 071 added GramsPerUnit as a shortcut column on paint_Item;
-- the UI reads/writes it directly. The earlier reconcile updated
-- paint_ItemUOM.FactorToBase but never touched GramsPerUnit, so the
-- Paint Items edit form still shows the old value.
--
-- This copies the FactorToBase for each item's OWN PaintUOMID over
-- to GramsPerUnit. NULL PaintUOMID items are left alone.
--
-- Dry-run by default. Flip ROLLBACK -> COMMIT after review.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
BEGIN TRANSACTION;

DECLARE @changed INT = 0;

UPDATE pi
   SET pi.GramsPerUnit = iu.FactorToBase,
       pi.UpdatedAt    = GETDATE()
  FROM paint_Item pi
  INNER JOIN paint_ItemUOM iu
          ON iu.PaintItemID = pi.PaintItemID
         AND iu.PaintUOMID  = pi.PaintUOMID
 WHERE pi.PaintUOMID IS NOT NULL
   AND (pi.GramsPerUnit IS NULL OR ABS(pi.GramsPerUnit - iu.FactorToBase) > 0.0001);
SET @changed = @@ROWCOUNT;

PRINT '--- SUMMARY ---';
SELECT @changed AS RowsUpdated;

PRINT '--- 20 samples after sync ---';
SELECT TOP 20 pi.PaintCode, pi.PaintName, u.UOMName AS UoM,
       pi.GramsPerUnit, iu.FactorToBase
  FROM paint_Item pi
  LEFT JOIN paint_UOM u ON u.PaintUOMID = pi.PaintUOMID
  LEFT JOIN paint_ItemUOM iu ON iu.PaintItemID = pi.PaintItemID AND iu.PaintUOMID = pi.PaintUOMID
 WHERE pi.PaintUOMID IS NOT NULL
 ORDER BY pi.PaintItemID DESC;

ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;
