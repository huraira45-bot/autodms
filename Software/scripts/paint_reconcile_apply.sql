-- ================================================================
-- Paint Lab reconciliation — apply xlsx physical count to paint_Item
--   Match: PaintCode (numeric) first, fall back to PaintName (case-insens).
--   Updates: StockQty AND AvgCost (from xlsx Rate). PaintName left as-is.
--   Inserts: rows with no match get created with PaintUOMID=NULL,
--            IsActive=1, AvgCost = xlsx Rate (initial cost).
--   Deletes: none (no same-name duplicates were found).
--   PaintUOMID: forced to "Piece" when xlsx unit-size = 1 (owner rule).
--                Items with unit-size > 1 keep their existing PaintUOMID.
--   paint_ItemUOM: MERGE FactorToBase = xlsx unit-size on the item's
--                  current PaintUOMID (owner ask). Items with NULL
--                  PaintUOMID are skipped and counted.
--
-- No paint_StockLedger row is written — CK_paint_Ledger_Source doesn't
-- allow a PHYSICAL_COUNT source type. Same pattern as the opening-stock
-- load. StockQty and SUM(ledger.QuantityDelta) will diverge after this.
--
-- DRY RUN by default (ROLLBACK). Review the summary printouts, then
-- swap the last two lines to COMMIT and re-run.
-- ================================================================
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('tempdb..#xlsx') IS NOT NULL DROP TABLE #xlsx;
CREATE TABLE #xlsx (
    Code     INT NOT NULL,
    Name     NVARCHAR(200) NOT NULL,
    Qty      DECIMAL(18,4) NOT NULL,
    Rate     DECIMAL(18,4) NOT NULL,
    UnitSize INT NOT NULL
);

