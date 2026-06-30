SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER PROCEDURE sp_SavePurchaseReturn
    @ReturnDate DATETIME,
    @PartyID INT,
    @WHID INT,
    @Remarks NVARCHAR(MAX),
    @NetAmount DECIMAL(18,2),
    @DiscountAmount DECIMAL(18,2),
    @OriginalGRNID INT = NULL,
    @ItemsJSON NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ReturnID INT;
        DECLARE @ReturnNo NVARCHAR(50);
        SELECT @ReturnNo = 'GRTN-' + RIGHT('00000' + CAST(ISNULL(MAX(PurchaseReturnID), 0) + 1 AS NVARCHAR), 5)
        FROM data_PurchaseReturnInfo;

        INSERT INTO data_PurchaseReturnInfo (
            PurchaseReturnDate, PartyID, WHID, Remarks,
            NetAmount, DiscountAmount, PurchaseID,
            PurchaseReturnNo, EntryUserDateTime, CompanyID, BranchID
        )
        VALUES (
            @ReturnDate, @PartyID, @WHID, @Remarks,
            @NetAmount, @DiscountAmount, @OriginalGRNID,
            @ReturnNo, GETDATE(), 1, 1
        );
        SET @ReturnID = SCOPE_IDENTITY();

        INSERT INTO data_PurchaseReturnDetail (
            PurchaseReturnID, ItemId, Quantity, ItemRate, TaxOneAmount, NetAmount
        )
        SELECT
            @ReturnID, ItemID, Qty, Rate, Tax, Total
        FROM OPENJSON(@ItemsJSON)
        WITH (
            ItemID INT, Qty DECIMAL(18,2), Rate DECIMAL(18,2),
            Tax DECIMAL(18,2), Total DECIMAL(18,2)
        );

        -- Decrement stock via the canonical stock IO ledger (matching sp_SaveStoreSale / sp_SavePurchaseGRN).
        DECLARE @StockIOID INT;
        DECLARE @NextIONo INT;
        SELECT @NextIONo = ISNULL(MAX(StockIONo), 0) + 1 FROM data_StockInOutInfo;

        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID,
            EntryUserDateTime, CompanyID, IsTaxable, ReadOnly
        )
        VALUES (
            @ReturnDate, @WHID, @PartyID, @Remarks, @NextIONo, 'PurchaseReturn', 1,
            GETDATE(), 1, 1, 0
        );
        SET @StockIOID = SCOPE_IDENTITY();

        INSERT INTO data_StockInOutDetail (
            StockIOID, ItemId, Quantity, StockRate, LocationId
        )
        SELECT
            @StockIOID, ItemID, -Qty, Rate, @WHID
        FROM OPENJSON(@ItemsJSON)
        WITH (ItemID INT, Qty DECIMAL(18,2), Rate DECIMAL(18,2));

        COMMIT TRANSACTION;
        SELECT @ReturnID AS NewReturnID, @ReturnNo AS NewReturnNo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- Add 'PurchaseReturn' StockIOType if missing
IF NOT EXISTS (SELECT 1 FROM gen_StockInOutType WHERE StockType = 'PurchaseReturn')
BEGIN
    DECLARE @inv INT;
    SELECT @inv = GLCAID FROM GLChartOFAccount WHERE GLCode='102001009' AND Status=1;
    IF @inv IS NOT NULL
        INSERT INTO gen_StockInOutType (CompanyID, StockType, StockInOutType, StockTypeAccountID, EntryUserDateTime)
        VALUES (1, 'PurchaseReturn', 'Out', @inv, GETDATE());
END
GO

PRINT 'sp_SavePurchaseReturn patched.';
