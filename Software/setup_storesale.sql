USE temp_db1;
GO

-- ==========================================
-- Updated Stored Procedure for Store Sale (Fixed Nullability)
-- ==========================================
CREATE OR ALTER PROCEDURE sp_SaveStoreSale
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
    BEGIN TRANSACTION;
    BEGIN TRY
        -- 1. Generate Invoice No
        DECLARE @InvoiceNo NVARCHAR(50) = 'SS-' + CAST(ISNULL((SELECT MAX(SaleID) FROM data_StoreSaleInfo), 0) + 1 AS NVARCHAR);

        -- 2. Insert Header
        DECLARE @SaleID INT;
        INSERT INTO data_StoreSaleInfo (
            SaleDate, InvoiceNo, PartyID, CustomerName, VehicleName, Variant,
            PaymentMode, NICNo, MobileNo, Remarks, City, FBRInvoiceNo,
            TotalBillAmount, TotalTaxAmount, TotalDiscount, NetPayable, WHID
        )
        VALUES (
            @SaleDate, @InvoiceNo, @PartyID, @CustomerName, @VehicleName, @Variant,
            @PaymentMode, @NICNo, @MobileNo, @Remarks, @City, @FBRInvoiceNo,
            @TotalBillAmount, @TotalTaxAmount, @TotalDiscount, @NetPayable, @WHID
        );
        SET @SaleID = SCOPE_IDENTITY();

        -- 3. Insert Details
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

        -- 4. DECREASE STOCK (Ledger Entry)
        DECLARE @StockIOID INT;
        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID, 
            EntryUserDateTime, CompanyID, IsTaxable, ReadOnly
        )
        VALUES (
            @SaleDate, @WHID, @PartyID, @Remarks, 'STK-SAL-' + CAST(@SaleID AS NVARCHAR), 'Sale', 2, 
            GETDATE(), 1, 1, 0 -- Added defaults for non-nullable columns
        );
        SET @StockIOID = SCOPE_IDENTITY();

        INSERT INTO data_StockInOutDetail (
            StockIOID, ItemId, Quantity, StockRate, LocationId
        )
        SELECT 
            @StockIOID, ItemID, -Qty, SaleRate, WHID
        FROM OPENJSON(@ItemsJSON) WITH (ItemID INT, Qty DECIMAL(18,2), SaleRate DECIMAL(18,2), WHID INT);

        COMMIT TRANSACTION;
        SELECT @SaleID AS NewSaleID, @InvoiceNo AS NewInvoiceNo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