INSERT INTO #xlsx (Code, Name, Qty, Rate, UnitSize) VALUES
  (100073, 'CONVERTER', 610, 0.12, 1000),
  (100074, '1K ACRYLIC.PRIME FULLER', 480, 2.29, 1000),
  (100075, 'FISH EYE PREVENTER', 2800, 3.54, 1000),
  (100076, 'FLIP CONTROLLER', 2410, 6.88, 2500),
  (100077, 'FADE OUT THINNER', 200, 0.79, 3600),
  (100079, 'POLISH', 810, 3, 500),
  (100395, '60 REGMAL', 2.25, 115, 1),
  (100344, 'TAPE (R-M)', 48, 149.99, 1),
  (100396, 'CANCOAT', 290, 92.5, 1),
  (100083, '3M 2000 REGMAL', 1.5, 118.45, 1),
  (100084, 'P2000 REGMAL', 15, 90, 1),
  (100400, 'MEGUAIRS ULTRA PRO FINISHING POLISH', 400, 19.98, 946),
  (100090, '120 REGMAL', 24.5, 87.91, 1),
  (100091, '320 REGMAL', 23, 86.67, 1),
  (100092, '220 REGMAL', 18.5, 89.96, 1),
  (100345, 'STEEL PUTTEN (R-M)', 9037, 0.84, 1000),
  (100401, 'BLACK COATING GLOVES', 30, 19.5, 1),
  (100098, 'ZEN 1K ACRYLIC PREMMER', 1310, 1.04, 1000),
  (100404, 'RAGMAL 600', 15, 90, 1),
  (100103, 'ZEN Z2S SILKY  SILVER', 4670, 1.94, 1000),
  (100099, 'ZEN 2K PREMMER', 3632, 2.98, 1000),
  (100113, 'RT PALE WHITE', 934.46, 4.85, 1000),
  (100129, '2K CLEARCOAT SUPRIME', 636, 4.43, 1000),
  (100154, '2K THINNER  MEDIUM', 0, 1.93, 5000),
  (100421, 'NEXA REGMAL P80', 2, 107.41, 1),
  (100422, 'NEXA REGMAL P150', 2, 111.65, 1),
  (100423, 'NEXA REGMAL P400', 15, 103.16, 1),
  (100349, 'DECO MAT BLACK', 340, 1.04, 910),
  (100141, 'FIBER PUTTI GELASO', 3000, 0.46, 1000),
  (100424, 'NEXA REGMAL P240', 20, 103.2, 1),
  (100425, '233MM 22H P80', 27, 170.97, 1),
  (100184, 'STAIN MEX (APC)', 2930, 2, 1000),
  (100428, 'NEXA P800', 100, 170, 1),
  (100429, 'DRY SANDING PAD', 3, 1500, 1),
  (100168, 'ZEN 1F8 MILD SILVER', 2250, 2.39, 1000),
  (100010, 'RT MEDIUM PALE YELLOW', 1624.75, 4.78, 1000),
  (100011, 'RT TRANSPARENT BLACK', 2252.54, 3.28, 1000),
  (100012, 'YELLOW OXIDE', 1229, 4.72, 1000),
  (100013, 'RED OXIDE', 918.8, 3.92, 1000),
  (100014, 'RT RUSSET', 2115.65, 3.13, 1000),
  (100015, 'RT DEEP BLUE', 804.74, 5.38, 1000),
  (100016, 'ULTRA FINE WHITE', 1220.32, 5.56, 1000),
  (100025, 'TONE CONTROLER', 1420, 7.9, 1000),
  (100018, 'VOILET', 1136.34, 7.95, 1000),
  (100019, 'HS CLARET', 1015.65, 7.72, 1000),
  (100020, 'HS LAGOON BLUE', 2129.39, 6.02, 1000),
  (100021, 'HS BRIGHT MAROON', 630, 3.92, 1000),
  (100022, 'SUPER RED', 810, 3.92, 1000),
  (100023, 'HS SUN YELLOW', 1230, 3.92, 1000),
  (100024, 'HS PALE YELLOW', 1070, 3.92, 1000),
  (100026, 'TRANSOXIDE RED', 920, 3.92, 1000),
  (100027, 'HS VERY COARSE ALUMINIUM', 1069.33, 5.31, 1000),
  (100028, 'HS BLACK', 700, 7.8, 1000),
  (100029, 'HS JET BLACK', 1500, 7.69, 1000),
  (100030, 'HSW BLUE GREEN', 850, 3.92, 1000),
  (100031, 'HS SUPER BLUE', 1200, 6.25, 1000),
  (100032, 'HS FAST BLUE', 1500, 4.21, 1000),
  (100033, 'RT BURGUNDY', 744.86, 3.92, 1000),
  (100034, 'HS CLEAN MAGENTA', 759.32, 6.95, 1000),
  (100035, 'HS BRILLIANT RED', 2400, 10.25, 1000),
  (100036, 'BRONZE GREEN', 660.1, 3.92, 1000),
  (100037, 'HS RED VOILET', 627, 3.92, 1000),
  (100038, 'BROWN', 1270.42, 4.84, 1000),
  (100039, 'TRANSOXIDE YELLOW', 1200, 3.92, 1000),
  (100040, 'STRONG YELLOW', 700, 0.75, 1000),
  (100041, 'HS MEDIUM FINE ALUMINIUM', 1050, 7.27, 1000),
  (100042, 'HS FINE ALUMINIUM', 2800, 7.6, 1000),
  (100043, 'HS COARSE ALUMINIUM', 2135, 7.32, 1000),
  (100044, 'HS SHINNING COARSE ALUMINIUM', 1155.79, 8.07, 1000),
  (100045, 'HS COARSE SILVER DOLLAR ALUMINIUM', 1200, 7.56, 1000),
  (100046, 'WHITE PEARL', 2030.99, 3.69, 1000),
  (100047, 'FINE WHITE PEARL', 2700, 5.31, 1000),
  (100048, 'BLUE PEARL', 1600, 7.88, 1000),
  (100049, 'RED PEARL', 3233.16, 7.22, 1000),
  (100050, 'GOLD PEARL', 1040, 4.5, 1000),
  (100051, 'COPPER PEARL', 542.8, 3.92, 1000),
  (100052, 'WHITE SATIN PEARL', 620, 3.92, 1000),
  (100053, 'FINE RED PEARL', 660, 3.92, 1000),
  (100054, 'FINE RUSSET PEARL', 630, 3.92, 1000),
  (100055, 'FINE BLUE PEARL', 757.81, 3.92, 1000),
  (100056, 'MEDIUM VOILET PEARL', 1723.65, 2.84, 1000),
  (100057, 'MEDIUM GREEN PEARL', 1718.19, 9.1, 1000),
  (100058, 'MATTING AGENT', 710, 3.98, 1000),
  (100059, 'GRAPHITE FLAKE', 720, 3.92, 1000),
  (100061, 'HS MEDIUM COARSE ALUMINIUM', 2150, 3.92, 2500),
  (100062, 'BLUE BLACK', 1509.12, 3.92, 2500),
  (100063, 'HS SUPER WHITE', 1233.05, 5.47, 3500),
  (100064, 'BLUE LAKE', 1871.75, 3.9, 2500),
  (100065, 'CRYSTAL SILVER', 830, 36.93, 330),
  (100066, 'SUNBEAM GOLD', 663.3, 25.73, 330),
  (100067, 'RADIANT RED', 627, 25.86, 330),
  (100068, 'GALAXY BLUE', 10, 49.69, 330),
  (100069, 'STELLAR GREEN', 329.8, 25.67, 330),
  (100070, 'ADJUSTER', 4900, 6.75, 2500),
  (100078, 'PROMOTER FOR PLASTIC', 1910, 2.71, 1000),
  (100100, '2K CLEAR', 7000, 1.53, 1000),
  (100108, '1200 REGMAL', 23, 89.98, 1),
  (100115, 'SOLARIS RED', 550, 32.59, 330),
  (100118, 'GRAPHITE GREY ZDL', 4020, 1.94, 1000),
  (100352, 'HAND BLOCK BIG', 1, 300, 1),
  (100353, 'HAND BLOCK SMALL', 1, 300, 1),
  (100354, '1K ASTAR (R-M) (NAX LUMINA)', 3600, 2.33, 1000),
  (100200, 'FAST BLUE', 1050, 7.94, 1000),
  (100201, 'DEEP ANGLE BLACK', 1018, 14.06, 1000),
  (100202, 'SPEED RED', 1050, 14.05, 1000),
  (100203, 'GOLD FLASH', 1050, 16.14, 1000),
  (100204, 'FIRESIDE COPPER', 270, 51.84, 330),
  (100205, 'COSMIC TORQUOISE', 340, 51.84, 1000),
  (100124, 'HS MIXING BASIC STRONG', 1050, 0.02, 1000),
  (100210, 'MACHINE POLISH', 300, 10.35, 1000),
  (100216, 'LEATHER  CARE', 951.4, 9.44, 355),
  (100217, 'LEATHER CONDITIONER', 599.95, 10.31, 355),
  (100219, 'CMX SURFACE PREP', 2500, 2.11, 1000),
  (100220, 'CERAMIC 3 IN 1 POLISH', 1000, 10.89, 473),
  (100221, 'BACK TO BLACK', 710, 11.06, 473),
  (100222, 'MAG & ALUMINUM POLISH', 232.39, 20.21, 141),
  (100223, 'PROFLINE NP 03-06', 2000, 7.5, 5000),
  (100226, 'DETAILING CLAY', 1500, 19.26, 200),
  (100306, 'ST APPLICATOR PAD YELLOW 30 PCS PACK', 2.96, 6.67, 12),
  (100312, 'SIPRIT WIPE', 600, 2, 700),
  (100233, 'RUST PREVENTIVE UNDERCOAT', 7000, 1, 1000),
  (100313, '100 REGMAL', 17, 89.78, 1),
  (100390, 'SCRAPPER STEEL R-M', 2, 100, 1000),
  (100317, 'DISS ENGINE D GREASER 5 LTR', 3000, 0.38, 5000),
  (100318, 'HARRIS DRESSING 5 LTR', 2200, 0.4, 5000),
  (100320, 'MAXIMA WOOLPAD LAMB SKIN 5"', 2.01, 550, 3),
  (100373, 'SILICON RM', 336, 2.24, 900),
  (100323, 'PD CUTTING PAD FLATE SURFACE RED 5"', 3, 1950, 3),
  (100324, 'PD POLISHING PAD YELLOW FLAT SURFFACE 5"', 3, 1950, 3),
  (100337, 'DECO WHITE (R-M)', 570, 1.07, 1000),
  (100339, 'SILVER PASTE', 150, 1.82, 100),
  (100376, 'WHITE KARVAAN', 2500, 0.99, 4000),
  (100188, 'ULTRAFINA SE POLISH', 800, 13.24, 1000),
  (100189, '3M POLISH ROSA', 710, 11.14, 1000),
  (100193, 'MICROFIBRE DETAILING CLOTH', 15, 450, 1),
  (100346, 'NEWZ PAPER (R-M)', 18000, 0.25, 1000),
  (100351, 'STEANER SET', 1, 200, 1),
  (100387, '2K HARDNER', 4000, 2.1, 500),
  (100391, 'SCRAPPER PLASTIC R-M', 2, 100, 1),
  (100393, 'SPRAY AIR FRESHNER 250 ML', 170, 5, 250),
  (100236, 'PETROL', 100, 0.41, 1000),
  (100241, 'DECO BLACK PAINT', 900, 0.82, 1000),
  (100327, 'THINER LOCAL (R-M)', 2000, 0.47, 800),
  (100329, '400 REGMAL (R-M)', 18, 88.94, 1),
  (100378, 'KOCHCHEMILE HEAVY CUT H9 01 (1LTR)', 600, 14.06, 1000),
  (100369, 'MEGUIARS ULTIMATE POLISH 473ML', 500, 13.59, 473),
  (100147, 'THINNER SLOW', 1000, 0.46, 5000),
  (100150, 'BROWAN  PAINT', 1697.01, 16.67, 1000);

