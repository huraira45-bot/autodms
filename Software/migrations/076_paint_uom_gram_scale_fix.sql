-- 076_paint_uom_gram_scale_fix.sql
-- Migration 070 seeded Gram at Scale=0.001 in an early revision and its
-- corrective WHERE clause only covered NULL or 1 — so Scales left at 0.001
-- (like Gram on live) were never lifted to 1. Reset Gram to Scale=1 so it
-- correctly represents the base weight unit.
SET NOCOUNT ON;

PRINT '===== BEFORE =====';
SELECT PaintUOMID, UOMName, Scale FROM paint_UOM WHERE UOMName IN ('Gram','Grams','g','G');

UPDATE paint_UOM SET Scale = 1
    WHERE UOMName IN ('Gram','Grams','g','G')
      AND Scale < 1;

PRINT '===== AFTER =====';
SELECT PaintUOMID, UOMName, Scale FROM paint_UOM WHERE UOMName IN ('Gram','Grams','g','G');

PRINT '076_paint_uom_gram_scale_fix complete.';
