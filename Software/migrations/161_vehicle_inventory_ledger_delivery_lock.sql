-- Vehicle stock is a quantity register, independent of the general ledger.
-- Existing vehicles begin with an explicit opening snapshot; no past movements
-- are invented. New insert/update/delete movements are recorded atomically.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes idx JOIN sys.index_columns ic ON ic.object_id=idx.object_id AND ic.index_id=idx.index_id
    JOIN sys.columns col ON col.object_id=ic.object_id AND col.column_id=ic.column_id
    WHERE idx.object_id=OBJECT_ID('dbo.dms_SalesBookings') AND idx.is_disabled=0 AND ic.key_ordinal=1 AND col.name='AllocatedVehicleID'
)
    CREATE INDEX IX_SalesBookings_AllocatedVehicle ON dbo.dms_SalesBookings(AllocatedVehicleID)
        INCLUDE(GatePassIssuedAt) WHERE AllocatedVehicleID IS NOT NULL;

IF OBJECT_ID('dbo.dms_VehicleInventoryLedgerConfig','U') IS NULL
    CREATE TABLE dbo.dms_VehicleInventoryLedgerConfig (
        ConfigID INT NOT NULL PRIMARY KEY CHECK (ConfigID=1),
        StartedAtUtc DATETIME2(3) NOT NULL
    );
IF OBJECT_ID('dbo.dms_VehicleInventoryLedger','U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_VehicleInventoryLedger (
        MovementID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        VehicleID INT NOT NULL, VariantID INT NOT NULL, ModelID INT NOT NULL,
        ModelName NVARCHAR(200) NULL, VariantCode NVARCHAR(100) NULL, VariantName NVARCHAR(300) NULL,
        ChasisNo NVARCHAR(50) NOT NULL, EngineNo NVARCHAR(50) NULL,
        OccurredAtUtc DATETIME2(3) NOT NULL,
        EntryType NVARCHAR(30) NOT NULL,
        FromStatus NVARCHAR(20) NULL, ToStatus NVARCHAR(20) NULL,
        FromLocation NVARCHAR(100) NULL, ToLocation NVARCHAR(100) NULL,
        FromBookingID INT NULL, BookingID INT NULL,
        QuantityIn INT NOT NULL, QuantityOut INT NOT NULL,
        ActorName NVARCHAR(200) NULL,
        CONSTRAINT CK_VehicleLedger_Qty CHECK (QuantityIn IN (0,1) AND QuantityOut IN (0,1) AND QuantityIn+QuantityOut<=1)
    );
    -- No foreign key: the ledger must survive deletion of an undelivered chassis.
    CREATE INDEX IX_VehicleLedger_VariantAt ON dbo.dms_VehicleInventoryLedger(VariantID,OccurredAtUtc,MovementID)
        INCLUDE (QuantityIn,QuantityOut,VehicleID);
    CREATE INDEX IX_VehicleLedger_VehicleAt ON dbo.dms_VehicleInventoryLedger(VehicleID,OccurredAtUtc,MovementID);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.dms_VehicleInventoryLedgerConfig WHERE ConfigID=1)
BEGIN
    -- Repair existing gate-pass vehicles before enforcing the permanent lock.
    -- A pass already printed also counts if the delivery voucher is still draft.
    UPDATE v SET Status='Delivered',
        SoldDeliveredAt=COALESCE(v.SoldDeliveredAt,proof.DeliveredAt),UpdatedAt=GETDATE()
    FROM dbo.dms_Vehicle v
    CROSS APPLY (
        SELECT MIN(COALESCE(b.GatePassIssuedAt,g.IssuedAt,b.DeliveredAt)) AS DeliveredAt
        FROM dbo.dms_SalesBookings b
        OUTER APPLY (SELECT MIN(gp.IssuedAt) AS IssuedAt FROM dbo.dms_GatePasses gp
                     WHERE gp.DocType='BOOKING' AND gp.DocID=b.BookingID) g
        WHERE b.AllocatedVehicleID=v.VehicleID
          AND (b.GatePassIssuedAt IS NOT NULL OR g.IssuedAt IS NOT NULL)
    ) proof
    WHERE proof.DeliveredAt IS NOT NULL;

    DECLARE @start DATETIME2(3)=SYSUTCDATETIME();
    INSERT dbo.dms_VehicleInventoryLedgerConfig(ConfigID,StartedAtUtc) VALUES(1,@start);
    INSERT dbo.dms_VehicleInventoryLedger
        (VehicleID,VariantID,ModelID,ModelName,VariantCode,VariantName,ChasisNo,EngineNo,
         OccurredAtUtc,EntryType,ToStatus,ToLocation,BookingID,QuantityIn,QuantityOut,ActorName)
    SELECT v.VehicleID,v.VariantID,m.ModelID,m.ModelName,vr.VariantCode,vr.VariantName,v.ChasisNo,v.EngineNo,
        @start,'Opening',v.Status,v.Location,v.CurrentBookingID,
        CASE WHEN v.Status IN ('Delivered','Sold','Returned') THEN 0 ELSE 1 END,0,N'Opening snapshot'
    FROM dbo.dms_Vehicle v JOIN dbo.dms_VehicleVariant vr ON vr.VariantID=v.VariantID
    JOIN dbo.dms_VehicleModel m ON m.ModelID=vr.ModelID;