-- Resolve match per xlsx row
IF OBJECT_ID('tempdb..#matched') IS NOT NULL DROP TABLE #matched;
SELECT
    x.Code, x.Name, x.Qty, x.Rate, x.UnitSize,
    COALESCE(pByCode.PaintItemID, pByName.PaintItemID) AS MatchedID
INTO #matched
FROM #xlsx x
LEFT JOIN paint_Item pByCode ON pByCode.PaintCode = CAST(x.Code AS NVARCHAR(50))
LEFT JOIN paint_Item pByName ON pByCode.PaintItemID IS NULL
                             AND UPPER(LTRIM(RTRIM(pByName.PaintName))) = UPPER(LTRIM(RTRIM(x.Name)));

DECLARE @updated INT = 0, @inserted INT = 0;

-- === Look up "Piece" UOMID once (owner rule: unit-size 1 => Piece) =======
DECLARE @pieceUomId INT;
SELECT @pieceUomId = PaintUOMID FROM paint_UOM WHERE UOMName = 'Piece';
IF @pieceUomId IS NULL RAISERROR('paint_UOM row "Piece" not found — cannot classify unit-size=1 items.', 16, 1);

-- === UPDATE matched rows: StockQty + AvgCost + PaintUOMID (if unit=1) ====
UPDATE pi
   SET pi.StockQty   = m.Qty,
       pi.AvgCost    = m.Rate,
       pi.PaintUOMID = CASE WHEN m.UnitSize = 1 THEN @pieceUomId ELSE pi.PaintUOMID END,
       pi.UpdatedAt  = GETDATE()
  FROM paint_Item pi
  INNER JOIN #matched m ON m.MatchedID = pi.PaintItemID
 WHERE ABS(pi.StockQty - m.Qty) > 0.0001
    OR ABS(pi.AvgCost  - m.Rate) > 0.0001
    OR (m.UnitSize = 1 AND (pi.PaintUOMID IS NULL OR pi.PaintUOMID <> @pieceUomId));
