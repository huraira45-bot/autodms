-- =============================================================================
-- 143: Indexes for the voucher tables
--
-- Owner report 2026-09-24: the voucher browser has become slow. It did not
-- start that way — the tables grow with every job card, sale and purchase, and
-- data_FinanceVoucherDetail had no index at all beyond its primary key and one
-- on BookingID. Every query that asked for a voucher's lines read the whole
-- table.
--
-- That table is referenced 128 times across the controllers and services, so
-- this is not only the browser: opening a voucher, the trial balance, account
-- ledgers, outstanding invoices, allocations and the reversal service were all
-- doing the same full scan.
--
-- The indexes below cover the four ways it is actually filtered, counted from
-- the code rather than guessed:
--   VoucherID            — every voucher load, and the EXISTS in the search
--   GLCAID               — account ledger and trial balance (45 queries)
--   PartyID              — party statements, outstanding invoices
--   AllocatedToVoucherID — settlement lookups
--
-- PartyID and AllocatedToVoucherID are filtered indexes: most lines carry
-- neither, so indexing only the rows that do keeps them small.
--
-- NOTE: building these takes a brief lock on each table. On this data size that
-- is seconds, but run it when the workshop is not mid-invoice.
-- =============================================================================
SET NOCOUNT ON;
-- Filtered indexes refuse to build unless these are ON, and sqlcmd leaves
-- QUOTED_IDENTIFIER off by default. Stated here so this file behaves the same
-- whether it is run by the migration runner or pasted into sqlcmd.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The big one. Without it, "give me this voucher's lines" scans everything.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FinVoucherDetail_Voucher'
               AND object_id = OBJECT_ID('dbo.data_FinanceVoucherDetail'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_FinVoucherDetail_Voucher
        ON dbo.data_FinanceVoucherDetail (VoucherID)
        INCLUDE (GLCAID, Debit, Credit, PartyID, JobCardID);
    PRINT 'IX_FinVoucherDetail_Voucher created.';
END
ELSE PRINT 'IX_FinVoucherDetail_Voucher already exists — skipped.';
GO

-- Account ledger and trial balance walk the detail by account.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FinVoucherDetail_Account'
               AND object_id = OBJECT_ID('dbo.data_FinanceVoucherDetail'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_FinVoucherDetail_Account
        ON dbo.data_FinanceVoucherDetail (GLCAID)
        INCLUDE (VoucherID, Debit, Credit, PartyID, JobCardID);
    PRINT 'IX_FinVoucherDetail_Account created.';
END
ELSE PRINT 'IX_FinVoucherDetail_Account already exists — skipped.';
GO

-- Most lines have no party; index only the ones that do.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FinVoucherDetail_Party'
               AND object_id = OBJECT_ID('dbo.data_FinanceVoucherDetail'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_FinVoucherDetail_Party
        ON dbo.data_FinanceVoucherDetail (PartyID)
        INCLUDE (VoucherID, GLCAID, Debit, Credit)
        WHERE PartyID IS NOT NULL;
    PRINT 'IX_FinVoucherDetail_Party created.';
END
ELSE PRINT 'IX_FinVoucherDetail_Party already exists — skipped.';
GO

-- Likewise for settlement: only receipt/payment lines carry an allocation.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FinVoucherDetail_Allocated'
               AND object_id = OBJECT_ID('dbo.data_FinanceVoucherDetail'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_FinVoucherDetail_Allocated
        ON dbo.data_FinanceVoucherDetail (AllocatedToVoucherID)
        INCLUDE (VoucherID, PartyID, Debit, Credit)
        WHERE AllocatedToVoucherID IS NOT NULL;
    PRINT 'IX_FinVoucherDetail_Allocated created.';
END
ELSE PRINT 'IX_FinVoucherDetail_Allocated already exists — skipped.';
GO

-- The browser orders by date descending and filters on date ranges; without
-- this the whole filtered set is sorted on every page of results.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VoucherInfo_Date'
               AND object_id = OBJECT_ID('dbo.data_FinanceVoucherInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_VoucherInfo_Date
        ON dbo.data_FinanceVoucherInfo (VoucherDate DESC, VoucherID DESC)
        INCLUDE (VoucherNo, VoucherTypeID, Status, TotalAmount);
    PRINT 'IX_VoucherInfo_Date created.';
END
ELSE PRINT 'IX_VoucherInfo_Date already exists — skipped.';
GO

-- Draft lists and status filters ask for one status at a time, newest first.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VoucherInfo_Status_Date'
               AND object_id = OBJECT_ID('dbo.data_FinanceVoucherInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_VoucherInfo_Status_Date
        ON dbo.data_FinanceVoucherInfo (Status, VoucherDate DESC)
        INCLUDE (VoucherNo, VoucherTypeID, TotalAmount);
    PRINT 'IX_VoucherInfo_Status_Date created.';
END
ELSE PRINT 'IX_VoucherInfo_Status_Date already exists — skipped.';
GO

PRINT '143 done — the voucher tables are indexed the way they are queried.';
