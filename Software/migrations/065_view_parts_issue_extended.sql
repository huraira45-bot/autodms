-- 065_view_parts_issue_extended.sql
-- Owner ask 2026-07-03: the Parts Issue form now shows discount, GST, and
-- the alphanumeric ManualNumber, and drives a "parts issued to job cards"
-- report. Re-create the underlying view so those columns are actually
-- exposed to the API layer.
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('vw_PartsIssueToJobCard', 'V') IS NOT NULL
    DROP VIEW vw_PartsIssueToJobCard;
GO

CREATE VIEW vw_PartsIssueToJobCard AS
SELECT
    si.StockIssueID, si.IssueDate, si.IssueNo,
    si.JobCardId, si.JobCardNo, si.Remarks,
    sid.StockIssueDetailID, sid.ItemId,
    i.ItenName        AS ItemName,
    i.ItemNumber      AS ItemNumber,
    i.ManualNumber    AS ManualNumber,
    sid.Quantity, sid.StockRate, sid.ItemRate,
    sid.IssueQuantity,
    ISNULL(sid.Discount, 0)  AS Discount,
    ISNULL(sid.DiscAmt, 0)   AS DiscAmt,
    ISNULL(sid.TaxRate, 0)   AS TaxRate,
    ISNULL(sid.TaxAmount, 0) AS TaxAmount,
    -- Line net = qty*rate - discount + tax (so a report can just SUM this).
    (ISNULL(sid.IssueQuantity, 0) * ISNULL(sid.ItemRate, 0))
        - ISNULL(sid.DiscAmt, 0)
        + ISNULL(sid.TaxAmount, 0)          AS LineNet,
    sid.TechnicainId  AS TechnicianId
FROM data_StockIssuetoJobCard si
JOIN data_StockIssuetoJobCardDetail sid ON si.StockIssueID = sid.StockIssueID
LEFT JOIN InventItems i ON sid.ItemId = i.ItemId;
GO

PRINT '065_view_parts_issue_extended applied.';
GO
