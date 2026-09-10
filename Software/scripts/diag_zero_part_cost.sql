/* ===================================================================
   diag_zero_part_cost.sql
   -------------------------------------------------------------------
   Sizes the "parts cost is zero" problem surfaced by the Job Card
   Parts Cost & Margin report.

   Root cause under test: InventItems.WeightedRate is never maintained
   by AutoDMS (sp_SavePurchaseGRN does not touch it, no UPDATE exists
   in the app, the item screen cannot set it). At issue time
   saveJobCardPartsIssue snapshots
        ISNULL(WeightedRate, ItemPurchasePrice)
   and ISNULL only falls back on NULL -- a WeightedRate of 0 returns 0,
   so ItemPurchasePrice is never consulted and UnitLandedCost is
   written as 0.

   READ-ONLY. Changes nothing.
   =================================================================== */
SET NOCOUNT ON;

PRINT '=============================================================';
PRINT '1. ISSUE LINES BY COST STATUS';
PRINT '=============================================================';
SELECT CASE WHEN sid.UnitLandedCost IS NULL THEN 'NULL (never captured)'
            WHEN sid.UnitLandedCost = 0     THEN 'ZERO (captured as 0)'
            ELSE 'POSITIVE (good)' END           AS CostStatus,
       COUNT(*)                                  AS Lines,
       COUNT(DISTINCT sid.JobCardId)             AS JobCards,
       COUNT(DISTINCT sid.ItemId)                AS Items,
       CAST(SUM(sid.IssueQuantity * sid.ItemRate - ISNULL(sid.DiscAmt,0))
            AS DECIMAL(18,2))                    AS SaleValueNet
FROM   data_StockIssuetoJobCardDetail sid
GROUP  BY CASE WHEN sid.UnitLandedCost IS NULL THEN 'NULL (never captured)'
                WHEN sid.UnitLandedCost = 0     THEN 'ZERO (captured as 0)'
                ELSE 'POSITIVE (good)' END
ORDER  BY 1;

PRINT '';
PRINT '=============================================================';
PRINT '2. WHY: InventItems cost columns for the affected items';
PRINT '=============================================================';
SELECT CASE WHEN ISNULL(i.WeightedRate,0) = 0 AND ISNULL(i.ItemPurchasePrice,0) = 0
              THEN 'No cost at all on the item'
            WHEN ISNULL(i.WeightedRate,0) = 0 AND ISNULL(i.ItemPurchasePrice,0) > 0
              THEN 'WeightedRate 0 BUT ItemPurchasePrice is set (ISNULL trap)'
            ELSE 'WeightedRate is set' END       AS ItemCostState,
       COUNT(DISTINCT i.ItemId)                  AS Items
FROM   InventItems i
WHERE  i.ItemId IN (SELECT DISTINCT ItemId FROM data_StockIssuetoJobCardDetail
                    WHERE ISNULL(UnitLandedCost,0) = 0)
GROUP  BY CASE WHEN ISNULL(i.WeightedRate,0) = 0 AND ISNULL(i.ItemPurchasePrice,0) = 0
                 THEN 'No cost at all on the item'
               WHEN ISNULL(i.WeightedRate,0) = 0 AND ISNULL(i.ItemPurchasePrice,0) > 0
                 THEN 'WeightedRate 0 BUT ItemPurchasePrice is set (ISNULL trap)'
               ELSE 'WeightedRate is set' END;

PRINT '';
PRINT '=============================================================';
PRINT '3. IS THE REAL COST RECOVERABLE FROM GRN HISTORY?';
PRINT '=============================================================';
SELECT CASE WHEN g.ItemId IS NULL THEN 'NO  - item was never received on a GRN'
            ELSE 'YES - GRN purchase history exists' END AS Recoverable,
       COUNT(DISTINCT x.ItemId)                          AS Items
FROM  (SELECT DISTINCT ItemId FROM data_StockIssuetoJobCardDetail
       WHERE ISNULL(UnitLandedCost,0) = 0) x
LEFT  JOIN (SELECT DISTINCT ItemId FROM data_PurchaseDetail
            WHERE ISNULL(UnitLandedCost,0) > 0) g ON g.ItemId = x.ItemId
GROUP BY CASE WHEN g.ItemId IS NULL THEN 'NO  - item was never received on a GRN'
              ELSE 'YES - GRN purchase history exists' END;