SET @updated = @@ROWCOUNT;

-- === INSERT new rows (unit-size 1 => Piece; else PaintUOMID NULL) =========
INSERT INTO paint_Item (PaintCode, PaintName, PaintCategoryID, PaintBrandID,
                        PaintUOMID, GSTDefaultOn, IsActive, StockQty, AvgCost)
SELECT CAST(m.Code AS NVARCHAR(50)), m.Name, NULL, NULL,
       CASE WHEN m.UnitSize = 1 THEN @pieceUomId ELSE NULL END,
       1, 1, m.Qty, m.Rate
  FROM #matched m
 WHERE m.MatchedID IS NULL;
SET @inserted = @@ROWCOUNT;

-- === UPSERT paint_ItemUOM FactorToBase from xlsx unit-size =================
-- Owner ask: treat xlsx unit-size as the FactorToBase for the item's
-- current base UoM. Skip items with PaintUOMID = NULL (they need a UoM
-- classified in the UI before pack-size can be attached).
DECLARE @uomUpserted INT = 0, @uomSkipped INT = 0;

MERGE paint_ItemUOM AS tgt
USING (
    SELECT pi.PaintItemID, pi.PaintUOMID, CAST(m.UnitSize AS DECIMAL(18,6)) AS Factor
      FROM paint_Item pi
      INNER JOIN #matched m ON m.MatchedID = pi.PaintItemID
     WHERE pi.PaintUOMID IS NOT NULL
) AS src
   ON tgt.PaintItemID = src.PaintItemID AND tgt.PaintUOMID = src.PaintUOMID
 WHEN MATCHED AND ABS(tgt.FactorToBase - src.Factor) > 0.000001 THEN
      UPDATE SET FactorToBase = src.Factor
 WHEN NOT MATCHED BY TARGET THEN
      INSERT (PaintItemID, PaintUOMID, FactorToBase)
      VALUES (src.PaintItemID, src.PaintUOMID, src.Factor);
