-- =============================================================================
-- 139: Historical bookings — deals done before DealerDesk, whose money is
--      already sitting in the chart of accounts.
--
-- Owner ask 2026-09-18: enter the old booking on the normal booking form, but
-- instead of posting a payment voucher, LINK each payment to the voucher that
-- is already posted in the ledger. Nothing new hits the GL.
--
--   dms_SalesBookings.IsHistorical         this booking is a past record
--   dms_SalesBookings.BookingDate          the date the deal actually happened
--   dms_SalesBookings.HistoricalEnteredAt  when it was typed into DealerDesk
--   dms_SalesPayments.IsLinkedVoucher      points at a voucher we did not post
--
-- CreatedAt is set to the real booking date on these rows so existing reports
-- place them in the period they belong to; HistoricalEnteredAt keeps the audit
-- of when the data entry happened.
--
-- A voucher already in the ledger can back exactly one payment (owner
-- decision), which the filtered unique index enforces.
-- =============================================================================
SET NOCOUNT ON;

IF COL_LENGTH('dbo.dms_SalesBookings', 'IsHistorical') IS NULL
BEGIN
    ALTER TABLE dbo.dms_SalesBookings
        ADD IsHistorical BIT NOT NULL CONSTRAINT DF_SalesBookings_IsHistorical DEFAULT 0;
    PRINT 'dms_SalesBookings.IsHistorical added.';
END
ELSE PRINT 'dms_SalesBookings.IsHistorical already exists — skipped.';
GO

IF COL_LENGTH('dbo.dms_SalesBookings', 'BookingDate') IS NULL
BEGIN
    ALTER TABLE dbo.dms_SalesBookings ADD BookingDate DATETIME NULL;
    PRINT 'dms_SalesBookings.BookingDate added.';
END
ELSE PRINT 'dms_SalesBookings.BookingDate already exists — skipped.';
GO

IF COL_LENGTH('dbo.dms_SalesBookings', 'HistoricalEnteredAt') IS NULL
BEGIN
    ALTER TABLE dbo.dms_SalesBookings ADD HistoricalEnteredAt DATETIME NULL;
    PRINT 'dms_SalesBookings.HistoricalEnteredAt added.';
END
ELSE PRINT 'dms_SalesBookings.HistoricalEnteredAt already exists — skipped.';
GO

IF COL_LENGTH('dbo.dms_SalesPayments', 'IsLinkedVoucher') IS NULL
BEGIN
    ALTER TABLE dbo.dms_SalesPayments
        ADD IsLinkedVoucher BIT NOT NULL CONSTRAINT DF_SalesPayments_IsLinkedVoucher DEFAULT 0;
    PRINT 'dms_SalesPayments.IsLinkedVoucher added.';
END
ELSE PRINT 'dms_SalesPayments.IsLinkedVoucher already exists — skipped.';
GO

-- One posted voucher backs one payment, so the same money is never counted twice.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_SalesPayments_LinkedVoucher')
BEGIN
    CREATE UNIQUE INDEX UX_SalesPayments_LinkedVoucher
        ON dbo.dms_SalesPayments(VoucherID)
        WHERE IsLinkedVoucher = 1 AND VoucherID IS NOT NULL;
    PRINT 'UX_SalesPayments_LinkedVoucher created.';
END
ELSE PRINT 'UX_SalesPayments_LinkedVoucher already exists — skipped.';
GO

PRINT '139 done — historical bookings ready.';
