-- ================================================================
-- Rollback PGRN-0057 stock + reset status so it can be re-finalized
-- with the new (5-leg) voucher journal.
--
-- Current state:
--   paint_GRN.Status = Posted
--   paint_GRN.VoucherID = 2616 (PV-0193, already Reversed via
--                               postReversalVoucher)
--   paint_Item.StockQty and paint_Item.AvgCost STILL inflated with
--                               each line's original LineTotal
--                               (gross − disc + gst + ait)
--   paint_StockLedger has 7 positive GRN rows, no reversal rows
--
-- What this does:
--   1. Reverses paint_Item.StockQty and paint_Item.AvgCost using the
--      original LineTotal on each paint_GRNDetail row (this is what
--      the OLD finalize added, so we must remove exactly that).
--   2. Inserts negative paint_StockLedger rows for the audit trail.
--   3. Flips paint_GRN.Status → Draft and clears VoucherID.
--
-- After this runs, owner clicks Finalize in the UI → new voucher
-- posts with the correct 5-leg journal AND the new stock ledger
-- with paint cost only (gross − disc, no GST/AIT in AvgCost).
--
-- Dry-run by default. Flip ROLLBACK → COMMIT after review.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
BEGIN TRANSACTION;

DECLARE @grnId INT = 9;   -- PGRN-0057
DECLARE @whId  INT = (SELECT PaintWHID FROM paint_GRN WHERE PaintGRNID = @grnId);

PRINT '--- BEFORE ---';
SELECT g.PaintGRNID, g.GRNNo, g.Status, g.VoucherID FROM paint_GRN g WHERE g.PaintGRNID = @grnId;
SELECT d.PaintGRNDetailID, pi.PaintName, pi.StockQty AS BeforeQty, pi.AvgCost AS BeforeAvg, d.LineTotal
  FROM paint_GRNDetail d INNER JOIN paint_Item pi ON pi.PaintItemID = d.PaintItemID
 WHERE d.PaintGRNID = @grnId ORDER BY d.PaintGRNDetailID;

-- Reverse paint_Item stock + avg for each line
;WITH ln AS (
    SELECT d.PaintGRNDetailID, d.PaintItemID, d.PaintUOMID, d.Quantity, d.LineTotal,
           ISNULL(iu.FactorToBase, 1.0) AS Factor,
           d.Quantity * ISNULL(iu.FactorToBase, 1.0) AS BaseQty
      FROM paint_GRNDetail d
      LEFT JOIN paint_ItemUOM iu ON iu.PaintItemID = d.PaintItemID AND iu.PaintUOMID = d.PaintUOMID
     WHERE d.PaintGRNID = @grnId
)
UPDATE pi
   SET pi.AvgCost = CASE
                       WHEN pi.StockQty - ln.BaseQty > 0.0001 THEN
                         ROUND((pi.StockQty * pi.AvgCost - ln.LineTotal) / (pi.StockQty - ln.BaseQty), 4)
                       ELSE 0
                    END,
       pi.StockQty  = ROUND(pi.StockQty - ln.BaseQty, 4),
       pi.UpdatedAt = GETDATE()
  FROM paint_Item pi
  INNER JOIN ln ON ln.PaintItemID = pi.PaintItemID;

-- Reversal ledger rows (audit trail)
INSERT INTO paint_StockLedger
        (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
         QuantityDelta, UnitCost, ValueDelta,
         RunningQty, RunningAvgCost, Note, CreatedByName)
SELECT d.PaintItemID, @whId, 'GRN', @grnId, d.PaintGRNDetailID,
       -d.Quantity * ISNULL(iu.FactorToBase, 1.0)                                                AS QDelta,
       CASE WHEN d.Quantity * ISNULL(iu.FactorToBase, 1.0) > 0
            THEN ROUND(d.LineTotal / (d.Quantity * ISNULL(iu.FactorToBase, 1.0)), 4)
            ELSE 0 END                                                                            AS UC,
       -d.LineTotal                                                                               AS VDelta,
       pi.StockQty                                                                                AS RunQ,
       pi.AvgCost                                                                                 AS RunAvg,
       'GRN PGRN-0057 stock rolled back — manual (unfinalize half-completed 2026-07-28)',
       'system'
  FROM paint_GRNDetail d
  INNER JOIN paint_Item pi ON pi.PaintItemID = d.PaintItemID
  LEFT JOIN paint_ItemUOM iu ON iu.PaintItemID = d.PaintItemID AND iu.PaintUOMID = d.PaintUOMID
 WHERE d.PaintGRNID = @grnId;

-- Flip GRN back to Draft so owner can re-Finalize normally
UPDATE paint_GRN SET Status = 'Draft', VoucherID = NULL WHERE PaintGRNID = @grnId;

PRINT '--- AFTER ---';
SELECT g.PaintGRNID, g.GRNNo, g.Status, g.VoucherID FROM paint_GRN g WHERE g.PaintGRNID = @grnId;
SELECT d.PaintGRNDetailID, pi.PaintName, pi.StockQty AS AfterQty, pi.AvgCost AS AfterAvg
  FROM paint_GRNDetail d INNER JOIN paint_Item pi ON pi.PaintItemID = d.PaintItemID
 WHERE d.PaintGRNID = @grnId ORDER BY d.PaintGRNDetailID;

ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;
