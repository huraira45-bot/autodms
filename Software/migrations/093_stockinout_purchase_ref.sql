-- =============================================================================
-- 093: Explicit GRN → stock-movement linkage
--
-- Before this migration `data_StockInOutInfo` had NO column linking a
-- Purchase-type stock row back to its source GRN (`data_PurchaseInfo`).
-- That's why editing a GRN after unfinalize left the stock still holding
-- the pre-edit quantities — `updateGRN` couldn't find the stock row to
-- resync it.
--
-- This migration
--   1. adds `PurchaseID INT NULL` to `data_StockInOutInfo`
--   2. seeds the linkage on existing rows via a paired ROW_NUMBER join
--      (matches GRNs and their stock rows in creation order within each
--       WHID / PartyID / date bucket — the natural insert order per bucket)
--   3. rewrites `sp_SavePurchaseGRN` to populate PurchaseID on every new
--      stock row it creates
--
-- Owner ask 2026-07-24.
-- =============================================================================
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS       ON;
SET NOCOUNT ON;

-- 1. Add the column (idempotent)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.data_StockInOutInfo') AND name = 'PurchaseID'
)
BEGIN
    ALTER TABLE dbo.data_StockInOutInfo ADD PurchaseID INT NULL;
    PRINT 'Added data_StockInOutInfo.PurchaseID';
END
ELSE
    PRINT 'data_StockInOutInfo.PurchaseID already exists';
GO

-- 2. Index on the new FK-like column for fast lookup during updateGRN
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockInOut_PurchaseID' AND object_id = OBJECT_ID('dbo.data_StockInOutInfo'))
    CREATE INDEX IX_StockInOut_PurchaseID ON dbo.data_StockInOutInfo(PurchaseID)
    WHERE PurchaseID IS NOT NULL;
GO

-- 3. Backfill: pair unlinked Purchase-type stock rows with their GRNs by
--    insertion order within each (WHID, PartyID, date) bucket.
;WITH stockNumbered AS (
    SELECT StockIOID,
           ROW_NUMBER() OVER (
               PARTITION BY WHID, PartyID, StockIODate
               ORDER BY StockIOID
           ) AS rn,
           WHID, PartyID, StockIODate
    FROM   dbo.data_StockInOutInfo
    WHERE  StockType = 'Purchase' AND PurchaseID IS NULL
),
purchNumbered AS (
    SELECT PurchaseID,
           ROW_NUMBER() OVER (
               PARTITION BY WHID, PartyID, CAST(PurchaseDate AS DATE)
               ORDER BY PurchaseID
           ) AS rn,
           WHID, PartyID, CAST(PurchaseDate AS DATE) AS PurchaseDay
    FROM   dbo.data_PurchaseInfo
)
UPDATE si
SET    si.PurchaseID = p.PurchaseID
FROM   dbo.data_StockInOutInfo si
JOIN   stockNumbered sn ON sn.StockIOID = si.StockIOID
JOIN   purchNumbered p  ON p.WHID = sn.WHID
                       AND p.PartyID = sn.PartyID
                       AND p.PurchaseDay = sn.StockIODate
                       AND p.rn = sn.rn;

DECLARE @linked INT = @@ROWCOUNT;
PRINT 'Backfilled PurchaseID on ' + CAST(@linked AS NVARCHAR(10)) + ' Purchase stock rows';
GO

-- 4. Rewrite sp_SavePurchaseGRN so every new stock row carries its PurchaseID.
--    Keeps behaviour identical for callers; adds the linkage column only.
IF OBJECT_ID('dbo.sp_SavePurchaseGRN', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_SavePurchaseGRN;
GO

CREATE PROCEDURE dbo.sp_SavePurchaseGRN
    @PurchaseDate   DATETIME,
    @SupplierBillNo NVARCHAR(100),
    @PartyID        INT,
    @WHID           INT,
    @Remarks        NVARCHAR(MAX),
    @NetDiscount    DECIMAL(18,2),
    @FreightAmount  DECIMAL(18,2),
    @ImagePath      NVARCHAR(MAX),
    @ItemsJSON      NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @PurchaseID INT;
        INSERT INTO data_PurchaseInfo (
            PurchaseDate, FBRInvoiceNumber, PurchasedParty, PartyID,
            WHID, Remarks, NetDiscount, TransporterFreightAmount, FbrImagePath,
            EntryUserDateTime, CompanyID, BranchID
        )
        VALUES (
            @PurchaseDate, @SupplierBillNo, @PartyID, @PartyID,
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
            CASE WHEN DiscType = 'Amount'  THEN Discount ELSE 0 END,
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
        SET I.ItemSalesPrice   = J.SalesRate,
            I.ItemPurchasePrice = J.Rate
        FROM InventItems I
        JOIN OPENJSON(@ItemsJSON) WITH (ItemID INT, SalesRate DECIMAL(18,2), Rate DECIMAL(18,2)) J
             ON I.ItemID = J.ItemID;

        DECLARE @StockIOID INT;
        DECLARE @NextIONo  INT;
        SELECT @NextIONo = ISNULL(MAX(StockIONo), 0) + 1 FROM data_StockInOutInfo;

        INSERT INTO data_StockInOutInfo (
            StockIODate, WHID, PartyID, Remarks, StockIONo, StockType, StockIOTypeID,
            EntryUserDateTime, CompanyID, IsTaxable, ReadOnly,
            PurchaseID          -- NEW: explicit link back to the GRN
        )
        VALUES (
            @PurchaseDate, @WHID, @PartyID, @Remarks, @NextIONo, 'Purchase', 1,
            GETDATE(), 1, 1, 0,
            @PurchaseID
        );
        SET @StockIOID = SCOPE_IDENTITY();

        INSERT INTO data_StockInOutDetail (
            StockIOID, ItemId, Quantity, StockRate, LocationId
        )
        SELECT @StockIOID, ItemID, Qty, Rate, @WHID
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

PRINT '093 done — GRN <-> stock linkage established.';
