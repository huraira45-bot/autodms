-- 152: shared historical vouchers, with a separate budget for each ledger account.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.dms_SalesPayments', 'LinkedVoucherGLCAID') IS NULL
    ALTER TABLE dbo.dms_SalesPayments ADD LinkedVoucherGLCAID INT NULL;
GO

-- Preserve the account used by existing links; payment/ledger amounts stay intact.
UPDATE p SET LinkedVoucherGLCAID=party.PartyGLID
FROM dbo.dms_SalesPayments p
JOIN dbo.dms_SalesBookings b ON b.BookingID=p.BookingID
JOIN dbo.gen_PartiesInfo party ON party.PartyID=b.PartyID
JOIN dbo.GLChartOFAccount account ON account.GLCAID=party.PartyGLID
WHERE p.IsLinkedVoucher=1 AND p.VoucherID IS NOT NULL AND p.LinkedVoucherGLCAID IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_SalesPayments_LinkedVoucherGL')
    ALTER TABLE dbo.dms_SalesPayments ADD CONSTRAINT FK_SalesPayments_LinkedVoucherGL
        FOREIGN KEY (LinkedVoucherGLCAID) REFERENCES dbo.GLChartOFAccount(GLCAID);

-- Capacity is checked under the voucher lock rather than blocking every reuse.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.dms_SalesPayments') AND name='UX_SalesPayments_LinkedVoucher')
    DROP INDEX UX_SalesPayments_LinkedVoucher ON dbo.dms_SalesPayments;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.dms_SalesPayments') AND name='IX_SalesPayments_HistoricalVoucherAccount')
    CREATE INDEX IX_SalesPayments_HistoricalVoucherAccount
        ON dbo.dms_SalesPayments(VoucherID, LinkedVoucherGLCAID)
        INCLUDE (Amount, PremiumPortion, BookingID)
        WHERE IsLinkedVoucher=1 AND VoucherID IS NOT NULL AND Status='Posted';

IF OBJECT_ID('dbo.dms_HistoricalMasterAllocations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_HistoricalMasterAllocations (
        AllocationID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID INT NOT NULL,
        VoucherID INT NOT NULL,
        GLCAID INT NOT NULL,
        Amount DECIMAL(18,2) NOT NULL,
        LinkedAt DATETIME NOT NULL CONSTRAINT DF_HistoricalMaster_LinkedAt DEFAULT GETDATE(),
        LinkedByEmployeeID INT NULL,
        LinkedByName NVARCHAR(100) NULL,
        CONSTRAINT CK_HistoricalMaster_Amount CHECK (Amount>0),
        CONSTRAINT FK_HistoricalMaster_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT FK_HistoricalMaster_Voucher FOREIGN KEY (VoucherID) REFERENCES dbo.data_FinanceVoucherInfo(VoucherID),
        CONSTRAINT FK_HistoricalMaster_Account FOREIGN KEY (GLCAID) REFERENCES dbo.GLChartOFAccount(GLCAID)
    );
    CREATE UNIQUE INDEX UX_HistoricalMaster_BookingVoucherAccount
        ON dbo.dms_HistoricalMasterAllocations(BookingID, VoucherID, GLCAID);
    CREATE INDEX IX_HistoricalMaster_VoucherAccount
        ON dbo.dms_HistoricalMasterAllocations(VoucherID, GLCAID) INCLUDE (BookingID, Amount);
END;
COMMIT TRANSACTION;
PRINT '152: historical vouchers can be allocated across accounts and bookings.';
GO
