-- Month close controls protect entry/void/delete actions, not delivery or posting workflows.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_BookingMonthLocks','U') IS NULL
CREATE TABLE dbo.dms_BookingMonthLocks(
 MonthStart DATE NOT NULL PRIMARY KEY,
 IsLocked BIT NOT NULL,
 RevisionID UNIQUEIDENTIFIER NOT NULL,
 UpdatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
 UpdatedByUserID INT NULL, UpdatedByName NVARCHAR(100) NOT NULL,
 Reason NVARCHAR(500) NOT NULL,
 CONSTRAINT CK_BookingMonthLock_FirstDay CHECK(DAY(MonthStart)=1)
);
IF OBJECT_ID('dbo.dms_BookingMonthLockHistory','U') IS NULL
CREATE TABLE dbo.dms_BookingMonthLockHistory(
 HistoryID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 MonthStart DATE NOT NULL, IsLocked BIT NOT NULL, RevisionID UNIQUEIDENTIFIER NOT NULL,
 AtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
 ActorUserID INT NULL, ActorName NVARCHAR(100) NOT NULL, Reason NVARCHAR(500) NOT NULL
);
INSERT dbo.dms_BookingMonthLocks(MonthStart,IsLocked,RevisionID,UpdatedByName,Reason)
OUTPUT inserted.MonthStart,inserted.IsLocked,inserted.RevisionID,inserted.UpdatedByUserID,inserted.UpdatedByName,inserted.Reason
 INTO dbo.dms_BookingMonthLockHistory(MonthStart,IsLocked,RevisionID,ActorUserID,ActorName,Reason)
SELECT x.MonthStart,1,NEWID(),'Owner-requested initial setup','Owner requested July through October 2026 booking months locked.'
FROM (VALUES(CONVERT(DATE,'20260701')),(CONVERT(DATE,'20260801')),(CONVERT(DATE,'20260901')),(CONVERT(DATE,'20261001'))) x(MonthStart)
WHERE NOT EXISTS(SELECT 1 FROM dbo.dms_BookingMonthLocks l WITH(UPDLOCK,HOLDLOCK) WHERE l.MonthStart=x.MonthStart);
EXEC(N'CREATE OR ALTER TRIGGER dbo.trg_BookingMonth_EntryDate ON dbo.dms_SalesBookings AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;

 IF EXISTS(SELECT 1 FROM inserted i LEFT JOIN deleted d ON d.BookingID=i.BookingID
 JOIN dbo.dms_BookingMonthLocks l WITH(UPDLOCK,HOLDLOCK) ON l.IsLocked=1 AND
 (l.MonthStart=DATEFROMPARTS(YEAR(COALESCE(i.BookingDate,i.CreatedAt)),MONTH(COALESCE(i.BookingDate,i.CreatedAt)),1)
 OR l.MonthStart=DATEFROMPARTS(YEAR(COALESCE(d.BookingDate,d.CreatedAt)),MONTH(COALESCE(d.BookingDate,d.CreatedAt)),1))
 WHERE d.BookingID IS NULL OR CONVERT(DATE,COALESCE(i.BookingDate,i.CreatedAt))<>CONVERT(DATE,COALESCE(d.BookingDate,d.CreatedAt)))
 THROW 51077,''This booking month is locked. The main Administrator must unlock it first.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.trg_BookingMonth_DocumentDelete ON dbo.dms_SalesDocuments AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;

 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.DocumentID=d.DocumentID
 JOIN dbo.dms_SalesBookings b ON b.BookingID=d.BookingID
 JOIN dbo.dms_BookingMonthLocks l WITH(UPDLOCK,HOLDLOCK) ON l.IsLocked=1 AND l.MonthStart=DATEFROMPARTS(YEAR(COALESCE(b.BookingDate,b.CreatedAt)),MONTH(COALESCE(b.BookingDate,b.CreatedAt)),1)
 WHERE i.DocumentID IS NULL OR i.BookingID<>d.BookingID OR (d.DeletedAt IS NULL AND i.DeletedAt IS NOT NULL) OR ISNULL(i.FilePath,'''')<>ISNULL(d.FilePath,''''))
 THROW 51077,''This booking month is locked. The main Administrator must unlock it first.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.trg_BookingMonth_PaymentVoid ON dbo.dms_SalesPaymentVoidRequests AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;

 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.dms_SalesBookings b ON b.BookingID=i.BookingID
 JOIN dbo.dms_BookingMonthLocks l WITH(UPDLOCK,HOLDLOCK) ON l.IsLocked=1 AND l.MonthStart=DATEFROMPARTS(YEAR(COALESCE(b.BookingDate,b.CreatedAt)),MONTH(COALESCE(b.BookingDate,b.CreatedAt)),1)
 WHERE i.Status IN (''Pending'',''AMApproved'',''Executed''))
 THROW 51077,''This booking month is locked. The main Administrator must unlock it first.'',1;
END;');
EXEC(N'CREATE OR ALTER VIEW dbo.v_BookingVoucherRelations AS
 SELECT BookingID,VoucherID FROM dbo.data_FinanceVoucherDetail WHERE BookingID IS NOT NULL
 UNION SELECT BookingID,VoucherID FROM dbo.dms_SalesPayments WHERE VoucherID IS NOT NULL
 UNION SELECT BookingID,DeliveryVoucherID FROM dbo.dms_SalesBookings WHERE DeliveryVoucherID IS NOT NULL
 UNION SELECT BookingID,VoucherID FROM dbo.dms_HistoricalMasterAllocations
 UNION SELECT BookingID,VoucherID FROM dbo.dms_HistoricalVoucherReferences
 UNION SELECT b.BookingID,v.VoucherID FROM dbo.data_FinanceVoucherInfo v JOIN dbo.dms_SalesBookings b
 ON v.SourceDocID=b.BookingID AND v.SourceDocType IN (''PAY_MASTER'',''MASTER_INVOICE'',''SALES_DELIVERY'')');
EXEC(N'CREATE OR ALTER TRIGGER dbo.trg_BookingMonth_VoucherVoidRequest ON dbo.dms_UnfinalizeRequests AFTER INSERT,UPDATE AS
BEGIN
 SET NOCOUNT ON;

 IF EXISTS(SELECT 1 FROM inserted i JOIN dbo.v_BookingVoucherRelations r ON r.VoucherID=i.EntityID AND i.EntityType=''VOUCHER''
 JOIN dbo.dms_SalesBookings b ON b.BookingID=r.BookingID
 JOIN dbo.dms_BookingMonthLocks l WITH(UPDLOCK,HOLDLOCK) ON l.IsLocked=1 AND l.MonthStart=DATEFROMPARTS(YEAR(COALESCE(b.BookingDate,b.CreatedAt)),MONTH(COALESCE(b.BookingDate,b.CreatedAt)),1)
 WHERE i.Status IN (''PENDING'',''AM_APPROVED'',''COMPLETED''))
 THROW 51077,''This booking month is locked. The main Administrator must unlock it first.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.trg_BookingMonth_HistoryImmutable ON dbo.dms_BookingMonthLockHistory AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted) THROW 51078,''Booking month lock history cannot be edited or deleted.'',1;
END;');
COMMIT TRANSACTION;
