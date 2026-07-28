-- ============================================================
-- 094 — Paint GRN: add Advance Income Tax (AIT) support
-- ============================================================
-- Owner ask 2026-07-27:
--   * Move GST calculation to be applied on GROSS (pre-discount),
--     matching regular GRN behaviour (grnJournalBuilder.js).
--   * Add per-line AITAmount, same as regular GRN. It Debits the
--     ADVANCE_TAX_236G_PARTS system account on finalize.
--
-- Column adds — safe, additive, defaults to 0 so existing drafts
-- keep computing to the same LineTotal after redeploy.
-- Posted rows are frozen; their old formula stays in the ledger.
-- ============================================================

IF COL_LENGTH('dbo.paint_GRNDetail', 'AITAmount') IS NULL
BEGIN
    ALTER TABLE dbo.paint_GRNDetail
        ADD AITAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_paint_GRNDetail_AIT DEFAULT 0;
    PRINT 'paint_GRNDetail.AITAmount added.';
END
ELSE
BEGIN
    PRINT 'paint_GRNDetail.AITAmount already exists.';
END
GO

IF COL_LENGTH('dbo.paint_GRN', 'AITTotal') IS NULL
BEGIN
    ALTER TABLE dbo.paint_GRN
        ADD AITTotal DECIMAL(18,2) NOT NULL CONSTRAINT DF_paint_GRN_AITTotal DEFAULT 0;
    PRINT 'paint_GRN.AITTotal added.';
END
ELSE
BEGIN
    PRINT 'paint_GRN.AITTotal already exists.';
END
GO
