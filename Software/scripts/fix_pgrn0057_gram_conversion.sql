-- fix_pgrn0057_gram_conversion.sql
-- PGRN-0057 (PaintGRNID=9) was received with 7 lines entered directly
-- against each item's Gram base UoM instead of via Piece x GramsPerUnit
-- (e.g. "2" instead of "2 boxes x 330g = 660g" for GALAXY BLUE). Owner
-- confirmed the GRN GrandTotal (Rs 180,533.21) is correct — matches the
-- real supplier bill — so this is purely a quantity-unit error, not a
-- money error. No GL voucher is touched; only the GRN detail lines and
-- the affected items' current StockQty/AvgCost are corrected.
--
-- Method: each item's total current inventory VALUE (StockQty x AvgCost)
-- is unchanged (no money was ever wrong) — only the true gram quantity
-- was undercounted by (GramsPerUnit - 1) x OriginalQty. Corrected
-- AvgCost = CurrentValue / CorrectedStockQty.
--
-- GRN lines: Quantity x GramsPerUnit, UnitRate / GramsPerUnit — LineTotal
-- (and therefore GrandTotal) is mathematically unchanged.
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

PRINT '===== BEFORE (paint_Item) =====';
SELECT PaintItemID, PaintCode, StockQty, AvgCost
FROM paint_Item
WHERE PaintItemID IN (184,147,143,159,187,194,343)
ORDER BY PaintItemID;

PRINT '===== BEFORE (paint_GRNDetail) =====';
SELECT PaintGRNDetailID, PaintItemID, Quantity, UnitRate, LineTotal
FROM paint_GRNDetail
WHERE PaintGRNID = 9
ORDER BY PaintGRNDetailID;

-- ── Correct GRN detail lines (Quantity x GramsPerUnit, UnitRate / GramsPerUnit) ──
UPDATE paint_GRNDetail SET Quantity = 660.0000,    UnitRate = 52.7375  WHERE PaintGRNDetailID = 92; -- GALAXY BLUE: 2 x 330
UPDATE paint_GRNDetail SET Quantity = 3000.0000,   UnitRate = 8.0576   WHERE PaintGRNDetailID = 93; -- HS JET BLACK: 3 x 1000
UPDATE paint_GRNDetail SET Quantity = 1000.0000,   UnitRate = 8.0576   WHERE PaintGRNDetailID = 94; -- TONE CONTROLER: 1 x 1000
UPDATE paint_GRNDetail SET Quantity = 1000.0000,   UnitRate = 8.0576   WHERE PaintGRNDetailID = 95; -- HS MEDIUM FINE ALUMINIUM: 1 x 1000
UPDATE paint_GRNDetail SET Quantity = 5000.0000,   UnitRate = 7.5481   WHERE PaintGRNDetailID = 96; -- BASECOAT FLIP CONTROLLER: 2 x 2500
UPDATE paint_GRNDetail SET Quantity = 3000.0000,   UnitRate = 3.5051   WHERE PaintGRNDetailID = 97; -- POLISH: 6 x 500
UPDATE paint_GRNDetail SET Quantity = 4800.0000,   UnitRate = 9.0890   WHERE PaintGRNDetailID = 98; -- MS HARDNER EXPRESS: 6 x 800

-- ── Correct item master current state (value-preserving) ──
UPDATE paint_Item SET StockQty = 707.0000,    AvgCost = 43.2116,  UpdatedAt = GETDATE() WHERE PaintItemID = 184; -- GALAXY BLUE
UPDATE paint_Item SET StockQty = 3377.0000,   AvgCost = 6.7158,   UpdatedAt = GETDATE() WHERE PaintItemID = 147; -- HS JET BLACK
UPDATE paint_Item SET StockQty = 2264.0000,   AvgCost = 7.5885,   UpdatedAt = GETDATE() WHERE PaintItemID = 143; -- TONE CONTROLER
UPDATE paint_Item SET StockQty = 2052.0000,   AvgCost = 15.7610,  UpdatedAt = GETDATE() WHERE PaintItemID = 159; -- HS MEDIUM FINE ALUMINIUM
UPDATE paint_Item SET StockQty = 5004.0520,   AvgCost = 23.0885,  UpdatedAt = GETDATE() WHERE PaintItemID = 187; -- BASECOAT FLIP CONTROLLER
UPDATE paint_Item SET StockQty = 3580.0000,   AvgCost = 2.5918,   UpdatedAt = GETDATE() WHERE PaintItemID = 194; -- POLISH
UPDATE paint_Item SET StockQty = 4812.0000,   AvgCost = 27.7582,  UpdatedAt = GETDATE() WHERE PaintItemID = 343; -- MS HARDNER EXPRESS

-- ── Ledger documentation rows (one per item, no GL impact) ──
INSERT INTO paint_StockLedger (PaintItemID, PaintWHID, SourceType, SourceDocID, QuantityDelta, UnitCost, ValueDelta, RunningQty, RunningAvgCost, Note)
SELECT i.PaintItemID, wh.PaintWHID, 'ISSUE_ADJ', 9, corr.DeltaQty, i.AvgCost, 0, i.StockQty, i.AvgCost, 'Correction: PGRN-0057 entered per box against Gram UoM. Rescaled via GramsPerUnit, total value unchanged.'
FROM paint_Item i
CROSS APPLY (SELECT TOP 1 PaintWHID FROM paint_StockLedger WHERE PaintItemID = i.PaintItemID ORDER BY LedgerID DESC) wh
CROSS APPLY (SELECT CASE i.PaintItemID
    WHEN 184 THEN 658.0000
    WHEN 147 THEN 2997.0000
    WHEN 143 THEN 999.0000
    WHEN 159 THEN 999.0000
    WHEN 187 THEN 4998.0000
    WHEN 194 THEN 2994.0000
    WHEN 343 THEN 4794.0000
END AS DeltaQty) corr
WHERE i.PaintItemID IN (184,147,143,159,187,194,343);

PRINT '===== AFTER (paint_Item) =====';
SELECT PaintItemID, PaintCode, StockQty, AvgCost
FROM paint_Item
WHERE PaintItemID IN (184,147,143,159,187,194,343)
ORDER BY PaintItemID;

PRINT '===== AFTER (paint_GRNDetail) =====';
SELECT PaintGRNDetailID, PaintItemID, Quantity, UnitRate, LineTotal
FROM paint_GRNDetail
WHERE PaintGRNID = 9
ORDER BY PaintGRNDetailID;

PRINT '===== GRN header (should be unchanged) =====';
SELECT PaintGRNID, GRNNo, Status, SubTotal, DiscountTotal, GSTTotal, AITTotal, GrandTotal
FROM paint_GRN WHERE PaintGRNID = 9;

COMMIT TRANSACTION;
PRINT 'fix_pgrn0057_gram_conversion complete.';
