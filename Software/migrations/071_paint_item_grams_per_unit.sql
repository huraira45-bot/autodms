-- =====================================================================
-- 071_paint_item_grams_per_unit.sql  (owner ask 2026-07-07, Step 1)
--
-- Add a per-item "how many grams equal 1 unit of this item's
-- PaintUOMID" field. Populated by the owner over time; when all 129
-- items are set correctly, Step 2 will:
--   1. Multiply each item's StockQty by GramsPerUnit
--   2. Divide each item's AvgCost by GramsPerUnit
--   3. Switch GRN + Issue math to use this field instead of the
--      global paint_UOM.Scale ratio.
--
-- For Piece items, GramsPerUnit stays NULL (marker for "no
-- conversion needed"). Same rule applies at Step 2 — Piece items
-- are left untouched.
--
-- Idempotent: skips the ADD if the column already exists.
-- =====================================================================
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.paint_Item') AND name = 'GramsPerUnit'
)
BEGIN
    ALTER TABLE dbo.paint_Item ADD GramsPerUnit DECIMAL(18, 4) NULL;
    PRINT '  paint_Item.GramsPerUnit column added (all NULL).';
END
ELSE
    PRINT '  paint_Item.GramsPerUnit already exists.';
GO

-- Optional: seed a default guess so the operator sees something to
-- start from. Only fills items where GramsPerUnit is still NULL and
-- the item's PaintUOMID matches a known UoM (Kg=1000, Litre=1000,
-- Gallon=3785.41, Quater=946.35, ML=1, Gram=1). Piece is left NULL.
UPDATE i
SET    i.GramsPerUnit = seed.GramsPerUnit
FROM   paint_Item i
JOIN   paint_UOM  u ON i.PaintUOMID = u.PaintUOMID
JOIN (
    VALUES ('Gallon', 3785.41),
           ('Kg',     1000),
           ('Litre',  1000),
           ('ML',     1),
           ('Gram',   1),
           ('Quater', 946.35),
           ('Quarter',946.35)
) AS seed(UOMName, GramsPerUnit) ON u.UOMName = seed.UOMName
WHERE  i.GramsPerUnit IS NULL;
PRINT '  Seeded default GramsPerUnit for items with recognized bulk UoMs: ' + CAST(@@ROWCOUNT AS varchar);

PRINT '071_paint_item_grams_per_unit complete.';
