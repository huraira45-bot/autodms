-- 036_stockio_whid_not_null.sql
-- Backfill historical NULL warehouse rows on data_StockInOutInfo to the
-- Main Store warehouse, then make the column NOT NULL so per-warehouse
-- inventory reports never silently drop ledger entries again.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- 1. Pick a default warehouse to absorb the historical NULLs.
--    Prefer Main Store (WHID=1) if present; else the first active WH.
DECLARE @defaultWH INT;
SELECT @defaultWH = WHID FROM InventWareHouse WHERE WHID = 1 AND ISNULL(InActive,0) = 0;
IF @defaultWH IS NULL
    SELECT TOP 1 @defaultWH = WHID FROM InventWareHouse WHERE ISNULL(InActive,0) = 0 ORDER BY WHID;
IF @defaultWH IS NULL
    THROW 50000, 'No active warehouse exists; create one before running this migration.', 1;

-- 2. Backfill the parent table.
UPDATE data_StockInOutInfo
SET WHID = @defaultWH
WHERE WHID IS NULL;
PRINT CONCAT('data_StockInOutInfo: ', @@ROWCOUNT, ' NULL row(s) defaulted to WHID=', @defaultWH);

-- 3. Detail rows may also carry NULL WHID/LocationId — backfill matching the parent.
IF COL_LENGTH('data_StockInOutDetail', 'LocationId') IS NOT NULL
BEGIN
    UPDATE d
    SET d.LocationId = p.WHID
    FROM data_StockInOutDetail d
    INNER JOIN data_StockInOutInfo p ON p.StockIOID = d.StockIOID
    WHERE d.LocationId IS NULL;
    PRINT CONCAT('data_StockInOutDetail.LocationId: ', @@ROWCOUNT, ' row(s) backfilled');
END
GO

-- 4. Tighten the schema: WHID NOT NULL.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('data_StockInOutInfo') AND name = 'WHID' AND is_nullable = 1
)
BEGIN
    ALTER TABLE data_StockInOutInfo
        ALTER COLUMN WHID INT NOT NULL;
    PRINT 'data_StockInOutInfo.WHID is now NOT NULL.';
END
GO

PRINT 'Migration 036 complete.';
