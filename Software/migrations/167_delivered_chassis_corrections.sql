-- Audited correction of an incorrectly selected delivered chassis. No GL writes.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_VehicleInventoryLedger','U') IS NULL
    THROW 51067,'Apply vehicle inventory migrations 161 and 162 first.',1;
IF OBJECT_ID('dbo.dms_DeliveredChassisCorrections','U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_DeliveredChassisCorrections (
        CorrectionID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        BookingID INT NOT NULL, GatePassID INT NOT NULL,
        OldVehicleID INT NOT NULL, NewVehicleID INT NOT NULL,
        OldChassis NVARCHAR(50) NOT NULL, NewChassis NVARCHAR(50) NOT NULL,
        LastOldDeliveryMovementID BIGINT NOT NULL,
        OriginalDeliveredAt DATETIME NOT NULL,
        Reason NVARCHAR(500) NOT NULL, ActorName NVARCHAR(100) NOT NULL,
        CreatedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        CompletedAtUtc DATETIME2(3) NULL,
        CONSTRAINT CK_ChassisCorrection_Different CHECK (OldVehicleID<>NewVehicleID),
        CONSTRAINT UX_ChassisCorrection_OldPass UNIQUE (OldVehicleID,GatePassID)
    );
    CREATE INDEX IX_ChassisCorrection_History ON dbo.dms_DeliveredChassisCorrections
        (OldVehicleID,BookingID,LastOldDeliveryMovementID) INCLUDE(CompletedAtUtc);
END;
DECLARE @body NVARCHAR(MAX)=OBJECT_DEFINITION(OBJECT_ID('dbo.trg_VehicleInventoryLedger'));
IF @body IS NULL OR CHARINDEX(N'Booking-backed delivery lock: 162',@body)=0
    THROW 51067,'Apply booking-backed vehicle protection migration 162 first.',1;
IF CHARINDEX(N'Audited chassis correction: 167',@body)=0
BEGIN
    DECLARE @history NVARCHAR(MAX)=N'WHERE deliveryHistory.VehicleID=d.VehicleID';
    DECLARE @historyReplacement NVARCHAR(MAX)=@history+N'
          AND NOT EXISTS (SELECT 1 FROM dbo.dms_DeliveredChassisCorrections corrected
              WHERE corrected.OldVehicleID=deliveryHistory.VehicleID AND corrected.BookingID=deliveryHistory.BookingID
                AND corrected.CompletedAtUtc IS NOT NULL
                AND deliveryHistory.MovementID<=corrected.LastOldDeliveryMovementID)';
    IF CHARINDEX(@history,@body)=0 THROW 51067,'Unexpected delivery history predicate.',1;
    SET @body=REPLACE(@body,@history,@historyReplacement);
    DECLARE @anchor NVARCHAR(100)=N'    ) THROW 51061';
    IF CHARINDEX(@anchor,@body)=0 THROW 51067,'Unexpected delivery protection trigger.',1;
    SET @body=REPLACE(@body,@anchor,N'
      -- Audited chassis correction: 167. Only an in-progress exact transition.
      AND NOT (i.VehicleID IS NOT NULL AND d.Status IN (''Delivered'',''Sold'')
        AND i.Status=''AtDealer'' AND i.CurrentBookingID IS NULL AND i.SoldDeliveredAt IS NULL
        AND EXISTS (SELECT 1 FROM dbo.dms_DeliveredChassisCorrections correction
            JOIN dbo.dms_SalesBookings booking ON booking.BookingID=correction.BookingID
            JOIN dbo.dms_Vehicle replacement ON replacement.VehicleID=correction.NewVehicleID
            JOIN dbo.dms_GatePasses pass ON pass.GatePassID=correction.GatePassID
            WHERE correction.CompletedAtUtc IS NULL AND correction.OldVehicleID=d.VehicleID
              AND correction.BookingID=d.CurrentBookingID AND correction.OldChassis=d.ChasisNo
              AND booking.AllocatedVehicleID=correction.NewVehicleID
              AND replacement.Status=''Delivered'' AND replacement.CurrentBookingID=booking.BookingID
              AND replacement.ChasisNo=correction.NewChassis AND replacement.VariantID=d.VariantID
              AND pass.DocType=''BOOKING'' AND pass.DocID=booking.BookingID AND pass.RevokedAt IS NULL
              AND pass.VehicleChassis=correction.NewChassis)
        AND NOT EXISTS (
            SELECT d.VariantID,CONVERT(VARBINARY(MAX),d.ChasisNo),CONVERT(VARBINARY(MAX),d.EngineNo),CONVERT(VARBINARY(MAX),d.Color),d.ManufactureYear,
                CONVERT(VARBINARY(MAX),d.AllocationType),CONVERT(VARBINARY(MAX),d.Location),d.ReceivedAt,d.ReceivedByEmployeeID,d.CreatedAt,d.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),d.CreatedByName)
            EXCEPT SELECT i.VariantID,CONVERT(VARBINARY(MAX),i.ChasisNo),CONVERT(VARBINARY(MAX),i.EngineNo),CONVERT(VARBINARY(MAX),i.Color),i.ManufactureYear,
                CONVERT(VARBINARY(MAX),i.AllocationType),CONVERT(VARBINARY(MAX),i.Location),i.ReceivedAt,i.ReceivedByEmployeeID,i.CreatedAt,i.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),i.CreatedByName)))
    ) THROW 51061');
    DECLARE @createAt INT=CHARINDEX(N'CREATE TRIGGER',UPPER(@body));
    IF @createAt>0 SET @body=STUFF(@body,@createAt,LEN(N'CREATE TRIGGER'),N'ALTER TRIGGER');
    EXEC sys.sp_executesql @body;
END;
IF OBJECT_ID('dbo.trg_DeliveredChassisCorrections_Immutable','TR') IS NOT NULL
    DROP TRIGGER dbo.trg_DeliveredChassisCorrections_Immutable;
EXEC(N'CREATE TRIGGER dbo.trg_DeliveredChassisCorrections_Immutable ON dbo.dms_DeliveredChassisCorrections
AFTER UPDATE,DELETE AS BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.CorrectionID=d.CorrectionID
        WHERE i.CorrectionID IS NULL OR d.CompletedAtUtc IS NOT NULL OR i.CompletedAtUtc IS NULL
        OR EXISTS (SELECT d.BookingID,d.GatePassID,d.OldVehicleID,d.NewVehicleID,d.OldChassis,d.NewChassis,d.LastOldDeliveryMovementID,d.OriginalDeliveredAt,d.Reason,d.ActorName,d.CreatedAtUtc
            EXCEPT SELECT i.BookingID,i.GatePassID,i.OldVehicleID,i.NewVehicleID,i.OldChassis,i.NewChassis,i.LastOldDeliveryMovementID,i.OriginalDeliveredAt,i.Reason,i.ActorName,i.CreatedAtUtc))
        THROW 51068,''Completed chassis corrections cannot be edited or deleted.'',1;
END');
COMMIT TRANSACTION;