PRINT '';
PRINT '=============================================================';
PRINT '4. GL EXPOSURE - finalized job cards that posted no parts COGS';
PRINT '    (jobCardJournalBuilder emits COGS Dr / Inventory Cr only';
PRINT '     when partsCOGS > 0, so these relieved no inventory)';
PRINT '=============================================================';
SELECT COUNT(DISTINCT j.JobCardId)                       AS FinalizedJobCards,
       CAST(SUM(sid.IssueQuantity * sid.ItemRate - ISNULL(sid.DiscAmt,0))
            AS DECIMAL(18,2))                            AS PartsRevenueWithNoCOGS,
       CAST(SUM(sid.IssueQuantity * ISNULL(pc.AvgGrnCost,0))
            AS DECIMAL(18,2))                            AS EstimatedMissingCOGS
FROM   data_StockIssuetoJobCardDetail sid
JOIN   Addata_JobCardInfo j ON j.JobCardId = sid.JobCardId
LEFT   JOIN (SELECT ItemId, AVG(UnitLandedCost) AS AvgGrnCost
             FROM   data_PurchaseDetail
             WHERE  ISNULL(UnitLandedCost,0) > 0
             GROUP  BY ItemId) pc ON pc.ItemId = sid.ItemId
WHERE  j.IsFinalized = 1
  AND  ISNULL(sid.UnitLandedCost,0) = 0;

PRINT '';
PRINT '=============================================================';
PRINT '5. TOP 25 OFFENDING ITEMS (by sale value with no cost)';
PRINT '=============================================================';
SELECT TOP 25
       ISNULL(i.ManualNumber, CAST(i.ItemNumber AS NVARCHAR(50))) AS PartNo,
       i.ItenName                                                 AS ItemName,
       CAST(ISNULL(i.WeightedRate,0) AS DECIMAL(18,2))            AS WeightedRate,
       CAST(ISNULL(i.ItemPurchasePrice,0) AS DECIMAL(18,2))       AS ItemPurchPrice,
       CAST(ISNULL(pc.AvgGrnCost,0) AS DECIMAL(18,2))             AS AvgGrnCost,
       COUNT(*)                                                   AS ZeroCostLines,
       CAST(SUM(sid.IssueQuantity) AS DECIMAL(18,2))              AS QtyIssued,
       CAST(SUM(sid.IssueQuantity * sid.ItemRate - ISNULL(sid.DiscAmt,0))
            AS DECIMAL(18,2))                                     AS SaleValueNet,
       CAST(SUM(sid.IssueQuantity * ISNULL(pc.AvgGrnCost,0))
            AS DECIMAL(18,2))                                     AS RecoverableCost
FROM   data_StockIssuetoJobCardDetail sid
JOIN   InventItems i ON i.ItemId = sid.ItemId
LEFT   JOIN (SELECT ItemId, AVG(UnitLandedCost) AS AvgGrnCost
             FROM   data_PurchaseDetail
             WHERE  ISNULL(UnitLandedCost,0) > 0
             GROUP  BY ItemId) pc ON pc.ItemId = sid.ItemId
WHERE  ISNULL(sid.UnitLandedCost,0) = 0
GROUP  BY i.ManualNumber, i.ItemNumber, i.ItenName,
          i.WeightedRate, i.ItemPurchasePrice, pc.AvgGrnCost
ORDER  BY SaleValueNet DESC;

PRINT '';
PRINT '=============================================================';
PRINT '6. TIMELINE - is this getting worse or was it a one-off?';
PRINT '=============================================================';
SELECT CONVERT(CHAR(7), si.IssueDate, 126)                        AS Month,
       COUNT(*)                                                   AS TotalLines,
       SUM(CASE WHEN ISNULL(sid.UnitLandedCost,0) = 0 THEN 1 ELSE 0 END) AS ZeroCostLines,
       CAST(100.0 * SUM(CASE WHEN ISNULL(sid.UnitLandedCost,0) = 0 THEN 1 ELSE 0 END)
            / NULLIF(COUNT(*),0) AS DECIMAL(5,1))                 AS PctZero
FROM   data_StockIssuetoJobCardDetail sid
JOIN   data_StockIssuetoJobCard si ON si.StockIssueID = sid.StockIssueID
GROUP  BY CONVERT(CHAR(7), si.IssueDate, 126)
ORDER  BY Month;

PRINT '';
PRINT 'diag_zero_part_cost complete (read-only, nothing changed).';
