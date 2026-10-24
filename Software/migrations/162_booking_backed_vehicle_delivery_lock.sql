-- A Delivered/Sold label alone does not lock an unlinked vehicle.
-- Preserve real booking delivery links, including gate-pass and immutable
-- ledger evidence if a header link was later removed. No vehicle is restocked
-- or reclassified by this migration; all movement/quantity logic is retained.
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_VehicleInventoryLedger','U') IS NULL
    THROW 51066,'Apply vehicle inventory migration 161 before migration 162.',1;
DECLARE @body NVARCHAR(MAX)=OBJECT_DEFINITION(OBJECT_ID('dbo.trg_VehicleInventoryLedger'));
IF @body IS NULL THROW 51066,'Vehicle inventory trigger is missing. Apply migration 161 first.',1;
IF CHARINDEX(N'Booking-backed delivery lock: 162',@body)>0
    PRINT '162: booking-backed delivery lock already installed.';
ELSE
BEGIN
    DECLARE @old NVARCHAR(MAX)=N'WHERE (d.Status IN (''Delivered'',''Sold'') OR d.SoldDeliveredAt IS NOT NULL)';
    DECLARE @replacement NVARCHAR(MAX)=N'WHERE /* Booking-backed delivery lock: 162 */ (EXISTS (
        SELECT 1 FROM dms_SalesBookings deliveredBooking
        WHERE (deliveredBooking.AllocatedVehicleID=d.VehicleID OR deliveredBooking.BookingID=d.CurrentBookingID)
          AND (d.Status IN (''Delivered'',''Sold'') OR d.SoldDeliveredAt IS NOT NULL
              OR deliveredBooking.DeliveredAt IS NOT NULL OR deliveredBooking.GatePassIssuedAt IS NOT NULL OR EXISTS (
                  SELECT 1 FROM dms_GatePasses pass WHERE pass.DocType=''BOOKING'' AND pass.DocID=deliveredBooking.BookingID)))
        OR EXISTS (SELECT 1 FROM dms_GatePasses chassisPass
            JOIN dms_SalesBookings passBooking ON passBooking.BookingID=chassisPass.DocID
            WHERE chassisPass.DocType=''BOOKING'' AND chassisPass.VehicleChassis=d.ChasisNo)
        OR EXISTS (SELECT 1 FROM dms_VehicleInventoryLedger deliveryHistory
            JOIN dms_SalesBookings historyBooking ON historyBooking.BookingID=deliveryHistory.BookingID
            WHERE deliveryHistory.VehicleID=d.VehicleID
              AND (deliveryHistory.EntryType=''Delivered'' OR
                  (deliveryHistory.EntryType=''Opening'' AND deliveryHistory.ToStatus IN (''Delivered'',''Sold'')))))
      -- Permit only the first completion of the already-issued booking gate pass.
      AND NOT (i.VehicleID IS NOT NULL AND d.Status NOT IN (''Delivered'',''Sold'',''Returned'') AND d.SoldDeliveredAt IS NULL
        AND i.Status=''Delivered'' AND i.SoldDeliveredAt IS NOT NULL AND i.CurrentBookingID IS NOT NULL
        AND (d.CurrentBookingID IS NULL OR d.CurrentBookingID=i.CurrentBookingID)
        AND EXISTS(SELECT 1 FROM dbo.dms_SalesBookings completingBooking JOIN dbo.dms_GatePasses completingPass
            ON completingPass.DocType=''BOOKING'' AND completingPass.DocID=completingBooking.BookingID
            WHERE completingBooking.BookingID=i.CurrentBookingID AND completingBooking.AllocatedVehicleID=d.VehicleID)
        AND NOT EXISTS(SELECT d.VariantID,CONVERT(VARBINARY(MAX),d.ChasisNo),CONVERT(VARBINARY(MAX),d.EngineNo),CONVERT(VARBINARY(MAX),d.Color),d.ManufactureYear,
            CONVERT(VARBINARY(MAX),d.AllocationType),CONVERT(VARBINARY(MAX),d.Location),d.ReceivedAt,d.ReceivedByEmployeeID,d.CreatedAt,d.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),d.CreatedByName)
            EXCEPT SELECT i.VariantID,CONVERT(VARBINARY(MAX),i.ChasisNo),CONVERT(VARBINARY(MAX),i.EngineNo),CONVERT(VARBINARY(MAX),i.Color),i.ManufactureYear,
            CONVERT(VARBINARY(MAX),i.AllocationType),CONVERT(VARBINARY(MAX),i.Location),i.ReceivedAt,i.ReceivedByEmployeeID,i.CreatedAt,i.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),i.CreatedByName)))';
    IF CHARINDEX(@old,@body)=0 OR CHARINDEX(@old,@body,CHARINDEX(@old,@body)+LEN(@old))>0
        THROW 51066,'Unexpected inventory trigger definition. No lock changes applied.',1;
    SET @body=REPLACE(@body,@old,@replacement);
    DECLARE @createAt INT=CHARINDEX(N'CREATE TRIGGER',UPPER(@body));
    IF @createAt>0 SET @body=STUFF(@body,@createAt,LEN(N'CREATE TRIGGER'),N'ALTER TRIGGER');
    ELSE IF CHARINDEX(N'ALTER TRIGGER',UPPER(@body))=0
        THROW 51066,'Unexpected inventory trigger declaration. No lock changes applied.',1;
    EXEC sys.sp_executesql @body;
    PRINT '162: unlinked vehicle labels no longer impose a delivery lock.';
END;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.dms_GatePasses') AND name='IX_GatePass_BookingChassis')
    CREATE INDEX IX_GatePass_BookingChassis ON dbo.dms_GatePasses(VehicleChassis,DocID) WHERE DocType='BOOKING';
COMMIT TRANSACTION;
