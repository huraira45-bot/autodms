-- Explicit, audited reversal of an issued booking delivery. No blanket delivery-lock bypass.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_DeliveredChassisCorrections','U') IS NULL
 THROW 51074,'Apply migration 167 first.',1;
IF OBJECT_ID('dbo.dms_BookingDeliveryReopens','U') IS NULL
BEGIN
 CREATE TABLE dbo.dms_BookingDeliveryReopens (
  ReopenID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  BookingID INT NOT NULL REFERENCES dbo.dms_SalesBookings(BookingID),
  VehicleID INT NOT NULL REFERENCES dbo.dms_Vehicle(VehicleID),
  GatePassID INT NOT NULL REFERENCES dbo.dms_GatePasses(GatePassID),
  DeliveryVoucherID INT NOT NULL REFERENCES dbo.data_FinanceVoucherInfo(VoucherID),
  ReversalVoucherID INT NOT NULL REFERENCES dbo.data_FinanceVoucherInfo(VoucherID),
  LastDeliveryMovementID BIGINT NOT NULL,
  OriginalValues NVARCHAR(MAX) NOT NULL,
  Reason NVARCHAR(500) NOT NULL,ActorUserID INT NOT NULL,ActorName NVARCHAR(100) NOT NULL,
  CreatedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),CompletedAtUtc DATETIME2(3) NULL,
  CONSTRAINT UQ_BookingDeliveryReopen_Pass UNIQUE(GatePassID),
  CONSTRAINT UQ_BookingDeliveryReopen_Voucher UNIQUE(DeliveryVoucherID),
  CONSTRAINT CK_BookingDeliveryReopen_Reversal CHECK(DeliveryVoucherID<>ReversalVoucherID)
 );
 CREATE INDEX IX_BookingDeliveryReopen_History ON dbo.dms_BookingDeliveryReopens(VehicleID,BookingID,LastDeliveryMovementID) INCLUDE(CompletedAtUtc);
END;
DECLARE @body NVARCHAR(MAX)=OBJECT_DEFINITION(OBJECT_ID('dbo.trg_VehicleInventoryLedger'));
IF @body IS NULL OR CHARINDEX(N'Audited chassis correction: 167',@body)=0
 THROW 51074,'Vehicle delivery protection migration 167 is required.',1;
