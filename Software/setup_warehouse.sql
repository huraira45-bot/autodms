USE temp_db1;
GO

-- ==========================================
-- 4. InventWareHouse (Warehouses)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveWarehouses AS
SELECT 
    WHID,
    WHDesc,
    WhCode,
    PhoneNo,
    LocationAddress,
    InActive
FROM InventWareHouse
WHERE InActive = 0 OR InActive IS NULL;
GO

CREATE OR ALTER PROCEDURE sp_InsertWarehouse
    @WHDesc NVARCHAR(200),
    @WhCode NVARCHAR(50) = NULL,
    @PhoneNo NVARCHAR(50) = NULL,
    @LocationAddress NVARCHAR(MAX) = NULL,
    @CompanyID INT = NULL,
    @BranchID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO InventWareHouse (WHDesc, WhCode, PhoneNo, LocationAddress, CompanyID, BranchID, InActive)
        VALUES (@WHDesc, @WhCode, @PhoneNo, @LocationAddress, @CompanyID, @BranchID, 0);
        
        SELECT SCOPE_IDENTITY() AS NewWHID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