SET @uomUpserted = @@ROWCOUNT;

SELECT @uomSkipped = COUNT(*)
  FROM paint_Item pi
  INNER JOIN #matched m ON m.MatchedID = pi.PaintItemID
 WHERE pi.PaintUOMID IS NULL;

PRINT '--- SUMMARY ---';
SELECT @updated AS RowsUpdated, @inserted AS RowsInserted,
       @uomUpserted AS UomFactorsWritten,
       @uomSkipped AS UomSkippedNoBaseUOM;

PRINT '--- Sample of updated rows (top 20 by biggest Qty delta) ---';
SELECT TOP 20 pi.PaintItemID, pi.PaintCode, pi.PaintName,
       pi.StockQty AS NewQty,
       pi.AvgCost, pi.StockValue
  FROM paint_Item pi
  INNER JOIN #matched m ON m.MatchedID = pi.PaintItemID
 ORDER BY ABS(m.Qty - pi.StockQty) DESC;

PRINT '--- All newly inserted rows ---';
SELECT pi.PaintItemID, pi.PaintCode, pi.PaintName, pi.StockQty, pi.AvgCost, pi.StockValue
  FROM paint_Item pi
  INNER JOIN #matched m ON m.MatchedID IS NULL
                       AND pi.PaintCode = CAST(m.Code AS NVARCHAR(50))
 ORDER BY pi.PaintItemID DESC;

-- To persist, change ROLLBACK to COMMIT below and re-run.
ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;
