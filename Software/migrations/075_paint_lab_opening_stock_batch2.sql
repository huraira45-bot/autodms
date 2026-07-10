-- 075_paint_lab_opening_stock_batch2.sql
-- Owner ask 2026-07-10: add 8 paint items with opening stock, post JV
--   Dr 102001010 PAINT MATERIAL STOCK (B/P)     total value
--   Cr 301001001 CAPITAL ACCOUNT                 total value
--
-- Idempotent per item: if a PaintCode already exists on paint_Item, that row
-- is skipped entirely (no duplicate INSERT, no double stock, no double JV
-- amount). The JV only posts if at least one new item was actually seeded
-- this run, so re-running the script is safe.
--
-- Uses SourceType='GRN' with SourceDocID=NULL for the paint_StockLedger
-- opening row — same pattern the earlier Rs 27M opening batch used (owner
-- 2026-06-30), because paint_StockLedger's CK constraint only allows
-- SourceType IN ('GRN','GRTN','ISSUE','ISSUE_ADJ','ISSUE_DEL','JC_UNFIN').
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Business date for this batch — owner backdates to 1 July 2026 so it lands
-- in the correct accounting period. System audit stamps (paint_Item.UpdatedAt,
-- data_FinanceVoucherInfo.PostedAt) still use GETDATE() to reflect the actual
-- moment the rows were written.
DECLARE @openingDate DATETIME = '2026-07-01';

