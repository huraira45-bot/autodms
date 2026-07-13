-- 077_paint_lab_base_uom_reclassify.sql
-- Owner decisions 2026-07-10:
--   A. Real paints (Plastic primer 4300, Caltax polish, Decu putty) — convert
--      base UOM from Quater to Gram. StockQty × 946.35 (grams-per-Quater from
--      migration 070) becomes the new gram qty; AvgCost / 946.35 becomes the
--      per-gram cost. paint_StockLedger rows for these items rewrite the same
--      way (QuantityDelta × 946.35, UnitCost / 946.35, RunningQty × 946.35,
--      RunningAvgCost / 946.35). ValueDelta stays fixed — the rupee value
--      of every historical GRN row is invariant under UOM change.
--
--   B. Mis-classified sandpapers + PPF kit — change base UOM from Quater to
--      Piece. StockQty and AvgCost stay the same numeric values because they
--      already reflect piece counts and per-piece costs (they were just
--      mislabelled as Quaters). 600 Regmaal is included here too because
--      grit-600 sandpaper is a piece item; StockQty=0 makes it a no-op
--      quantity-wise.
--
-- Idempotent: each item block only fires if the item's current PaintUOMID
-- matches its expected pre-migration value. Safe to re-run.
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @gramUOM   INT = (SELECT PaintUOMID FROM paint_UOM WHERE UOMName = 'Gram');
    DECLARE @quaterUOM INT = (SELECT PaintUOMID FROM paint_UOM WHERE UOMName = 'Quater');
    DECLARE @pieceUOM  INT = (SELECT PaintUOMID FROM paint_UOM WHERE UOMName = 'Piece');
    DECLARE @quaterScale DECIMAL(18,4) = (SELECT Scale FROM paint_UOM WHERE UOMName = 'Quater');

    IF @gramUOM   IS NULL THROW 51001, 'Gram UOM not found',   1;
    IF @quaterUOM IS NULL THROW 51002, 'Quater UOM not found', 1;
    IF @pieceUOM  IS NULL THROW 51003, 'Piece UOM not found',  1;
    IF @quaterScale IS NULL OR @quaterScale <> 946.35
        THROW 51004, 'Quater UOM Scale is not 946.35 — run migration 070 first', 1;

    -- ============================================================
    -- Part A — Convert Quater-base paint items to Gram-base.
    -- Item list is explicit (not a WHERE u.Scale > 0 scan) because
    -- REGMAL family shares Quater but is NOT a paint; keep explicit.
    -- ============================================================
    DECLARE @paints TABLE (PaintItemID INT PRIMARY KEY);
    INSERT INTO @paints VALUES (276), (277), (278);
    -- 276: Plastic primer 4300
    -- 277: Decu putty
    -- 278: Caltax polish

    DECLARE @pid INT;
    DECLARE @curUOM INT, @curQty DECIMAL(18,4), @curCost DECIMAL(18,4);

    DECLARE paint_cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT PaintItemID FROM @paints ORDER BY PaintItemID;
    OPEN paint_cur;
    FETCH NEXT FROM paint_cur INTO @pid;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @curUOM = PaintUOMID, @curQty = StockQty, @curCost = AvgCost
        FROM   paint_Item WHERE PaintItemID = @pid;

        IF @curUOM = @quaterUOM
        BEGIN
            -- paint_Item: flip base to Gram, rescale qty and cost.
            UPDATE paint_Item
            SET PaintUOMID = @gramUOM,
                StockQty  = CAST(@curQty  * @quaterScale AS DECIMAL(18,4)),
                AvgCost   = CAST(@curCost / @quaterScale AS DECIMAL(18,4)),
                UpdatedAt = GETDATE()
            WHERE PaintItemID = @pid;

            -- paint_ItemUOM: the old self-row was (pid, Quater, 1). Convert
            -- it to (pid, Quater, 946.35) so Quater becomes an alt-UOM with
            -- correct factor. Then add the new self-row (pid, Gram, 1).
            UPDATE paint_ItemUOM
            SET FactorToBase = @quaterScale
            WHERE PaintItemID = @pid AND PaintUOMID = @quaterUOM;

            IF NOT EXISTS (SELECT 1 FROM paint_ItemUOM WHERE PaintItemID = @pid AND PaintUOMID = @gramUOM)
                INSERT INTO paint_ItemUOM (PaintItemID, PaintUOMID, FactorToBase)
                VALUES (@pid, @gramUOM, 1);

            -- paint_StockLedger: rewrite every row for this item.
            -- QuantityDelta × 946.35, UnitCost / 946.35, ValueDelta unchanged,
            -- RunningQty × 946.35, RunningAvgCost / 946.35.
            UPDATE paint_StockLedger
            SET QuantityDelta  = CAST(QuantityDelta  * @quaterScale AS DECIMAL(18,4)),
                UnitCost       = CAST(UnitCost       / @quaterScale AS DECIMAL(18,4)),
                RunningQty     = CAST(RunningQty     * @quaterScale AS DECIMAL(18,4)),
                RunningAvgCost = CAST(RunningAvgCost / @quaterScale AS DECIMAL(18,4))
            WHERE PaintItemID = @pid;

            PRINT '  Paint ' + CAST(@pid AS NVARCHAR(10)) + ': Quater -> Gram (qty ' +
                  CAST(@curQty AS NVARCHAR(20)) + ' -> ' + CAST(@curQty * @quaterScale AS NVARCHAR(20)) +
                  ', cost ' + CAST(@curCost AS NVARCHAR(20)) + ' -> ' + CAST(@curCost / @quaterScale AS NVARCHAR(20)) + ')';
        END
        ELSE
            PRINT '  Paint ' + CAST(@pid AS NVARCHAR(10)) + ': skip (base is not Quater)';

        FETCH NEXT FROM paint_cur INTO @pid;
    END
    CLOSE paint_cur;
    DEALLOCATE paint_cur;

    -- ============================================================
    -- Part B — Reclassify sandpaper + PPF kit to Piece base.
    -- StockQty and AvgCost stay the same numerically; only the UOM label
    -- changes. paint_ItemUOM self-row swaps from Quater to Piece.
    -- paint_StockLedger doesn't need value changes.
    -- ============================================================
    DECLARE @pieces TABLE (PaintItemID INT PRIMARY KEY);
    INSERT INTO @pieces VALUES (226), (197), (259), (279);
    -- 226: 100 REGMAL   197: 120 REGMAL   259: PPF KIT135   279: 600 Regmaal

    DECLARE piece_cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT PaintItemID FROM @pieces ORDER BY PaintItemID;
    OPEN piece_cur;
    FETCH NEXT FROM piece_cur INTO @pid;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @curUOM = PaintUOMID FROM paint_Item WHERE PaintItemID = @pid;

        IF @curUOM = @quaterUOM
        BEGIN
            UPDATE paint_Item
            SET PaintUOMID = @pieceUOM, UpdatedAt = GETDATE()
            WHERE PaintItemID = @pid;

            -- Swap the self-row from Quater to Piece. The old Quater row
            -- becomes meaningless for this item so remove it; add a Piece
            -- self-row with FactorToBase=1.
            DELETE FROM paint_ItemUOM
            WHERE PaintItemID = @pid AND PaintUOMID = @quaterUOM;

            IF NOT EXISTS (SELECT 1 FROM paint_ItemUOM WHERE PaintItemID = @pid AND PaintUOMID = @pieceUOM)
                INSERT INTO paint_ItemUOM (PaintItemID, PaintUOMID, FactorToBase)
                VALUES (@pid, @pieceUOM, 1);

            PRINT '  Piece ' + CAST(@pid AS NVARCHAR(10)) + ': Quater -> Piece';
        END
        ELSE
            PRINT '  Piece ' + CAST(@pid AS NVARCHAR(10)) + ': skip (base is not Quater)';

        FETCH NEXT FROM piece_cur INTO @pid;
    END
    CLOSE piece_cur;
    DEALLOCATE piece_cur;

    COMMIT TRANSACTION;
    PRINT '077_paint_lab_base_uom_reclassify complete.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'FAILED: ' + @errMsg;
    THROW;
END CATCH;
