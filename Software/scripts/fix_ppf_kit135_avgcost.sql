-- =============================================================================
-- Correct paint_Item.AvgCost for PPF KIT135 7 years (PaintItemID 259)
--
-- Root cause: paint_StockLedger row 794 (PGRN-0003 finalized 2026-07-10 15:57)
-- posted UnitCost 17,500 instead of the true invoice cost of 175,500 (missing
-- a zero). That single bad receipt polluted the weighted average forever
-- after; subsequent GRNs (PGRN-0006, PGRN-0007) at the correct 175,500 could
-- not pull the avg back to the true price because it kept being blended with
-- the mis-costed inventory.
--
-- Owner-approved correction 2026-07-21: patch AvgCost to the invoice value
-- (175,500) and record a marker row in paint_StockLedger so the change is
-- audit-visible. Historic paint_IssueDetail rows (PI-0021, PI-0046) keep
-- their frozen IssueUnitCost since those issues have already flowed into
-- their respective JCs — un-freezing them would need to reverse and re-post
-- multiple JC vouchers. Every FUTURE issue will now pin at 175,500.
--
-- Safe to re-run: guarded by a check on the current AvgCost.
-- =============================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @itemId INT       = 259;
DECLARE @newAvg DECIMAL(18,4) = 175500.0000;
DECLARE @whId   INT;
DECLARE @stock  DECIMAL(18,4);
DECLARE @oldAvg DECIMAL(18,4);
DECLARE @user   NVARCHAR(100) = SUSER_SNAME();

SELECT @stock  = StockQty,
       @oldAvg = AvgCost
FROM   paint_Item
WHERE  PaintItemID = @itemId;

IF @stock IS NULL
BEGIN
    RAISERROR('PaintItemID %d not found.', 16, 1, @itemId);
    RETURN;
END;

IF ABS(@oldAvg - @newAvg) < 0.01
BEGIN
    PRINT 'AvgCost is already 175,500 — nothing to do.';
    RETURN;
END;

PRINT 'Before: StockQty=' + CAST(@stock AS NVARCHAR(20))
    + '  AvgCost=' + CAST(@oldAvg AS NVARCHAR(20))
    + '  StockValue=' + CAST(@stock * @oldAvg AS NVARCHAR(20));

-- Pick the warehouse from this item's most recent ledger row for the
-- adjustment marker.
SELECT TOP 1 @whId = PaintWHID
FROM   paint_StockLedger
WHERE  PaintItemID = @itemId
ORDER  BY LedgerID DESC;

BEGIN TRANSACTION;

-- 1) Update the item's running avg cost. StockValue is a computed column so
--    it auto-recomputes from StockQty * AvgCost.
UPDATE paint_Item
SET    AvgCost   = @newAvg,
       UpdatedAt = GETDATE()
WHERE  PaintItemID = @itemId;

-- 2) Log the correction in the stock ledger. Uses SourceType 'ISSUE_ADJ'
--    (the closest existing tag for a non-movement value adjustment) with
--    QuantityDelta = 0 so stock is unchanged. ValueDelta captures the
--    money change so the ledger and StockValue reconcile.
DECLARE @valueDelta DECIMAL(18,2) = CAST((@newAvg - @oldAvg) * @stock AS DECIMAL(18,2));

INSERT INTO paint_StockLedger
    (MovementAt, PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
     QuantityDelta, UnitCost, ValueDelta,
     RunningQty, RunningAvgCost,
     Note, CreatedBy, CreatedByName)
VALUES
    (GETDATE(), @itemId, @whId, 'ISSUE_ADJ', NULL, NULL,
     0, @newAvg, @valueDelta,
     @stock, @newAvg,
     'AvgCost corrected 148,333.33 -> 175,500. PGRN-0003 (Ledger 794) was posted at Rs 17,500 (typo for Rs 175,500), polluting the running average. Owner-approved patch 2026-07-21. Historic issue lines keep their frozen cost.',
     NULL, @user);

COMMIT TRANSACTION;

SELECT PaintItemID, PaintName, StockQty, AvgCost, StockValue
FROM   paint_Item
WHERE  PaintItemID = @itemId;

PRINT 'AvgCost corrected. Next paint issue will pin at Rs 175,500 / piece.';
