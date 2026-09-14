-- 135_service_estimates.sql
-- Service tablet app, Phase 1 (plan 2026-09-14).
--
-- The ESTIMATE: what the service advisor builds at the vehicle before any job
-- card exists. A job card is opened only once the customer signs (Phase 2), so
-- a customer who walks away never consumes an RO number.
--
--   dms_ServiceEstimates      header: customer, vehicle snapshot, totals, status
--   dms_ServiceEstimateLines  labour (catalog services only) and parts
--   dms_ServiceMedia          walk-around videos and photos
--   seq_ServiceEstimateNo     EST-00001 numbering
--
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'seq_ServiceEstimateNo')
BEGIN
    CREATE SEQUENCE dbo.seq_ServiceEstimateNo AS INT START WITH 1 INCREMENT BY 1;
    PRINT '135: created seq_ServiceEstimateNo.';
END
GO

IF OBJECT_ID('dms_ServiceEstimates', 'U') IS NULL
BEGIN
    CREATE TABLE dms_ServiceEstimates (
        EstimateID        INT IDENTITY(1,1) CONSTRAINT PK_ServiceEstimates PRIMARY KEY,
        EstimateNo        NVARCHAR(20)  NOT NULL CONSTRAINT UQ_ServiceEstimates_No UNIQUE,
        Status            NVARCHAR(20)  NOT NULL CONSTRAINT DF_ServiceEstimates_Status DEFAULT 'Draft',
        RevisionNo        INT           NOT NULL CONSTRAINT DF_ServiceEstimates_Revision DEFAULT 1,
        ParentEstimateID  INT           NULL,
        JobCardID         INT           NULL,
        EndUserID         INT           NULL,   -- addata_CustomerInfo.ProfileID
        VehicleID         INT           NULL,   -- WorkshopVehicles.VehicleID
        VehicleRegNo      NVARCHAR(150) NULL,
        ChasisNo          NVARCHAR(150) NULL,
        EngineNo          NVARCHAR(150) NULL,
        VehicleModel      NVARCHAR(300) NULL,   -- matches Addata_JobCardInfo.VersionCode (migration 134)
        KiloMeter         DECIMAL(18,2) NULL,
        JobTypeId         INT           NULL,
        CustomerRemarks   NVARCHAR(MAX) NULL,
        PSTRate           DECIMAL(8,4)  NULL,
        GSTRate           DECIMAL(8,4)  NULL,
        LabourTotal       DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceEstimates_Labour    DEFAULT 0,
        LabourTax         DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceEstimates_LabourTax DEFAULT 0,
        PartsTotal        DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceEstimates_Parts     DEFAULT 0,
        PartsTax          DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceEstimates_PartsTax  DEFAULT 0,
        GrandTotal        DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceEstimates_Grand     DEFAULT 0,
        AdvisorUserID     INT           NULL,
        AdvisorName       NVARCHAR(100) NULL,
        CreatedAt         DATETIME      NOT NULL CONSTRAINT DF_ServiceEstimates_Created DEFAULT GETDATE(),
        UpdatedAt         DATETIME      NULL,
        CancelledAt       DATETIME      NULL,
        CancelReason      NVARCHAR(300) NULL,
        CONSTRAINT CK_ServiceEstimates_Status
            CHECK (Status IN ('Draft', 'AwaitingSignature', 'Signed', 'Converted', 'Cancelled'))
    );
    CREATE INDEX IX_ServiceEstimates_Status   ON dms_ServiceEstimates (Status, AdvisorUserID);
    CREATE INDEX IX_ServiceEstimates_Customer ON dms_ServiceEstimates (EndUserID);
    PRINT '135: created dms_ServiceEstimates.';
END
GO

IF OBJECT_ID('dms_ServiceEstimateLines', 'U') IS NULL
BEGIN
    CREATE TABLE dms_ServiceEstimateLines (
        LineID      INT IDENTITY(1,1) CONSTRAINT PK_ServiceEstimateLines PRIMARY KEY,
        EstimateID  INT           NOT NULL
                    CONSTRAINT FK_ServiceEstimateLines_Estimate REFERENCES dms_ServiceEstimates (EstimateID),
        LineSeq     INT           NOT NULL,
        LineType    NVARCHAR(10)  NOT NULL,
        ItemID      INT           NOT NULL,   -- InventItems.ItemId
        Description NVARCHAR(300) NOT NULL,
        PartNumber  NVARCHAR(100) NULL,
        Quantity    DECIMAL(18,2) NOT NULL,
        Rate        DECIMAL(18,2) NOT NULL,
        DiscAmt     DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceEstimateLines_Disc    DEFAULT 0,
        TaxRate     DECIMAL(8,4)  NOT NULL CONSTRAINT DF_ServiceEstimateLines_TaxRate DEFAULT 0,
        TaxAmount   DECIMAL(18,2) NOT NULL CONSTRAINT DF_ServiceEstimateLines_Tax     DEFAULT 0,
        LineTotal   DECIMAL(18,2) NOT NULL,
        CONSTRAINT CK_ServiceEstimateLines_Type CHECK (LineType IN ('LABOUR', 'PART')),
        CONSTRAINT CK_ServiceEstimateLines_Qty  CHECK (Quantity > 0)
    );
    CREATE INDEX IX_ServiceEstimateLines_Estimate ON dms_ServiceEstimateLines (EstimateID, LineSeq);
    PRINT '135: created dms_ServiceEstimateLines.';
END
GO

IF OBJECT_ID('dms_ServiceMedia', 'U') IS NULL
BEGIN
    CREATE TABLE dms_ServiceMedia (
        MediaID          INT IDENTITY(1,1) CONSTRAINT PK_ServiceMedia PRIMARY KEY,
        EstimateID       INT           NULL
                         CONSTRAINT FK_ServiceMedia_Estimate REFERENCES dms_ServiceEstimates (EstimateID),
        JobCardID        INT           NULL,   -- linked when the estimate becomes a job card
        MediaType        NVARCHAR(10)  NOT NULL,
        FileName         NVARCHAR(260) NOT NULL,   -- name only; resolved inside uploads/service-media
        OriginalName     NVARCHAR(260) NULL,
        MimeType         NVARCHAR(100) NULL,
        SizeBytes        BIGINT        NULL,
        CapturedByUserID INT           NULL,
        CapturedByName   NVARCHAR(100) NULL,
        CapturedAt       DATETIME      NOT NULL CONSTRAINT DF_ServiceMedia_Captured DEFAULT GETDATE(),
        DeletedAt        DATETIME      NULL,
        CONSTRAINT CK_ServiceMedia_Type CHECK (MediaType IN ('VIDEO', 'PHOTO'))
    );
    CREATE INDEX IX_ServiceMedia_Estimate ON dms_ServiceMedia (EstimateID);
    PRINT '135: created dms_ServiceMedia.';
END
GO

PRINT '135_service_estimates complete.';
