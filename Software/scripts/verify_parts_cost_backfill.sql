/* ===================================================================
   verify_parts_cost_backfill.sql
   -------------------------------------------------------------------
   Confirms what the parts-cost backfill actually did, and — the part
   that matters — whether the correcting JV exists and what state it
   is in. The lines can be repaired while the GL correction is still
   sitting unfinalized, so the two must be checked separately.

   READ-ONLY. Changes nothing.
   =================================================================== */
SET NOCOUNT ON;

PRINT '=============================================================';
PRINT '1. ZERO-COST ISSUE LINES REMAINING, BY MONTH';
PRINT '=============================================================';
SELECT CONVERT(CHAR(7), si.IssueDate, 126)                              AS Month,
       COUNT(*)                                                         AS TotalLines,
       SUM(CASE WHEN ISNULL(sid.UnitLandedCost,0) = 0 THEN 1 ELSE 0 END) AS StillZero
FROM   data_StockIssuetoJobCardDetail sid
JOIN   data_StockIssuetoJobCard si ON si.StockIssueID = sid.StockIssueID
GROUP  BY CONVERT(CHAR(7), si.IssueDate, 126)
ORDER  BY Month;

PRINT '';
PRINT '=============================================================';
PRINT '2. WHAT THE BACKFILL REPAIRED';
PRINT '=============================================================';
SELECT BatchTag,
       CostSource,
       COUNT(*)                                                    AS Lines,
       CAST(SUM(Quantity * NewUnitLandedCost) AS DECIMAL(18,2))    AS CostWritten,
       MIN(AppliedAt)                                              AS AppliedAt
FROM   dms_PartsCostBackfill
GROUP  BY BatchTag, CostSource
ORDER  BY BatchTag, CostSource;

PRINT '';
PRINT '=============================================================';
PRINT '3. SPLIT: FINALIZED (needs the JV) vs DRAFT (does not)';
PRINT '=============================================================';
SELECT BatchTag,
       CASE WHEN WasFinalized = 1 THEN 'FINALIZED - needs JV'
            ELSE 'Draft - posts on finalize' END                   AS JobCardState,
       COUNT(*)                                                    AS Lines,
       COUNT(DISTINCT JobCardId)                                   AS JobCards,
       CAST(SUM(Quantity * NewUnitLandedCost) AS DECIMAL(18,2))    AS Cost
FROM   dms_PartsCostBackfill
GROUP  BY BatchTag, CASE WHEN WasFinalized = 1 THEN 'FINALIZED - needs JV'
                         ELSE 'Draft - posts on finalize' END
ORDER  BY BatchTag, JobCardState;

PRINT '';
PRINT '=============================================================';
PRINT '4. THE CORRECTING JV  <<-- the one that matters';
PRINT '=============================================================';
SELECT v.VoucherNo,
       CONVERT(CHAR(10), v.VoucherDate, 120)                       AS VoucherDate,
       v.Status,
       v.Posted,
       CAST(v.TotalAmount AS DECIMAL(18,2))                        AS TotalAmount,
       (SELECT COUNT(*) FROM data_FinanceVoucherDetail d WHERE d.VoucherID = v.VoucherID) AS Lines,
       CAST((SELECT SUM(d.Debit)  FROM data_FinanceVoucherDetail d WHERE d.VoucherID = v.VoucherID) AS DECIMAL(18,2)) AS TotalDr,
       CAST((SELECT SUM(d.Credit) FROM data_FinanceVoucherDetail d WHERE d.VoucherID = v.VoucherID) AS DECIMAL(18,2)) AS TotalCr
FROM   data_FinanceVoucherInfo v
WHERE  v.SourceDocType = 'PARTS_COST_CORRECTION'
ORDER  BY v.VoucherID;

IF NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE SourceDocType = 'PARTS_COST_CORRECTION')
BEGIN
    PRINT '  *** NO CORRECTING JV EXISTS. The issue lines may be repaired but';
    PRINT '  *** the GL has NOT been corrected. See section 5.';
END

PRINT '';
PRINT '=============================================================';
PRINT '5. RECONCILIATION - repaired cost vs what the JV covers';
PRINT '=============================================================';
SELECT b.BatchTag,
       CAST(SUM(CASE WHEN b.WasFinalized = 1 THEN b.Quantity * b.NewUnitLandedCost ELSE 0 END)
            AS DECIMAL(18,2))                                      AS CostOnFinalizedJCs,
       CAST(ISNULL((SELECT SUM(v.TotalAmount) FROM data_FinanceVoucherInfo v
                    WHERE v.SourceDocType = 'PARTS_COST_CORRECTION'
                      AND CONVERT(CHAR(7), v.VoucherDate, 126) = b.BatchTag), 0)
            AS DECIMAL(18,2))                                      AS JVAmount,
       CAST(SUM(CASE WHEN b.WasFinalized = 1 THEN b.Quantity * b.NewUnitLandedCost ELSE 0 END)
            - ISNULL((SELECT SUM(v.TotalAmount) FROM data_FinanceVoucherInfo v
                      WHERE v.SourceDocType = 'PARTS_COST_CORRECTION'
                        AND CONVERT(CHAR(7), v.VoucherDate, 126) = b.BatchTag), 0)
            AS DECIMAL(18,2))                                      AS Difference
FROM   dms_PartsCostBackfill b
GROUP  BY b.BatchTag;

PRINT '';
PRINT 'Difference should be 0.00. Anything else means the JV does not cover';
PRINT 'the repaired cost -- tell Claude before finalizing anything.';
PRINT '';
PRINT 'verify_parts_cost_backfill complete (read-only, nothing changed).';