BEGIN TRY
    BEGIN TRANSACTION;

    -- Ensure the 'Gram' UOM exists (migration 067 only seeded Litre/ML/Gallon/
    -- Piece/Kg; 070 sets scales but doesn't INSERT).
    IF NOT EXISTS (SELECT 1 FROM paint_UOM WHERE UOMName = 'Gram')
        INSERT INTO paint_UOM (UOMName, Scale) VALUES ('Gram', 1);

    DECLARE @gramUOM  INT = (SELECT PaintUOMID FROM paint_UOM WHERE UOMName = 'Gram');
    DECLARE @pieceUOM INT = (SELECT PaintUOMID FROM paint_UOM WHERE UOMName = 'Piece');
    DECLARE @whID     INT = (SELECT TOP 1 PaintWHID FROM paint_Warehouse
                             WHERE WHCode = 'PAINT-01' OR WHDesc = 'Paint Store'
                             ORDER BY PaintWHID);
    DECLARE @stockGL   INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode = '102001010');
    DECLARE @capitalGL INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode = '301001001');

    IF @gramUOM   IS NULL THROW 51001, 'Gram UOM not found/created',      1;
    IF @pieceUOM  IS NULL THROW 51002, 'Piece UOM not found',              1;
    IF @whID      IS NULL THROW 51003, 'Paint warehouse PAINT-01 not found', 1;
    IF @stockGL   IS NULL THROW 51004, 'GL 102001010 (Paint Stock) not found', 1;
    IF @capitalGL IS NULL THROW 51005, 'GL 301001001 (Capital) not found',    1;

    DECLARE @items TABLE (
        PaintCode NVARCHAR(50) PRIMARY KEY,
        PaintName NVARCHAR(200),
        UOMID     INT,
        Qty       DECIMAL(18,4),
        Rate      DECIMAL(18,4)
    );

    INSERT INTO @items (PaintCode, PaintName, UOMID, Qty, Rate) VALUES
        ('100184', 'STAIN MEX APC',      @gramUOM,  2350.00,   2.00),
        ('100378', 'H9',                 @gramUOM,   480.00,  14.06),
        ('100369', 'ULTIMATE POLISH',    @gramUOM,   786.00,  13.59),
        ('100223', 'PROFLINE 03-06',     @gramUOM,  2527.00,   7.50),
        ('100219', 'CMX PRAP',           @gramUOM,  3657.00,   2.11),
        ('100317', 'RUST MEX',           @gramUOM,  3260.00,   0.38),
        ('100193', 'MICROFIBER CLOTH',   @pieceUOM,   23.00, 450.00),
        ('100376', 'WHITE KARVAAN 6846', @gramUOM,  4580.00,   0.99);

    DECLARE @totalValue DECIMAL(18,2) = 0;
    DECLARE @addedCount INT = 0;
    DECLARE @skipCount  INT = 0;

    DECLARE @paintItemID INT,
            @paintCode   NVARCHAR(50),
            @paintName   NVARCHAR(200),
            @uomID       INT,
            @qty         DECIMAL(18,4),
            @rate        DECIMAL(18,4),
            @value       DECIMAL(18,2);

    DECLARE items_cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT PaintCode, PaintName, UOMID, Qty, Rate FROM @items ORDER BY PaintCode;

    OPEN items_cur;
    FETCH NEXT FROM items_cur INTO @paintCode, @paintName, @uomID, @qty, @rate;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM paint_Item WHERE PaintCode = @paintCode)
        BEGIN
            PRINT '  SKIP: ' + @paintCode + ' (' + @paintName + ') already exists.';
            SET @skipCount = @skipCount + 1;
        END
        ELSE
        BEGIN
            INSERT INTO paint_Item (PaintCode, PaintName, PaintUOMID, StockQty, AvgCost)
            VALUES (@paintCode, @paintName, @uomID, 0, 0);
            SET @paintItemID = SCOPE_IDENTITY();

            -- Base-UOM self-row (per migration 069 convention).
            INSERT INTO paint_ItemUOM (PaintItemID, PaintUOMID, FactorToBase)
            VALUES (@paintItemID, @uomID, 1);

            SET @value = CAST(@qty * @rate AS DECIMAL(18,2));

            INSERT INTO paint_StockLedger
                (MovementAt, PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
                 QuantityDelta, UnitCost, ValueDelta, RunningQty, RunningAvgCost)
            VALUES
                (@openingDate, @paintItemID, @whID, 'GRN', NULL, NULL,
                 @qty, @rate, @value, @qty, @rate);

            UPDATE paint_Item
            SET StockQty = @qty, AvgCost = @rate, UpdatedAt = GETDATE()
            WHERE PaintItemID = @paintItemID;

            PRINT '  ADD:  ' + @paintCode + ' (' + @paintName + ') qty=' +
                  CAST(@qty AS NVARCHAR(20)) + ' @ ' + CAST(@rate AS NVARCHAR(20)) +
                  ' = PKR ' + CAST(@value AS NVARCHAR(20));

            SET @totalValue = @totalValue + @value;
            SET @addedCount = @addedCount + 1;
        END

        FETCH NEXT FROM items_cur INTO @paintCode, @paintName, @uomID, @qty, @rate;
    END

    CLOSE items_cur;
    DEALLOCATE items_cur;

    -- If nothing new was added, don't post a zero-value JV.
    IF @addedCount = 0
    BEGIN
        PRINT 'No new items to add. Skipping JV. (Added=0, Skipped=' + CAST(@skipCount AS NVARCHAR(10)) + ')';
        COMMIT TRANSACTION;
        RETURN;
    END

    -- Post JV: Dr Paint Stock / Cr Capital, formatted per §14.22 opening-balance
    -- convention (JV-OB-YYYY-MM-NNNN) drawing from seq_Voucher_JV.
    -- Live has duplicate 'JV' rows on GLVoucherType (observed 2026-07-10);
    -- pick the lowest ID deterministically instead of assuming uniqueness.
    DECLARE @jvTypeID INT = (SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title = 'JV' ORDER BY Voucherid);
    IF @jvTypeID IS NULL THROW 51006, 'JV voucher type missing', 1;

    DECLARE @seqN INT = NEXT VALUE FOR dbo.seq_Voucher_JV;
    DECLARE @yyyymm NVARCHAR(7) = CONVERT(NVARCHAR(7), @openingDate, 121);
    DECLARE @voucherNo NVARCHAR(50) =
        'JV-OB-' + @yyyymm + '-' + RIGHT('0000' + CAST(@seqN AS NVARCHAR(10)), 4);
    DECLARE @narration NVARCHAR(500) =
        'Paint Lab opening stock — ' + CAST(@addedCount AS NVARCHAR(10)) +
        ' items @ ' + CONVERT(NVARCHAR(10), @openingDate, 121);
    DECLARE @voucherID INT;

    INSERT INTO data_FinanceVoucherInfo
        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
         Status, Posted, SourceDocType, SourceDocID)
    VALUES
        (@openingDate, @voucherNo, @jvTypeID, @narration, @totalValue,
         'Draft', 0, 'VOUCHER', NULL);
    SET @voucherID = SCOPE_IDENTITY();

    INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit) VALUES
        (@voucherID, @stockGL,   'Paint Lab opening stock (8 items)',                @totalValue, 0),
        (@voucherID, @capitalGL, 'Paint Lab opening stock — capital contribution',   0,           @totalValue);

    -- Flip to Posted; balanced-entry trigger validates Dr = Cr.
    UPDATE data_FinanceVoucherInfo
    SET Status = 'Posted', Posted = 1, PostedAt = GETDATE()
    WHERE VoucherID = @voucherID;

    PRINT '  JV ' + @voucherNo + ' posted for PKR ' + CAST(@totalValue AS NVARCHAR(20)) +
          ' (added=' + CAST(@addedCount AS NVARCHAR(10)) +
          ', skipped=' + CAST(@skipCount AS NVARCHAR(10)) + ')';

    COMMIT TRANSACTION;
    PRINT '075_paint_lab_opening_stock_batch2 complete.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'FAILED: ' + @errMsg;
    THROW;
END CATCH;
