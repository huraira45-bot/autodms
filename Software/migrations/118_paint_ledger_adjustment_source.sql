-- ================================================================
-- 118 — paint_StockLedger.SourceType: allow manual ADJUSTMENT entries
-- ================================================================
-- Owner report 2026-08-07: 2K CLEAR and 2K HARDENER were received on
-- PGRN-0060 against the "Gram (base)" UOM when the operator meant
-- cans (both items have GramsPerUnit set: 1000g/can and 500g/can
-- respectively) -- 16 was entered as 16 grams instead of being
-- converted from 16 cans. This corrects that GRN's stock/cost impact
-- via a proper stock-ledger entry rather than a silent UPDATE, which
-- needs a SourceType value the existing enum doesn't have.
-- ================================================================
SET NOCOUNT ON;
PRINT '=== 118_paint_ledger_adjustment_source ===';

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_paint_Ledger_Source')
BEGIN
    ALTER TABLE paint_StockLedger DROP CONSTRAINT CK_paint_Ledger_Source;
    PRINT '  Dropped CK_paint_Ledger_Source';
END
GO

ALTER TABLE paint_StockLedger
    ADD CONSTRAINT CK_paint_Ledger_Source CHECK (
        SourceType IN ('JC_UNFIN', 'ISSUE_DEL', 'ISSUE_ADJ', 'ISSUE', 'GRTN', 'GRN', 'ADJUSTMENT')
    );
PRINT '  CK_paint_Ledger_Source rebuilt (ADJUSTMENT added).';
GO

PRINT '=== 118_paint_ledger_adjustment_source: done ===';