IF CHARINDEX(N'Audited delivery reopen: 174',@body)=0
BEGIN
 DECLARE @pass NVARCHAR(MAX)=N'WHERE pass.DocType=''BOOKING'' AND pass.DocID=deliveredBooking.BookingID';
 IF CHARINDEX(@pass,@body)=0 THROW 51074,'Unexpected booking gate-pass guard.',1;
 SET @body=REPLACE(@body,@pass,@pass+N'
  AND NOT EXISTS(SELECT 1 FROM dbo.dms_BookingDeliveryReopens reopened
   WHERE reopened.BookingID=pass.DocID AND reopened.GatePassID=pass.GatePassID
    AND reopened.CompletedAtUtc IS NOT NULL AND pass.RevokedAt IS NOT NULL)');
 DECLARE @chassis NVARCHAR(MAX)=N'WHERE chassisPass.DocType=''BOOKING'' AND chassisPass.VehicleChassis=d.ChasisNo';
 IF CHARINDEX(@chassis,@body)=0 THROW 51074,'Unexpected chassis gate-pass guard.',1;
 SET @body=REPLACE(@body,@chassis,@chassis+N'
  AND NOT EXISTS(SELECT 1 FROM dbo.dms_BookingDeliveryReopens reopened
   WHERE reopened.GatePassID=chassisPass.GatePassID AND reopened.BookingID=chassisPass.DocID
    AND reopened.VehicleID=d.VehicleID AND reopened.CompletedAtUtc IS NOT NULL AND chassisPass.RevokedAt IS NOT NULL)');
 DECLARE @history NVARCHAR(MAX)=N'WHERE deliveryHistory.VehicleID=d.VehicleID';
 IF CHARINDEX(@history,@body)=0 THROW 51074,'Unexpected delivery history guard.',1;
 SET @body=REPLACE(@body,@history,@history+N'
  AND NOT EXISTS(SELECT 1 FROM dbo.dms_BookingDeliveryReopens reopened
   WHERE reopened.VehicleID=deliveryHistory.VehicleID AND reopened.BookingID=deliveryHistory.BookingID
    AND reopened.CompletedAtUtc IS NOT NULL AND deliveryHistory.MovementID<=reopened.LastDeliveryMovementID)');
 DECLARE @anchor NVARCHAR(MAX)=N'    ) THROW 51061';
 IF CHARINDEX(@anchor,@body)=0 THROW 51074,'Unexpected vehicle trigger anchor.',1;
 SET @body=REPLACE(@body,@anchor,N'
  -- Audited delivery reopen: 174. Exact linked delivery reversal, no identity changes.
  AND NOT (i.VehicleID IS NOT NULL AND d.Status IN (''Delivered'',''Sold'')
   AND i.Status=''AtDealer'' AND i.CurrentBookingID IS NULL AND i.SoldDeliveredAt IS NULL
   AND EXISTS(SELECT 1 FROM dbo.dms_BookingDeliveryReopens reopening
    JOIN dbo.dms_SalesBookings booking ON booking.BookingID=reopening.BookingID
    JOIN dbo.dms_GatePasses pass ON pass.GatePassID=reopening.GatePassID
    JOIN dbo.data_FinanceVoucherInfo original ON original.VoucherID=reopening.DeliveryVoucherID
    JOIN dbo.data_FinanceVoucherInfo mirror ON mirror.VoucherID=reopening.ReversalVoucherID
    WHERE reopening.CompletedAtUtc IS NULL AND reopening.VehicleID=d.VehicleID
     AND reopening.BookingID=d.CurrentBookingID AND booking.Status=''PendingPayment''
     AND booking.AllocatedVehicleID IS NULL AND booking.GatePassIssuedAt IS NULL
     AND booking.DeliveredAt IS NULL AND booking.ClosedAt IS NULL AND booking.DeliveryVoucherID IS NULL
     AND pass.DocType=''BOOKING'' AND pass.DocID=booking.BookingID AND pass.VehicleChassis=d.ChasisNo AND pass.RevokedAt IS NOT NULL
     AND original.Status=''Reversed'' AND original.SourceDocType=''SALES_DELIVERY'' AND original.SourceDocID=booking.BookingID
     AND mirror.Status=''Posted'' AND mirror.ReversesVoucherID=original.VoucherID)
   AND NOT EXISTS(SELECT 1 FROM dbo.dms_GatePasses activePass WHERE activePass.DocType=''BOOKING''
    AND activePass.VehicleChassis=d.ChasisNo AND activePass.RevokedAt IS NULL)
   AND NOT EXISTS(SELECT d.VariantID,CONVERT(VARBINARY(MAX),d.ChasisNo),CONVERT(VARBINARY(MAX),d.EngineNo),CONVERT(VARBINARY(MAX),d.Color),d.ManufactureYear,
    CONVERT(VARBINARY(MAX),d.AllocationType),CONVERT(VARBINARY(MAX),d.Location),d.ReceivedAt,d.ReceivedByEmployeeID,d.CreatedAt,d.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),d.CreatedByName),d.MasterInvoiceVoucherID
    EXCEPT SELECT i.VariantID,CONVERT(VARBINARY(MAX),i.ChasisNo),CONVERT(VARBINARY(MAX),i.EngineNo),CONVERT(VARBINARY(MAX),i.Color),i.ManufactureYear,
    CONVERT(VARBINARY(MAX),i.AllocationType),CONVERT(VARBINARY(MAX),i.Location),i.ReceivedAt,i.ReceivedByEmployeeID,i.CreatedAt,i.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),i.CreatedByName),i.MasterInvoiceVoucherID))
    ) THROW 51061');
 DECLARE @createAt INT=CHARINDEX(N'CREATE TRIGGER',UPPER(@body));
 IF @createAt>0 SET @body=STUFF(@body,@createAt,LEN(N'CREATE TRIGGER'),N'ALTER TRIGGER');
 EXEC sys.sp_executesql @body;
END;
IF OBJECT_ID('dbo.trg_BookingDeliveryReopens_Immutable','TR') IS NOT NULL DROP TRIGGER dbo.trg_BookingDeliveryReopens_Immutable;
EXEC(N'CREATE TRIGGER dbo.trg_BookingDeliveryReopens_Immutable ON dbo.dms_BookingDeliveryReopens AFTER UPDATE,DELETE AS BEGIN
 SET NOCOUNT ON;
 IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.ReopenID=d.ReopenID
  WHERE i.ReopenID IS NULL OR d.CompletedAtUtc IS NOT NULL OR i.CompletedAtUtc IS NULL
   OR EXISTS(SELECT d.BookingID,d.VehicleID,d.GatePassID,d.DeliveryVoucherID,d.ReversalVoucherID,d.LastDeliveryMovementID,
    CONVERT(VARBINARY(MAX),d.OriginalValues),CONVERT(VARBINARY(MAX),d.Reason),d.ActorUserID,CONVERT(VARBINARY(MAX),d.ActorName),d.CreatedAtUtc
    EXCEPT SELECT i.BookingID,i.VehicleID,i.GatePassID,i.DeliveryVoucherID,i.ReversalVoucherID,i.LastDeliveryMovementID,
    CONVERT(VARBINARY(MAX),i.OriginalValues),CONVERT(VARBINARY(MAX),i.Reason),i.ActorUserID,CONVERT(VARBINARY(MAX),i.ActorName),i.CreatedAtUtc))
  THROW 51075,''Completed delivery reopen records are immutable.'',1;
END');
COMMIT TRANSACTION;
