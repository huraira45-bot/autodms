SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER PROCEDURE sp_SaveStoreSale
    @SaleDate DATETIME,
    @PartyID INT,
    @CustomerName NVARCHAR(200),
    @VehicleName NVARCHAR(200),
    @Variant NVARCHAR(200),
    @PaymentMode NVARCHAR(20),
    @NICNo NVARCHAR(50),
    @MobileNo NVARCHAR(50),
    @Remarks NVARCHAR(MAX),
    @City NVARCHAR(100),
    @FBRInvoiceNo NVARCHAR(100),
    @TotalBillAmount DECIMAL(18,2),
    @TotalTaxAmount DECIMAL(18,2),
    @TotalDiscount DECIMAL(18,2),
    @NetPayable DECIMAL(18,2),
    @WHID INT,
    @ItemsJSON NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @SaleID INT;
        DECLARE @NewInvoiceNo NVARCHAR(50);

        SELECT @NewInvoiceNo = 'SAL-' + RIGHT('00000' + CAST(ISNULL(MAX(SaleID), 0) + 1 AS NVARCHAR), 5)
        FROM data_StoreSaleInfo;

        INSERT INTO data_StoreSaleInfo (
            SaleDate, InvoiceNo, PartyID, CustomerName, VehicleName, Variant, PaymentMode,
            NICNo, MobileNo, Remarks, City, FBRInvoiceNo,
            TotalBillAmount, TotalTaxAmount, TotalDiscount, NetPayable, WHID, IsFinalized
        )
        VALUES (
            @SaleDate, @NewInvoiceNo, @PartyID, @CustomerName, @VehicleName, @Variant, @PaymentMode,
            @NICNo, @MobileNo, @Remarks, @City, @FBRInvoiceNo,
            @TotalBillAmount, @TotalTaxAmount, @TotalDiscount, @NetPayable, @WHID, 0
        );
        SET @SaleID = SCOPE_IDENTITY();

        INSERT INTO data_StoreSaleDetail (
            SaleID, ItemID, Quantity, SaleRate, PurchaseRate, TaxPercent, TaxAmount, DiscountAmount, NetAmount, IsGST, WHID
        )
        SELECT
            @SaleID, ItemID, Qty, SaleRate, PurRate, TaxPercent, TaxAmt, DiscAmt, NetAmt, IsGST, WHID
        FROM OPENJSON(@ItemsJSON)
        WITH (
            ItemID INT, Qty DECIMAL(18,2), SaleRate DECIMAL(18,2), PurRate DECIMAL(18,2),
            TaxPercent DECIMAL(18,2), TaxAmt DECIMAL(18,2), DiscAmt DECIMAL(18,2), NetAmt DECIMAL(18,2), IsGST BIT, WHID INT
        );

        DECLARE @StockIOID INT;
        DECLARE @NextIONo INT;
        SELECT @NextIONo = ISNULL(MAX(StockIONo), 0) + 1 FROM data_StockInOutInfo;

        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID,
            EntryUserDateTime, CompanyID, IsTaxable, ReadOnly
        )
        VALUES (
            @SaleDate, @WHID, @PartyID, @Remarks, @NextIONo, 'Sale', 2,
            GETDATE(), 1, 1, 0
        );
        SET @StockIOID = SCOPE_IDENTITY();

        INSERT INTO data_StockInOutDetail (
            StockIOID, ItemId, Quantity, StockRate, LocationId
        )
        SELECT
            @StockIOID, ItemID, -Qty, SaleRate, WHID
        FROM OPENJSON(@ItemsJSON) WITH (ItemID INT, Qty DECIMAL(18,2), SaleRate DECIMAL(18,2), WHID INT);

        COMMIT TRANSACTION;
        SELECT @SaleID AS NewSaleID, @NewInvoiceNo AS NewInvoiceNo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
