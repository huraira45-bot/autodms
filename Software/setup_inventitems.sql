USE temp_db1;
GO

-- ==========================================
-- 1. InventItems (Master Catalog for Vehicles & Parts)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveItems AS
SELECT 
    ItemId,
    CategoryID,
    ItemNumber,
    ItenName, -- Note: spelling matches DB column
    UOMId,
    ItemBrandId,
    ItemSalesPrice,
    ItemPurchasePrice,
    ItemPurchaseGL,
    WeightedRate,
    WHID,
    ItemType,
    Make,
    ItemModel,
    Range,
    SerialNo,
    CompanyID,
    Remarks
FROM InventItems
WHERE ItemStatus = 1 OR ItemStatus IS NULL; -- Assuming ItemStatus controls active state
GO

CREATE OR ALTER PROCEDURE sp_InsertItem
    @CategoryID INT,
    @ItemNumber BIGINT = NULL,
    @ItenName NVARCHAR(200),
    @UOMId INT,
    @ItemBrandId INT = NULL,
    @ItemSalesPrice DECIMAL(18,2) = 0,
    @ItemPurchasePrice DECIMAL(18,2) = 0,
    @ItemPurchaseGL INT = NULL,
    @ItemSalesGL INT = NULL,
    @WHID INT = NULL,
    @ItemType VARCHAR(50) = 'Part', -- 'Vehicle', 'Part', 'Service'
    @Make NVARCHAR(100) = NULL,
    @ItemModel NVARCHAR(100) = NULL,
    @Range NVARCHAR(100) = NULL,
    @SerialNo NVARCHAR(100) = NULL,
    @CompanyID INT = NULL,
    @Remarks NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        -- Check for duplicate ItemNumber (Part Number or Barcode)
        IF @ItemNumber IS NOT NULL AND EXISTS (SELECT 1 FROM InventItems WHERE ItemNumber = @ItemNumber)
        BEGIN
            THROW 50003, 'An item with this Item Number/Barcode already exists.', 1;
        END

        INSERT INTO InventItems (
            CategoryID, ItemNumber, ItenName, UOMId, ItemBrandId,
            ItemSalesPrice, ItemPurchasePrice, ItemPurchaseGL, ItemSalesGL,
            WHID, ItemType, Make, ItemModel, Range, SerialNo, CompanyID, Remarks, ItemStatus
        )
        VALUES (
            @CategoryID, @ItemNumber, @ItenName, @UOMId, @ItemBrandId,
            @ItemSalesPrice, @ItemPurchasePrice, @ItemPurchaseGL, @ItemSalesGL,
            @WHID, @ItemType, @Make, @ItemModel, @Range, @SerialNo, @CompanyID, @Remarks, 1
        );
        
        SELECT SCOPE_IDENTITY() AS NewItemId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
