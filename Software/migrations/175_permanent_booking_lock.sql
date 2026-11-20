-- Permanent application lock. No role or session-context bypass and no unlock action.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_PermanentBookingLocks','U') IS NULL
CREATE TABLE dbo.dms_PermanentBookingLocks(
 BookingID INT NOT NULL PRIMARY KEY REFERENCES dbo.dms_SalesBookings(BookingID),
 VehicleID INT NULL REFERENCES dbo.dms_Vehicle(VehicleID),
 Reason NVARCHAR(500) NOT NULL,
 ActorUserID INT NOT NULL,
 ActorName NVARCHAR(100) NOT NULL,
 LockedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID('dbo.dms_PermanentBookingVoucherLocks','U') IS NULL
CREATE TABLE dbo.dms_PermanentBookingVoucherLocks(
 VoucherID INT NOT NULL PRIMARY KEY REFERENCES dbo.data_FinanceVoucherInfo(VoucherID),
 BookingID INT NOT NULL REFERENCES dbo.dms_PermanentBookingLocks(BookingID)
);
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_BookingDeliveryReopens_PermanentBookingLock] ON dbo.[dms_BookingDeliveryReopens] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_BookingMasterInvoices_PermanentBookingLock] ON dbo.[dms_BookingMasterInvoices] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_DeliveredChassisCorrections_PermanentBookingLock] ON dbo.[dms_DeliveredChassisCorrections] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_HistoricalMasterAllocations_PermanentBookingLock] ON dbo.[dms_HistoricalMasterAllocations] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_HistoricalVoucherReferences_PermanentBookingLock] ON dbo.[dms_HistoricalVoucherReferences] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_NegotiationRequests_PermanentBookingLock] ON dbo.[dms_NegotiationRequests] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_PartyLedger_PermanentBookingLock] ON dbo.[dms_PartyLedger] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID UNION ALL SELECT 1 FROM (SELECT VoucherID FROM inserted UNION SELECT VoucherID FROM deleted) changed JOIN dbo.dms_PermanentBookingVoucherLocks frozen ON frozen.VoucherID=changed.VoucherID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesBookingCancellations_PermanentBookingLock] ON dbo.[dms_SalesBookingCancellations] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesBookings_PermanentBookingLock] ON dbo.[dms_SalesBookings] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesDocuments_PermanentBookingLock] ON dbo.[dms_SalesDocuments] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesIncentiveAccruals_PermanentBookingLock] ON dbo.[dms_SalesIncentiveAccruals] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesPayments_PermanentBookingLock] ON dbo.[dms_SalesPayments] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesPaymentVoidRequests_PermanentBookingLock] ON dbo.[dms_SalesPaymentVoidRequests] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesRecoveryInstallments_PermanentBookingLock] ON dbo.[dms_SalesRecoveryInstallments] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesRecoveryPlans_PermanentBookingLock] ON dbo.[dms_SalesRecoveryPlans] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_VehicleInventoryLedger_PermanentBookingLock] ON dbo.[dms_VehicleInventoryLedger] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks frozen ON frozen.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_data_FinanceVoucherDetail_PermanentBookingLock] ON dbo.[data_FinanceVoucherDetail] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID,VoucherID FROM inserted UNION SELECT BookingID,VoucherID FROM deleted) changed
 WHERE EXISTS(SELECT 1 FROM dbo.dms_PermanentBookingLocks l WHERE l.BookingID=changed.BookingID)
 OR EXISTS(SELECT 1 FROM dbo.dms_PermanentBookingVoucherLocks l WHERE l.VoucherID=changed.VoucherID))
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_data_FinanceVoucherInfo_PermanentBookingLock] ON dbo.[data_FinanceVoucherInfo] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT VoucherID,ReversesVoucherID,SourceDocType,SourceDocID FROM inserted UNION SELECT VoucherID,ReversesVoucherID,SourceDocType,SourceDocID FROM deleted) changed
 WHERE EXISTS(SELECT 1 FROM dbo.dms_PermanentBookingVoucherLocks l WHERE l.VoucherID=changed.VoucherID OR l.VoucherID=changed.ReversesVoucherID)
 OR EXISTS(SELECT 1 FROM dbo.dms_PermanentBookingLocks l WHERE
 (changed.SourceDocType IN (''PAY_MASTER'',''SALES_DELIVERY'',''MASTER_INVOICE'') AND changed.SourceDocID=l.BookingID)
 OR (changed.SourceDocType=''SALES_PAYMENT'' AND EXISTS(SELECT 1 FROM dbo.dms_SalesPayments p WHERE p.BookingID=l.BookingID AND p.PaymentID=changed.SourceDocID))))
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_GatePasses_PermanentBookingLock] ON dbo.[dms_GatePasses] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT DocType,DocID FROM inserted UNION SELECT DocType,DocID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks l ON changed.DocType=''BOOKING'' AND changed.DocID=l.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_Vehicle_PermanentBookingLock] ON dbo.[dms_Vehicle] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT VehicleID,CurrentBookingID FROM inserted UNION SELECT VehicleID,CurrentBookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks l ON l.VehicleID=changed.VehicleID OR l.BookingID=changed.CurrentBookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_PendingCheques_PermanentBookingLock] ON dbo.[dms_PendingCheques] AFTER INSERT,UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT ReceiptVoucherID,ClearanceVoucherID FROM inserted UNION SELECT ReceiptVoucherID,ClearanceVoucherID FROM deleted) changed JOIN dbo.dms_PermanentBookingVoucherLocks l ON l.VoucherID=changed.ReceiptVoucherID OR l.VoucherID=changed.ClearanceVoucherID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_SalesAuditLog_PermanentBookingLock] ON dbo.[dms_SalesAuditLog] AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks l ON l.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_BookingStateTransitions_PermanentBookingLock] ON dbo.[dms_BookingStateTransitions] AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM (SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted) changed JOIN dbo.dms_PermanentBookingLocks l ON l.BookingID=changed.BookingID)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_PermanentBookingLocks_Immutable] ON dbo.[dms_PermanentBookingLocks] AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
EXEC(N'CREATE OR ALTER TRIGGER dbo.[trg_dms_PermanentBookingVoucherLocks_Immutable] ON dbo.[dms_PermanentBookingVoucherLocks] AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted)
 THROW 51076,''This booking is permanently locked, including its linked vouchers. Changes are not allowed for any user.'',1;
END;');
COMMIT TRANSACTION;
