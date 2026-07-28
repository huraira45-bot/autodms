-- ================================================================
-- Rollback PGRN-0057 stock + reset status so it can be re-finalized
-- with the new (5-leg) voucher journal.
--
-- Current state:
--   paint_GRN.Status = Posted
--   paint_GRN.VoucherID = 2616 (PV-0193, already Reversed via
--                               postReversalVoucher)
--   paint_Item still carries the qty/value the finalize added
--   paint_StockLedger has 7 positive GRN rows, no reversal rows
--
-- Approach: reverse using the LEDGER row's actual QuantityDelta /
-- ValueDelta, not paint_GRNDetail × paint_ItemUOM.FactorToBase.
-- The paint reconcile earlier today changed several items' base
-- UoM and factor, so re-computing baseQty from current FactorToBase
-- gives wildly wrong numbers (see previous dry-run: GALAXY BLUE
-- went to -606). The ledger has the qty and value that were
-- ACTUALLY added at finalize time — safe ground truth.
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
SELECT sl.LedgerID, pi.PaintName,
       sl.QuantityDelta AS AddedQty, sl.ValueDelta AS AddedValue,
       pi.StockQty AS BeforeStockQty, pi.AvgCost AS BeforeAvgCost
  FROM paint_StockLedger sl
  INNER JOIN paint_Item pi ON pi.PaintItemID = sl.PaintItemID
 WHERE sl.SourceType = 'GRN' AND sl.SourceDocID = @grnId
 ORDER BY sl.LedgerID;

-- Reverse paint_Item stock + avg using the ORIGINAL ledger values.
;WITH ln AS (
    SELECT sl.PaintItemID,
           sl.QuantityDelta AS QAdd,
           sl.ValueDelta    AS VAdd,
           sl.SourceDetailID
      FROM paint_StockLedger sl
     WHERE sl.SourceType = 'GRN' AND sl.SourceDocID = @grnId
)
UPDATE pi
   SET pi.AvgCost = CASE
                       WHEN pi.StockQty - ln.QAdd > 0.0001 THEN
                         ROUND((pi.StockQty * pi.AvgCost - ln.VAdd) / (pi.StockQty - ln.QAdd), 4)
                       ELSE 0
                    END,
       pi.StockQty  = ROUND(pi.StockQty - ln.QAdd, 4),
       pi.UpdatedAt = GETDATE()
  FROM paint_Item pi
  INNER JOIN ln ON ln.PaintItemID = pi.PaintItemID;

-- Reversal ledger rows (audit trail)
INSERT INTO paint_StockLedger
        (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
         QuantityDelta, UnitCost, ValueDelta,
         RunningQty, RunningAvgCost, Note, CreatedByName)
SELECT sl.PaintItemID, @whId, 'GRN', @grnId, sl.SourceDetailID,
       -sl.QuantityDelta,
       sl.UnitCost,
       -sl.ValueDelta,
       pi.StockQty,                    -- freshly updated by UPDATE above
       pi.AvgCost,
       'GRN PGRN-0057 stock rolled back — manual (unfinalize half-completed 2026-07-28)',
       'system'
  FROM paint_StockLedger sl
  INNER JOIN paint_Item pi ON pi.PaintItemID = sl.PaintItemID
 WHERE sl.SourceType = 'GRN' AND sl.SourceDocID = @grnId;

-- Flip GRN back to Draft so owner can re-Finalize normally
UPDATE paint_GRN SET Status = 'Draft', VoucherID = NULL WHERE PaintGRNID = @grnId;

PRINT '--- AFTER ---';
SELECT g.PaintGRNID, g.GRNNo, g.Status, g.VoucherID FROM paint_GRN g WHERE g.PaintGRNID = @grnId;
SELECT pi.PaintItemID, pi.PaintName, pi.StockQty AS AfterQty, pi.AvgCost AS AfterAvg
  FROM paint_Item pi
 WHERE pi.PaintItemID IN (
     SELECT DISTINCT PaintItemID FROM paint_StockLedger WHERE SourceType='GRN' AND SourceDocID=@grnId
 )
 ORDER BY pi.PaintItemID;

ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;
