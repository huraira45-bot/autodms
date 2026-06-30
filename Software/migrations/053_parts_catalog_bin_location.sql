-- 053_parts_catalog_bin_location.sql
-- Adds a "BinLocation" field to the parts catalog so the dealership can
-- track shelf/bin location in addition to warehouse, and rebuilds the
-- vw_ActiveItems view so the value flows out to all the pickers
-- (Store Sale, Parts Issue, GRN, GRTN, SSR).
--
-- BinLocation is a short free-text field — "A-12", "RACK-3-BIN-7", etc.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='InventItems' AND COLUMN_NAME='BinLocation'
)
BEGIN
    ALTER TABLE InventItems ADD BinLocation NVARCHAR(50) NULL;
END
GO

CREATE OR ALTER VIEW vw_ActiveItems AS
SELECT
    ItemId,
    CategoryID,
    SubCategoryID,
    ItemNumber,
    ItenName,
    UOMId,
    ItemBrandId,
    ItemSalesPrice,
    ItemPurchasePrice,
    ItemPurchaseGL,
    WeightedRate,
    WHID,
    BinLocation,
    ReOrderLevel,
    ItemType,
    Make,
    ItemModel,
    Range,
    SerialNo,
    CompanyID,
    Remarks
FROM InventItems
WHERE ItemStatus = 1 OR ItemStatus IS NULL;
GO

PRINT '053_parts_catalog_bin_location.sql complete.';
