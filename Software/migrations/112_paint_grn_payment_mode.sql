-- 112_paint_grn_payment_mode.sql
-- Owner ask 2026-08-07: some Paint GRNs are paid in cash on the spot
-- (walk-in / one-off paint purchases) rather than on credit to a supplier
-- account. CREDIT (default) keeps today's behaviour -- Cr the supplier's
-- PartyGL, a payable is created, and the supplier must have a GL account
-- linked. CASH instead credits CASH_BOOK directly on finalize and never
-- requires the supplier to have a GL account at all.
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'paint_GRN' AND COLUMN_NAME = 'PaymentMode'
)
BEGIN
    ALTER TABLE paint_GRN ADD PaymentMode NVARCHAR(20) NOT NULL DEFAULT 'CREDIT';
    PRINT 'Added PaymentMode to paint_GRN.';
END
ELSE
    PRINT 'PaymentMode already exists on paint_GRN.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints WHERE name = 'CK_paint_GRN_PaymentMode'
)
BEGIN
    ALTER TABLE paint_GRN ADD CONSTRAINT CK_paint_GRN_PaymentMode CHECK (PaymentMode IN ('CREDIT','CASH'));
    PRINT 'Added CK_paint_GRN_PaymentMode.';
END
ELSE
    PRINT 'CK_paint_GRN_PaymentMode already exists.';
GO

PRINT '112_paint_grn_payment_mode complete.';
