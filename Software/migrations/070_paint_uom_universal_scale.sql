-- =====================================================================
-- 070_paint_uom_universal_scale.sql  (owner ask 2026-07-07)
--
-- Simplified UoM model: no per-item alternate-UoM grid. Instead
-- paint_UOM.Scale becomes the universal conversion factor:
--
--   Scale > 0  → weight / volume family. Value = grams (or grams-
--                equivalent for a volume unit at density ~1) per
--                one of this UoM. Any two UoMs in this family
--                convert via Scale ratio, so an item stocked in
--                Litre can be received in Gallon or Kg and the
--                math is right without touching the item master.
--
--   Scale = 0  → counting / Piece family. Items with a Piece base
--                UoM can only receive/issue in Piece. Weight and
--                volume UoMs are rejected at save time.
--
-- Default conversions (owner accepts 1 ML = 1 g approximation):
--   Gram    1
--   ML      1
--   Litre   1000
--   Kg      1000
--   Gallon  3785.41   (US gallon in mL/g)
--   Quater  946.35    (US quart)
--   Piece   0         (marker for countable)
--
-- Idempotent: only overwrites the well-known bad seeds (Kg = 1,
-- Litre = 1, Gallon = 3.785 etc. from Phase 0 which treated Scale
-- as \"litres per unit\"). If an accountant has set a custom Scale
-- outside these defaults, this migration leaves it alone.
-- =====================================================================
SET NOCOUNT ON;

PRINT '===== BEFORE =====';
SELECT PaintUOMID, UOMName, Scale FROM paint_UOM ORDER BY UOMName;

UPDATE paint_UOM SET Scale = 1
    WHERE UOMName IN ('Gram', 'Grams', 'g', 'G')
      AND (Scale IS NULL OR Scale = 1);

UPDATE paint_UOM SET Scale = 1
    WHERE UOMName IN ('ML', 'ml', 'Ml', 'mL')
      AND (Scale IS NULL OR Scale = 1 OR Scale = 0.001);

UPDATE paint_UOM SET Scale = 1000
    WHERE UOMName IN ('Litre', 'litre', 'L', 'Ltr')
      AND (Scale IS NULL OR Scale = 1);

UPDATE paint_UOM SET Scale = 1000
    WHERE UOMName IN ('Kg', 'kg', 'KG', 'Kgs')
      AND (Scale IS NULL OR Scale = 1);

UPDATE paint_UOM SET Scale = 3785.41
    WHERE UOMName IN ('Gallon', 'gallon', 'Gal', 'Gallons')
      AND (Scale IS NULL OR Scale = 1 OR Scale = 3.785 OR Scale = 3.7850);

UPDATE paint_UOM SET Scale = 946.35
    WHERE UOMName IN ('Quater', 'Quarter', 'Qt', 'Quart')
      AND (Scale IS NULL OR Scale = 1);

UPDATE paint_UOM SET Scale = 0
    WHERE UOMName IN ('Piece', 'Pcs', 'Pc', 'Nos', 'Each')
      AND (Scale IS NULL OR Scale = 1);

PRINT '===== AFTER =====';
SELECT PaintUOMID, UOMName, Scale,
       CASE WHEN ISNULL(Scale, 0) = 0 THEN 'Piece family'
            ELSE 'Weight/volume family' END AS Family
FROM   paint_UOM ORDER BY UOMName;

PRINT '070_paint_uom_universal_scale complete.';
