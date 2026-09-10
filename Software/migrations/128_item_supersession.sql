-- 128_item_supersession.sql
-- Owner ask 2026-09-10: record part supersession in the Spare Parts Catalog
-- ("in the part code add the supersede option").
--
-- A superseded part number is one the manufacturer has replaced with a newer
-- number. Two columns, because both cases occur in practice:
--
--   SupersededByItemId  the replacement is itself catalogued -> a real link,
--                       so the catalog can show its current number and name
--                       and keep showing the right one if it is renumbered.
--   SupersededByNumber  the replacement is not stocked yet -> keep the raw
--                       number the parts manual gives, so the knowledge is
--                       not lost waiting for the item to be created.
--
-- Deliberately NOT a foreign key: parts get deleted and merged, and a hard FK
-- would block that for a field that is advisory. The view LEFT JOINs, so a
-- dangling id degrades to showing the stored number instead of breaking.
--
-- Idempotent -- safe to re-run.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME='InventItems' AND COLUMN_NAME='SupersededByItemId')
BEGIN
    ALTER TABLE InventItems ADD SupersededByItemId INT NULL;
    PRINT '128: added InventItems.SupersededByItemId.';
END
ELSE
    PRINT '128: InventItems.SupersededByItemId already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME='InventItems' AND COLUMN_NAME='SupersededByNumber')
BEGIN
    ALTER TABLE InventItems ADD SupersededByNumber NVARCHAR(100) NULL;
    PRINT '128: added InventItems.SupersededByNumber.';
END
ELSE
    PRINT '128: InventItems.SupersededByNumber already exists.';
GO

-- Rebuild vw_ActiveItems so the catalog and every item picker can see the
-- supersession without a second round trip. Column list is 058's plus the
-- two new columns and the resolved replacement part's number / name.
IF OBJECT_ID('vw_ActiveItems', 'V') IS NOT NULL
    DROP VIEW vw_ActiveItems;
GO

CREATE VIEW vw_ActiveItems AS
SELECT
    i.ItemId, i.CategoryID, i.ItemNumber, i.ManualNumber, i.ItenName,
    i.UOMId, i.ItemBrandId,
    i.ItemSalesPrice, i.ItemPurchasePrice, i.ItemPurchaseGL, i.ItemSalesGL,
    i.WeightedRate,
    i.WHID, i.ItemType, i.Make, i.ItemModel, i.Range, i.SerialNo,
    i.CompanyID, i.Remarks, i.DepartmentID, i.JobTypeID,
    i.BinLocation, i.ReOrderLevel,
    i.SupersededByItemId,
    i.SupersededByNumber,
    -- Prefer the linked part's live number; fall back to the typed one.
    COALESCE(s.ManualNumber, CAST(s.ItemNumber AS NVARCHAR(50)), i.SupersededByNumber)
                AS SupersededByCode,
    s.ItenName  AS SupersededByName,
    d.DepartmentName,
    jt.CardCode AS JobTypeCode,
    jt.Title    AS JobTypeName
FROM InventItems i
LEFT JOIN InventItems        s  ON s.ItemId       = i.SupersededByItemId
LEFT JOIN gen_DepartmentInfo d  ON i.DepartmentID = d.DepartmentID
LEFT JOIN gen_JobCardType    jt ON i.JobTypeID    = jt.JobCardTypeId
WHERE i.ItemStatus = 1 OR i.ItemStatus IS NULL;
GO

PRINT '128_item_supersession complete.';
GO
