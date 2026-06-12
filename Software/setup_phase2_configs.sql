USE temp_db1;
GO

-- ==========================================
-- 1. InventCategory (Categories)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveCategories AS
SELECT 
    CategoryID,
    CategoryName,
    ItemGroupID,
    CompanyID,
    Description
FROM InventCategory;
GO

CREATE OR ALTER PROCEDURE sp_InsertCategory
    @CategoryName NVARCHAR(100),
    @ItemGroupID INT = NULL,
    @CompanyID INT = NULL,
    @Description NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO InventCategory (CategoryName, ItemGroupID, CompanyID, Description)
        VALUES (@CategoryName, @ItemGroupID, @CompanyID, @Description);
        
        SELECT SCOPE_IDENTITY() AS NewCategoryID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- ==========================================
-- 2. InventItemBrands (Brands)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveBrands AS
SELECT 
    ItemBrandId,
    BrandName,
    CompanyID
FROM InventItemBrands;
GO

CREATE OR ALTER PROCEDURE sp_InsertBrand
    @BrandName NVARCHAR(100),
    @CompanyID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO InventItemBrands (BrandName, CompanyID)
        VALUES (@BrandName, @CompanyID);
        
        SELECT SCOPE_IDENTITY() AS NewBrandID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- ==========================================
-- 3. InventUOM (Unit of Measure)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveUOMs AS
SELECT 
    UOMId,
    UOMName,
    Scale,
    CompanyID
FROM InventUOM;
GO

CREATE OR ALTER PROCEDURE sp_InsertUOM
    @UOMName NVARCHAR(100),
    @Scale DECIMAL(18,2) = 1.00,
    @CompanyID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO InventUOM (UOMName, Scale, CompanyID)
        VALUES (@UOMName, @Scale, @CompanyID);
        
        SELECT SCOPE_IDENTITY() AS NewUOMID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
