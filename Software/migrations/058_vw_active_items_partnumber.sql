-- 058_vw_active_items_partnumber.sql
-- Owner request (2026-07-01): part number must show up on every item picker
-- (GRN, GRTN, Store Sale, SSR, Parts Issue, Parts list) AND be searchable.
-- The frontends already fall back to ManualNumber when ItemNumber is null,
-- but vw_ActiveItems (source for /api/items) omits ManualNumber, so the
-- fallback never had data to work with. Also add BinLocation and ReOrderLevel
-- (present on InventItems but missed by the view) — several list pages ask
-- for them via /api/items.
SET QUOTED_IDENTIFIER ON;
GO

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
    d.DepartmentName,
    jt.CardCode AS JobTypeCode,
    jt.Title    AS JobTypeName
FROM InventItems i
LEFT JOIN gen_DepartmentInfo d ON i.DepartmentID = d.DepartmentID
LEFT JOIN gen_JobCardType    jt ON i.JobTypeID   = jt.JobCardTypeId
WHERE i.ItemStatus = 1 OR i.ItemStatus IS NULL;
GO

PRINT '058_vw_active_items_partnumber.sql complete.';
GO
