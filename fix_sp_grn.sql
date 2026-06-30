SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- 1) Widen PurchaseVoucherNo so it can hold "GRN-0001" strings (currently INT).
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('data_PurchaseInfo') AND name = 'PurchaseVoucherNo'
      AND system_type_id = TYPE_ID('int')
)
BEGIN
    ALTER TABLE data_PurchaseInfo ALTER COLUMN PurchaseVoucherNo NVARCHAR(50) NULL;
    PRINT 'data_PurchaseInfo.PurchaseVoucherNo widened to NVARCHAR(50).';
END
GO

-- Same fix for data_PurchaseReturnInfo (GRTN)
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('data_PurchaseReturnInfo') AND name = 'PurchaseReturnNo'
      AND system_type_id = TYPE_ID('int')
)
BEGIN
    ALTER TABLE data_PurchaseReturnInfo ALTER COLUMN PurchaseReturnNo NVARCHAR(50) NULL;
    PRINT 'data_PurchaseReturnInfo.PurchaseReturnNo widened to NVARCHAR(50).';
END
GO

-- 2) Rebuild sp_SavePurchaseGRN: leave PurchaseVoucherNo NULL (controller will
-- set it from dms_DocCounters), and use MAX(StockIONo)+1 INT for the stock IO row.
ALTER PROCEDURE sp_SavePurchaseGRN
    @PurchaseDate DATETIME,
    @SupplierBillNo NVARCHAR(100),
    @PartyID INT,
    @WHID INT,
    @Remarks NVARCHAR(MAX),
    @NetDiscount DECIMAL(18,2),
    @FreightAmount DECIMAL(18,2),
    @ImagePath NVARCHAR(MAX),
    @ItemsJSON NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @PurchaseID INT;
        INSERT INTO data_PurchaseInfo (
            PurchaseDate, FBRInvoiceNumber, PurchasedParty,
            WHID, Remarks, NetDiscount, TransporterFreightAmount, FbrImagePath,
            EntryUserDateTime, CompanyID, BranchID
        )
        VALUES (
            @PurchaseDate, @SupplierBillNo, @PartyID,
            @WHID, @Remarks, @NetDiscount, @FreightAmount, @ImagePath,
            GETDATE(), 1, 1
        );
        SET @PurchaseID = SCOPE_IDENTITY();

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

        UPDATE I
        SET I.ItemSalesPrice = J.SalesRate,
            I.ItemPurchasePrice = J.Rate
        FROM InventItems I
        JOIN OPENJSON(@ItemsJSON) WITH (ItemID INT, SalesRate DECIMAL(18,2), Rate DECIMAL(18,2)) J ON I.ItemID = J.ItemID;

        DECLARE @StockIOID INT;
        DECLARE @NextIONo INT;
        SELECT @NextIONo = ISNULL(MAX(StockIONo), 0) + 1 FROM data_StockInOutInfo;

        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID,
            EntryUserDateTime, CompanyID, IsTaxable, ReadOnly
        )
        VALUES (
            @PurchaseDate, @WHID, @PartyID, @Remarks, @NextIONo, 'Purchase', 1,
            GETDATE(), 1, 1, 0
        );
        SET @StockIOID = SCOPE_IDENTITY();

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
    END CATCH;
END;
GO

PRINT 'sp_SavePurchaseGRN patched.';
