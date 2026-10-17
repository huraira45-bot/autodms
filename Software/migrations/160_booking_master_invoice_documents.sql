-- Master invoice paperwork can arrive after delivery/closure. No GL posting.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SalesDocuments_DocType')
    ALTER TABLE dbo.dms_SalesDocuments DROP CONSTRAINT CK_SalesDocuments_DocType;
ALTER TABLE dbo.dms_SalesDocuments WITH CHECK ADD CONSTRAINT CK_SalesDocuments_DocType CHECK (DocType IN (
    N'ProofOfPayment',N'PBO',N'CNIC',N'AuthorityLetter',N'MasterIncentivePolicyLetter',N'Other',N'MasterInvoice'
));
IF OBJECT_ID('dbo.dms_BookingMasterInvoices','U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_BookingMasterInvoices (
        BookingID INT NOT NULL PRIMARY KEY,
        InvoiceNo NVARCHAR(100) NOT NULL,
        InvoiceDate DATE NOT NULL,
        DocumentID INT NOT NULL UNIQUE,
        Notes NVARCHAR(500) NULL,
        RecordedByUserID INT NOT NULL,
        RecordedByName NVARCHAR(100) NOT NULL,
        RecordedAt DATETIME2(3) NOT NULL CONSTRAINT DF_BookingMasterInvoices_At DEFAULT SYSUTCDATETIME(),
        IncentiveProcessedAt DATETIME2(3) NULL,
        CONSTRAINT FK_BookingMasterInvoices_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT FK_BookingMasterInvoices_Document FOREIGN KEY (DocumentID) REFERENCES dbo.dms_SalesDocuments(DocumentID)
    );
END;
IF COL_LENGTH('dbo.dms_BookingMasterInvoices','IncentiveProcessedAt') IS NULL
    ALTER TABLE dbo.dms_BookingMasterInvoices ADD IncentiveProcessedAt DATETIME2(3) NULL;

-- Enforce the rule for new/re-accrued Master amounts, including alternate
-- insertion paths. Existing accruals and employee incentives are untouched.
IF OBJECT_ID('dbo.trg_MasterAccrual_RequiresInvoice','TR') IS NOT NULL
    DROP TRIGGER dbo.trg_MasterAccrual_RequiresInvoice;
EXEC('CREATE TRIGGER dbo.trg_MasterAccrual_RequiresInvoice ON dbo.dms_SalesIncentiveAccruals
AFTER INSERT, UPDATE AS BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i LEFT JOIN deleted old ON old.AccrualID=i.AccrualID
        JOIN dbo.dms_SalesBookings b ON b.BookingID=i.BookingID
        WHERE i.EarnerType=''Master'' AND i.Status<>''Reversed''
          AND (old.AccrualID IS NULL OR old.EarnerType<>''Master'' OR old.Status=''Reversed''
               OR old.BookingID<>i.BookingID OR old.AmountAccrued<>i.AmountAccrued)
          AND (b.IsHistorical=1 OR NOT EXISTS (
              SELECT 1 FROM dbo.dms_BookingMasterInvoices m
              JOIN dbo.dms_SalesDocuments d ON d.DocumentID=m.DocumentID AND d.BookingID=m.BookingID
              WHERE m.BookingID=i.BookingID AND d.DocType=''MasterInvoice'' AND d.DeletedAt IS NULL
          ))
    ) THROW 51001, ''Master incentives require an uploaded Master invoice on a non-historical booking.'', 1;
END');
COMMIT TRANSACTION;
