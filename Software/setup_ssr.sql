USE temp_db1;
GO

-- ==========================================
-- 1. Store Sale Return Info (Header)
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[data_StoreSaleReturnInfo]') AND type in (N'U'))
BEGIN
    CREATE TABLE data_StoreSaleReturnInfo (
        ReturnID INT PRIMARY KEY IDENTITY(1,1),
        ReturnDate DATETIME DEFAULT GETDATE(),
        ReturnNo NVARCHAR(50) UNIQUE,
        OriginalSaleID INT, -- Reference to original Sale
        PartyID INT,
        CustomerName NVARCHAR(200),
        Remarks NVARCHAR(MAX),
        TotalReturnAmount DECIMAL(18,2) DEFAULT 0,
        TotalTaxReturn DECIMAL(18,2) DEFAULT 0,
        TotalDiscReturn DECIMAL(18,2) DEFAULT 0,
        NetRefund DECIMAL(18,2) DEFAULT 0,
        WHID INT,
        EntryUserID INT DEFAULT 1,
        EntryUserDateTime DATETIME DEFAULT GETDATE()
    );
END
GO

-- ==========================================
-- 2. Store Sale Return Detail (Line Items)
-- ==========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[data_StoreSaleReturnDetail]') AND type in (N'U'))
BEGIN
    CREATE TABLE data_StoreSaleReturnDetail (
        ReturnDetailID INT PRIMARY KEY IDENTITY(1,1),
        ReturnID INT FOREIGN KEY REFERENCES data_StoreSaleReturnInfo(ReturnID),
        ItemID INT,
        Quantity DECIMAL(18,2),
        SaleRate DECIMAL(18,2),
        TaxPercent DECIMAL(18,2),
        TaxAmount DECIMAL(18,2),
        DiscountAmount DECIMAL(18,2),
        NetAmount DECIMAL(18,2),
        WHID INT
    );
END
GO

-- ==========================================
-- 3. Stored Procedure to Save SSR
-- ==========================================
CREATE OR ALTER PROCEDURE sp_SaveStoreSaleReturn
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
    BEGIN TRANSACTION;
    BEGIN TRY
        -- 1. Generate Return No
        DECLARE @ReturnNo NVARCHAR(50) = 'SSR-' + CAST(ISNULL((SELECT MAX(ReturnID) FROM data_StoreSaleReturnInfo), 0) + 1 AS NVARCHAR);

        -- 2. Insert Header
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

        -- 3. Insert Details
        INSERT INTO data_StoreSaleReturnDetail (
            ReturnID, ItemID, Quantity, SaleRate, TaxPercent, TaxAmount, DiscountAmount, NetAmount, WHID
        )
        SELECT 
            @ReturnID, ItemID, Qty, SaleRate, TaxPercent, TaxAmt, DiscAmt, NetAmt, WHID
        FROM OPENJSON(@ItemsJSON)
        WITH (
            ItemID INT, Qty DECIMAL(18,2), SaleRate DECIMAL(18,2),
            TaxPercent DECIMAL(18,2), TaxAmt DECIMAL(18,2), DiscAmt DECIMAL(18,2), NetAmt DECIMAL(18,2), WHID INT
        );

        -- 4. INCREASE STOCK (Ledger Entry)
        DECLARE @StockIOID INT;
        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID, 
            EntryUserDateTime, CompanyID, IsTaxable, ReadOnly
        )
        VALUES (
            @ReturnDate, @WHID, @PartyID, @Remarks, 'STK-SSR-' + CAST(@ReturnID AS NVARCHAR), 'Sale Return', 4, 
            GETDATE(), 1, 1, 0
        );
        SET @StockIOID = SCOPE_IDENTITY();

        INSERT INTO data_StockInOutDetail (
            StockIOID, ItemId, Quantity, StockRate, LocationId
        )
        SELECT 
            @StockIOID, ItemID, Qty, SaleRate, WHID -- Positive Qty for Return (Increase Stock)
        FROM OPENJSON(@ItemsJSON) WITH (ItemID INT, Qty DECIMAL(18,2), SaleRate DECIMAL(18,2), WHID INT);

        COMMIT TRANSACTION;
        SELECT @ReturnID AS NewReturnID, @ReturnNo AS NewReturnNo;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