END;

IF OBJECT_ID('dbo.trg_VehicleInventoryLedger','TR') IS NOT NULL DROP TRIGGER dbo.trg_VehicleInventoryLedger;
EXEC(N'CREATE TRIGGER dbo.trg_VehicleInventoryLedger ON dbo.dms_Vehicle
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS(SELECT 1 FROM inserted) AND NOT EXISTS(SELECT 1 FROM deleted) RETURN;
    -- No role bypass. Business inventory fields are immutable after delivery.
    -- Late invoice/accounting references and actor timestamps remain writable.
    IF EXISTS (
        SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.VehicleID=d.VehicleID
        WHERE (d.Status IN (''Delivered'',''Sold'') OR d.SoldDeliveredAt IS NOT NULL)
          AND (i.VehicleID IS NULL OR EXISTS (
              SELECT d.VariantID,CONVERT(VARBINARY(MAX),d.ChasisNo),CONVERT(VARBINARY(MAX),d.EngineNo),CONVERT(VARBINARY(MAX),d.Color),d.ManufactureYear,CONVERT(VARBINARY(MAX),d.AllocationType),
                     CONVERT(VARBINARY(MAX),d.Status),CONVERT(VARBINARY(MAX),d.Location),d.CurrentBookingID,d.ReceivedAt,d.SoldDeliveredAt,d.ReceivedByEmployeeID,
                     d.CreatedAt,d.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),d.CreatedByName)
              EXCEPT
              SELECT i.VariantID,CONVERT(VARBINARY(MAX),i.ChasisNo),CONVERT(VARBINARY(MAX),i.EngineNo),CONVERT(VARBINARY(MAX),i.Color),i.ManufactureYear,CONVERT(VARBINARY(MAX),i.AllocationType),
                     CONVERT(VARBINARY(MAX),i.Status),CONVERT(VARBINARY(MAX),i.Location),i.CurrentBookingID,i.ReceivedAt,i.SoldDeliveredAt,i.ReceivedByEmployeeID,
                     i.CreatedAt,i.CreatedByEmployeeID,CONVERT(VARBINARY(MAX),i.CreatedByName)
          ))
    ) THROW 51061,''Delivered vehicles are locked. Editing or deletion is not allowed.'',1;

    DECLARE @now DATETIME2(3)=SYSUTCDATETIME();
    DECLARE @actorSet BIT=CASE WHEN UPDATE(UpdatedByName) THEN 1 ELSE 0 END;
    INSERT dbo.dms_VehicleInventoryLedger
        (VehicleID,VariantID,ModelID,ModelName,VariantCode,VariantName,ChasisNo,EngineNo,OccurredAtUtc,
         EntryType,FromStatus,ToStatus,FromLocation,ToLocation,FromBookingID,BookingID,QuantityIn,QuantityOut,ActorName)
    SELECT i.VehicleID,i.VariantID,vr.ModelID,m.ModelName,vr.VariantCode,vr.VariantName,i.ChasisNo,i.EngineNo,@now,
        CASE WHEN d.VehicleID IS NULL THEN ''Registered'' WHEN i.Status IN (''Delivered'',''Sold'') THEN ''Delivered''
             WHEN i.Status=''Returned'' THEN ''Returned'' WHEN d.Status=''Returned'' THEN ''Restored''
             WHEN d.Status<>i.Status THEN ''StatusChanged'' ELSE ''Edited'' END,
        d.Status,i.Status,d.Location,i.Location,d.CurrentBookingID,i.CurrentBookingID,
        CASE WHEN qty.NewStock>qty.OldStock THEN 1 ELSE 0 END,
        CASE WHEN qty.OldStock>qty.NewStock THEN 1 ELSE 0 END,
        COALESCE(CASE WHEN d.VehicleID IS NULL THEN i.CreatedByName WHEN @actorSet=1 THEN i.UpdatedByName END,ORIGINAL_LOGIN())
    FROM inserted i LEFT JOIN deleted d ON d.VehicleID=i.VehicleID
    JOIN dbo.dms_VehicleVariant vr ON vr.VariantID=i.VariantID
    JOIN dbo.dms_VehicleModel m ON m.ModelID=vr.ModelID
    CROSS APPLY (SELECT CASE WHEN i.Status IN (''Delivered'',''Sold'',''Returned'') THEN 0 ELSE 1 END AS NewStock,
                        CASE WHEN d.VehicleID IS NULL OR d.Status IN (''Delivered'',''Sold'',''Returned'') THEN 0 ELSE 1 END AS OldStock) qty
    WHERE (d.VehicleID IS NULL OR d.VariantID=i.VariantID) AND
        (d.VehicleID IS NULL OR EXISTS (
            SELECT CONVERT(VARBINARY(MAX),d.ChasisNo),CONVERT(VARBINARY(MAX),d.EngineNo),CONVERT(VARBINARY(MAX),d.Color),d.ManufactureYear,CONVERT(VARBINARY(MAX),d.AllocationType),CONVERT(VARBINARY(MAX),d.Status),CONVERT(VARBINARY(MAX),d.Location),
                   d.CurrentBookingID,d.ReceivedAt,d.SoldDeliveredAt
            EXCEPT
            SELECT CONVERT(VARBINARY(MAX),i.ChasisNo),CONVERT(VARBINARY(MAX),i.EngineNo),CONVERT(VARBINARY(MAX),i.Color),i.ManufactureYear,CONVERT(VARBINARY(MAX),i.AllocationType),CONVERT(VARBINARY(MAX),i.Status),CONVERT(VARBINARY(MAX),i.Location),
                   i.CurrentBookingID,i.ReceivedAt,i.SoldDeliveredAt
        ));

    -- Remove from the old variant on a variant transfer or deletion.
    INSERT dbo.dms_VehicleInventoryLedger
        (VehicleID,VariantID,ModelID,ModelName,VariantCode,VariantName,ChasisNo,EngineNo,OccurredAtUtc,
         EntryType,FromStatus,ToStatus,FromLocation,ToLocation,FromBookingID,BookingID,QuantityIn,QuantityOut,ActorName)
    SELECT d.VehicleID,d.VariantID,vr.ModelID,m.ModelName,vr.VariantCode,vr.VariantName,d.ChasisNo,d.EngineNo,@now,
        CASE WHEN i.VehicleID IS NULL THEN ''Removed'' ELSE ''VariantOut'' END,
        d.Status,i.Status,d.Location,i.Location,d.CurrentBookingID,i.CurrentBookingID,0,
        CASE WHEN d.Status IN (''Delivered'',''Sold'',''Returned'') THEN 0 ELSE 1 END,
        COALESCE(CONVERT(NVARCHAR(200),SESSION_CONTEXT(N''dms_vehicle_actor'')),CASE WHEN @actorSet=1 THEN i.UpdatedByName END,ORIGINAL_LOGIN())
    FROM deleted d LEFT JOIN inserted i ON i.VehicleID=d.VehicleID
    JOIN dbo.dms_VehicleVariant vr ON vr.VariantID=d.VariantID JOIN dbo.dms_VehicleModel m ON m.ModelID=vr.ModelID
    WHERE i.VehicleID IS NULL OR i.VariantID<>d.VariantID;

    INSERT dbo.dms_VehicleInventoryLedger
        (VehicleID,VariantID,ModelID,ModelName,VariantCode,VariantName,ChasisNo,EngineNo,OccurredAtUtc,
         EntryType,FromStatus,ToStatus,FromLocation,ToLocation,FromBookingID,BookingID,QuantityIn,QuantityOut,ActorName)
    SELECT i.VehicleID,i.VariantID,vr.ModelID,m.ModelName,vr.VariantCode,vr.VariantName,i.ChasisNo,i.EngineNo,@now,
        ''VariantIn'',d.Status,i.Status,d.Location,i.Location,d.CurrentBookingID,i.CurrentBookingID,
        CASE WHEN i.Status IN (''Delivered'',''Sold'',''Returned'') THEN 0 ELSE 1 END,0,
        COALESCE(CASE WHEN @actorSet=1 THEN i.UpdatedByName END,ORIGINAL_LOGIN())
    FROM inserted i JOIN deleted d ON d.VehicleID=i.VehicleID
    JOIN dbo.dms_VehicleVariant vr ON vr.VariantID=i.VariantID JOIN dbo.dms_VehicleModel m ON m.ModelID=vr.ModelID
    WHERE i.VariantID<>d.VariantID;
END');

IF OBJECT_ID('dbo.trg_VehicleInventoryLedger_Immutable','TR') IS NOT NULL DROP TRIGGER dbo.trg_VehicleInventoryLedger_Immutable;
EXEC(N'CREATE TRIGGER dbo.trg_VehicleInventoryLedger_Immutable ON dbo.dms_VehicleInventoryLedger
INSTEAD OF UPDATE, DELETE AS BEGIN
    SET NOCOUNT ON;
    THROW 51062,''Vehicle inventory ledger entries cannot be edited or deleted.'',1;
END');
COMMIT TRANSACTION;
