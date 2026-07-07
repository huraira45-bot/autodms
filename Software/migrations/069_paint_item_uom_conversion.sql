-- =====================================================================
-- 069_paint_item_uom_conversion.sql
--
-- Paint Lab multi-UoM support (owner ask 2026-07-07). Each paint item
-- keeps its existing paint_Item.PaintUOMID as the *base* UoM (stock &
-- avg-cost are tracked in that unit). A new child table lists any
-- alternate UoMs the item can be received or issued in, each with a
-- conversion factor into the base UoM:
--     base_qty = line_qty * FactorToBase
--
-- Example: item "PU BLACK" with base = Gram
--   (PaintItemID=42, UOM=Gram,    Factor=1)
--   (PaintItemID=42, UOM=Kg,      Factor=1000)
--   (PaintItemID=42, UOM=Litre,   Factor=1180)   -- density-specific
--   (PaintItemID=42, UOM=Gallon,  Factor=4467)   -- 3.78541 L * 1180
--
-- Idempotent: safe to re-run. Grandfathers all existing paint items by
-- seeding a self-row with factor 1 so the current PaintUOMID keeps
-- working.
-- =====================================================================
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'paint_ItemUOM')
BEGIN
    CREATE TABLE dbo.paint_ItemUOM (
        PaintItemID  INT             NOT NULL,
        PaintUOMID   INT             NOT NULL,
        FactorToBase DECIMAL(18, 6)  NOT NULL,
        CONSTRAINT PK_paint_ItemUOM     PRIMARY KEY (PaintItemID, PaintUOMID),
        CONSTRAINT FK_paint_ItemUOM_Item FOREIGN KEY (PaintItemID) REFERENCES dbo.paint_Item(PaintItemID),
        CONSTRAINT FK_paint_ItemUOM_UOM  FOREIGN KEY (PaintUOMID)  REFERENCES dbo.paint_UOM(PaintUOMID),
        CONSTRAINT CK_paint_ItemUOM_Factor CHECK (FactorToBase > 0)
    );
    PRINT '  paint_ItemUOM created.';
END
ELSE
    PRINT '  paint_ItemUOM already exists.';

-- Seed base-UOM self-row for every existing paint item so GRN/Issue in
-- the item's current UOM continues to work with no operator change.
INSERT INTO dbo.paint_ItemUOM (PaintItemID, PaintUOMID, FactorToBase)
SELECT i.PaintItemID, i.PaintUOMID, 1
FROM   dbo.paint_Item i
WHERE  i.PaintUOMID IS NOT NULL
  AND  NOT EXISTS (
        SELECT 1
        FROM   dbo.paint_ItemUOM u
        WHERE  u.PaintItemID = i.PaintItemID
          AND  u.PaintUOMID  = i.PaintUOMID
      );
PRINT '  Seeded self-rows (grandfather) for existing paint items: ' + CAST(@@ROWCOUNT AS varchar);

PRINT '069_paint_item_uom_conversion complete.';
