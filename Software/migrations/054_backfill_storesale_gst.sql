-- 054_backfill_storesale_gst.sql
-- The policy is now: every Store Sale line must have GST. Older sales were
-- saved with IsGST=0 or TaxAmount=NULL/0 — this migration backfills them so
-- reports and the trial balance are consistent going forward.
--
-- Strategy:
--   * Read the CURRENT GST rate from gen_TaxInfo (the same source the UI
--     reads via /api/tax-rates). Default to 18 if no rate exists.
--   * For every detail row where IsGST=0 OR TaxAmount=0/NULL:
--       - Set IsGST=1
--       - Compute TaxAmount = Quantity * SaleRate * (rate/100)
--       - Bump TaxPercent so reports show the right %
--       - Recompute NetAmount = (Qty * Rate) - DiscountAmount + TaxAmount
--   * Roll the per-line numbers up into the header (TotalTaxAmount, NetPayable).
--
-- Caveat for whoever runs this: the GL was already posted for these sales
-- with TaxAmount = 0. The journal entries don't change — so after this
-- backfill the StoreSale subledger will show GST while the GL won't.
-- A manual JV is needed to reflect the GST_PAYABLE catch-up:
--      Dr Customer A/R (or Cash)   <delta>
--      Cr GST_PAYABLE              <delta>
-- (delta = sum of new TaxAmount added across all backfilled sales).
SET QUOTED_IDENTIFIER ON;
GO

-- Read the currently-effective GST rate from dms_TaxRates (the source the
-- UI reads via /api/tax-rates). Fall back to 18 if no GST row is configured.
DECLARE @rate DECIMAL(5,2);
SELECT TOP 1 @rate = Rate
FROM dms_TaxRates
WHERE TaxType = 'GST'
  AND EffectiveFrom <= GETDATE()
  AND (EffectiveTo IS NULL OR EffectiveTo > GETDATE())
ORDER BY EffectiveFrom DESC;
IF @rate IS NULL SET @rate = 18.00;

PRINT 'Backfilling Store Sale GST at rate = ' + CAST(@rate AS NVARCHAR(10)) + '%';

-- Snapshot what's about to change (for the audit-trail PRINT below)
DECLARE @linesChanged INT, @deltaTax DECIMAL(18,2);
SELECT @linesChanged = COUNT(*),
       @deltaTax     = ISNULL(SUM(ISNULL(d.Quantity,0) * ISNULL(d.SaleRate,0) * (@rate/100.0)
                                  - ISNULL(d.TaxAmount,0)), 0)
FROM data_StoreSaleDetail d
WHERE ISNULL(d.IsGST, 0) = 0 OR ISNULL(d.TaxAmount, 0) = 0;

PRINT 'Detail rows to backfill: ' + CAST(ISNULL(@linesChanged,0) AS NVARCHAR(20));
PRINT 'GST amount added (Rs):   ' + CAST(ISNULL(@deltaTax,0) AS NVARCHAR(40));

-- Patch the detail rows
UPDATE d
SET d.IsGST       = 1,
    d.TaxPercent  = @rate,
    d.TaxAmount   = ROUND(ISNULL(d.Quantity,0) * ISNULL(d.SaleRate,0) * (@rate/100.0), 2),
    d.NetAmount   = ROUND(
                       ISNULL(d.Quantity,0) * ISNULL(d.SaleRate,0)
                       - ISNULL(d.DiscountAmount,0)
                       + ROUND(ISNULL(d.Quantity,0) * ISNULL(d.SaleRate,0) * (@rate/100.0), 2)
                    , 2)
FROM data_StoreSaleDetail d
WHERE ISNULL(d.IsGST, 0) = 0 OR ISNULL(d.TaxAmount, 0) = 0;

-- Roll up the header totals from the patched detail rows
UPDATE s
SET s.TotalTaxAmount = agg.TotalTax,
    s.NetPayable     = agg.NetSum + ISNULL(s.DeliveryExpense, 0)
FROM data_StoreSaleInfo s
JOIN (
    SELECT SaleID,
           SUM(ISNULL(TaxAmount,0)) AS TotalTax,
           SUM(ISNULL(NetAmount,0)) AS NetSum
    FROM data_StoreSaleDetail
    GROUP BY SaleID
) agg ON agg.SaleID = s.SaleID;

PRINT '054_backfill_storesale_gst.sql complete.';
GO
