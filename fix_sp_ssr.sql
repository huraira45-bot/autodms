SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER PROCEDURE sp_SaveStoreSaleReturn
    @ReturnDate DATETIME,
    @OriginalSaleID INT,
    @PartyID INT,
    @CustomerName NVARCHAR(200),
    @Remarks NVARCHAR(MAX),
    @TotalReturnAmount DECIMAL(18,2),
    @TotalTaxReturn DECIMAL(18,2),
    @TotalDiscReturn DECIMAL(18,2),
    @NetRefund DECIMAL(18,2),
    @WHID INT,
    @ItemsJSON NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ReturnNo NVARCHAR(50);
        SELECT @ReturnNo = 'SSR-' + RIGHT('00000' + CAST(ISNULL(MAX(ReturnID), 0) + 1 AS NVARCHAR), 5)
        FROM data_StoreSaleReturnInfo;

        DECLARE @ReturnID INT;
        INSERT INTO data_StoreSaleReturnInfo (
            ReturnDate, ReturnNo, OriginalSaleID, PartyID, CustomerName, Remarks,
            TotalReturnAmount, TotalTaxReturn, TotalDiscReturn, NetRefund, WHID
        )
        VALUES (
            @ReturnDate, @ReturnNo, @OriginalSaleID, @PartyID, @CustomerName, @Remarks,
            @TotalReturnAmount, @TotalTaxReturn, @TotalDiscReturn, @NetRefund, @WHID
        );
        SET @ReturnID = SCOPE_IDENTITY();

        INSERT INTO data_StoreSaleReturnDetail (
            ReturnID, ItemID, Quantity, SaleRate, TaxPercent, TaxAmount, DiscountAmount, NetAmount, WHID
        )
        SELECT
            @ReturnID, ItemID, Qty, SaleRate, TaxPercent, TaxAmt, DiscAmt, NetAmt, WHID
        FROM OPENJSON(@ItemsJSON)
        WITH (
            ItemID INT, Qty DECIMAL(18,2), SaleRate DECIMAL(18,2),
            TaxPercent DECIMAL(18,2), TaxAmt DECIMAL(18,2),
            DiscAmt DECIMAL(18,2), NetAmt DECIMAL(18,2), WHID INT
        );

        DECLARE @StockIOID INT;
        DECLARE @NextIONo INT;
        SELECT @NextIONo = ISNULL(MAX(StockIONo), 0) + 1 FROM data_StockInOutInfo;

        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID,
            EntryUserDateTime, CompanyID, IsTaxable, ReadOnly
        )
        VALUES (
            @ReturnDate, @WHID, @PartyID, @Remarks, @NextIONo, 'Sale Return', 4,
            GETDATE(), 1, 1, 0
        );
        SET @StockIOID = SCOPE_IDENTITY();

        INSERT INTO data_StockInOutDetail (
            StockIOID, ItemId, Quantity, StockRate, LocationId
        )
        SELECT
            @StockIOID, ItemID, Qty, SaleRate, WHID
        FROM OPENJSON(@ItemsJSON) WITH (ItemID INT, Qty DECIMAL(18,2), SaleRate DECIMAL(18,2), WHID INT);

        COMMIT TRANSACTION;
        SELECT @ReturnID AS NewReturnID, @ReturnNo AS NewReturnNo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

PRINT 'sp_SaveStoreSaleReturn patched.';
