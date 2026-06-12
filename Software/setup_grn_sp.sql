USE temp_db1;
GO

-- ==========================================
-- Updated Stored Procedure for GRN (Includes Stock Increase)
-- ==========================================
CREATE OR ALTER PROCEDURE sp_SavePurchaseGRN
    @PurchaseDate DATETIME,
    @SupplierBillNo NVARCHAR(100),
    @PartyID INT,
    @WHID INT,
    @Remarks NVARCHAR(MAX),
    @NetDiscount DECIMAL(18,2),
    @FreightAmount DECIMAL(18,2),
    @ImagePath NVARCHAR(MAX),
    @ItemsJSON NVARCHAR(MAX) -- [{ItemID, Qty, Rate, Tax, Discount, DiscType, IsGST, OtherExp, SalesRate}]
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        -- 1. Insert Header
        DECLARE @PurchaseID INT;
        INSERT INTO data_PurchaseInfo (
            PurchaseDate, FBRInvoiceNumber, PurchasedParty, 
            WHID, Remarks, NetDiscount, TransporterFreightAmount, FbrImagePath,
            PurchaseVoucherNo, EntryUserDateTime, CompanyID, BranchID
        )
        VALUES (
            @PurchaseDate, @SupplierBillNo, @PartyID, 
            @WHID, @Remarks, @NetDiscount, @FreightAmount, @ImagePath,
            'GRN-' + CAST(ISNULL((SELECT MAX(PurchaseID) FROM data_PurchaseInfo), 0) + 1 AS NVARCHAR),
            GETDATE(), 1, 1
        );
        SET @PurchaseID = SCOPE_IDENTITY();

        -- 2. Insert Details & Update Prices
        INSERT INTO data_PurchaseDetail (
            PurchaseID, ItemId, Quantity, ItemRate, TaxOneAmount, 
            DiscountAmount, DiscountPercentage, ManualTaxInput, ManualTaxAmount, ItemSalesPrice
        )
        SELECT 
            @PurchaseID, ItemID, Qty, Rate, Tax,
            CASE WHEN DiscType = 'Amount' THEN Discount ELSE 0 END,
            CASE WHEN DiscType = 'Percent' THEN Discount ELSE 0 END,
            CASE WHEN IsGST = 1 THEN 1 ELSE 0 END,
            OtherExp, SalesRate
        FROM OPENJSON(@ItemsJSON)
        WITH (
            ItemID INT, Qty DECIMAL(18,2), Rate DECIMAL(18,2), Tax DECIMAL(18,2),
            Discount DECIMAL(18,2), DiscType NVARCHAR(20), IsGST BIT,
            OtherExp DECIMAL(18,2), SalesRate DECIMAL(18,2)
        );

        -- 3. Update Master Catalog Prices
        UPDATE I
        SET I.ItemSalesPrice = J.SalesRate,
            I.ItemPurchasePrice = J.Rate
        FROM InventItems I
        JOIN OPENJSON(@ItemsJSON) WITH (ItemID INT, SalesRate DECIMAL(18,2), Rate DECIMAL(18,2)) J ON I.ItemID = J.ItemID;

        -- 4. INCREASE STOCK (Ledger Entry)
        -- Insert into data_StockInOutInfo
        DECLARE @StockIOID INT;
        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID, EntryUserDateTime, CompanyID
        )
        VALUES (
            @PurchaseDate, @WHID, @PartyID, @Remarks, 'STK-GRN-' + CAST(@PurchaseID AS NVARCHAR), 'Purchase', 1, GETDATE(), 1
        );
        SET @StockIOID = SCOPE_IDENTITY();

        -- Insert into data_StockInOutDetail
        INSERT INTO data_StockInOutDetail (
            StockIOID, ItemId, Quantity, StockRate, LocationId
        )
        SELECT 
            @StockIOID, ItemID, Qty, Rate, @WHID
        FROM OPENJSON(@ItemsJSON) WITH (ItemID INT, Qty DECIMAL(18,2), Rate DECIMAL(18,2));

        COMMIT TRANSACTION;
        SELECT @PurchaseID AS NewPurchaseID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
