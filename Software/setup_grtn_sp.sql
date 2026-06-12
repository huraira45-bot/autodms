USE temp_db1;
GO

-- ==========================================
-- 1. Create a View for Purchase Returns (GRTN)
-- ==========================================
CREATE OR ALTER VIEW vw_PurchaseReturnHeader AS
SELECT 
    PurchaseReturnID,
    PurchaseReturnDate,
    PurchaseReturnNo,
    PartyID,
    WHID,
    NetAmount,
    DiscountAmount,
    Remarks,
    PurchaseID AS OriginalGRNID
FROM data_PurchaseReturnInfo;
GO

-- ==========================================
-- 2. Stored Procedure to Save a Full GRTN
-- ==========================================
CREATE OR ALTER PROCEDURE sp_SavePurchaseReturn
    @ReturnDate DATETIME,
    @PartyID INT,
    @WHID INT,
    @Remarks NVARCHAR(MAX),
    @NetAmount DECIMAL(18,2),
    @DiscountAmount DECIMAL(18,2),
    @OriginalGRNID INT = NULL,
    @ItemsJSON NVARCHAR(MAX) -- JSON array: [{ItemID, Qty, Rate, Tax, Total}]
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        -- 1. Insert Header
        DECLARE @ReturnID INT;
        INSERT INTO data_PurchaseReturnInfo (
            PurchaseReturnDate, PartyID, WHID, Remarks, 
            NetAmount, DiscountAmount, PurchaseID,
            PurchaseReturnNo, EntryUserDateTime, CompanyID, BranchID
        )
        VALUES (
            @ReturnDate, @PartyID, @WHID, @Remarks, 
            @NetAmount, @DiscountAmount, @OriginalGRNID,
            'GRTN-' + CAST(ISNULL((SELECT MAX(PurchaseReturnID) FROM data_PurchaseReturnInfo), 0) + 1 AS NVARCHAR),
            GETDATE(), 1, 1
        );
        SET @ReturnID = SCOPE_IDENTITY();

        -- 2. Insert Details from JSON
        INSERT INTO data_PurchaseReturnDetail (
            PurchaseReturnID, ItemId, Quantity, ItemRate, TaxOneAmount, NetAmount
        )
        SELECT 
            @ReturnID,
            ItemID,
            Qty,
            Rate,
            Tax,
            Total
        FROM OPENJSON(@ItemsJSON)
        WITH (
            ItemID INT,
            Qty DECIMAL(18,2),
            Rate DECIMAL(18,2),
            Tax DECIMAL(18,2),
            Total DECIMAL(18,2)
        );

        COMMIT TRANSACTION;
        SELECT @ReturnID AS NewReturnID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
