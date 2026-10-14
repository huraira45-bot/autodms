-- References are documentation only; no payment, allocation or ledger amount is changed.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_HistoricalVoucherReferences','U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_HistoricalVoucherReferences (
        ReferenceID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID INT NOT NULL,
        VoucherID INT NOT NULL,
        ReferenceKind NVARCHAR(10) NOT NULL,
        PaymentID INT NULL,
        LinkedAt DATETIME NOT NULL CONSTRAINT DF_HistoricalVoucherReferences_LinkedAt DEFAULT GETDATE(),
        LinkedByName NVARCHAR(100) NULL,
        CONSTRAINT CK_HistoricalVoucherReferences_Kind CHECK (
            (ReferenceKind='CUSTOMER' AND PaymentID IS NOT NULL) OR
            (ReferenceKind IN ('BOOKING','MASTER') AND PaymentID IS NULL)),
        CONSTRAINT FK_HistoricalVoucherReferences_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT FK_HistoricalVoucherReferences_Voucher FOREIGN KEY (VoucherID) REFERENCES dbo.data_FinanceVoucherInfo(VoucherID),
        CONSTRAINT FK_HistoricalVoucherReferences_Payment FOREIGN KEY (PaymentID) REFERENCES dbo.dms_SalesPayments(PaymentID)
    );
    CREATE UNIQUE INDEX UX_HistoricalVoucherReferences_Scope
        ON dbo.dms_HistoricalVoucherReferences(BookingID,ReferenceKind,PaymentID,VoucherID);
END;
COMMIT TRANSACTION;
PRINT '153: historical voucher references added without changing payment totals.';
GO
