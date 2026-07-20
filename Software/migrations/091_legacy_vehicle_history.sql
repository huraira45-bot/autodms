-- =============================================================================
-- 091: Legacy vehicle history — shadow tables
--
-- Imports historical Repair Orders + line items from the old FIS system
-- (database: ssMasterVehicle) so operators can see a vehicle's full service
-- history when a car returns to the workshop.
--
-- SHADOW-ONLY: none of these tables feed the current JC / GL / reports
-- pipeline. They are read-only history, joined into the Vehicle History
-- page by RegistrationNumber / ChassisNumber / EngineNumber only.
--
-- Author: Claude via owner ask 2026-07-20
-- =============================================================================
SET NOCOUNT ON;

-- ---------- Legacy_JobCards (RO header, one row per srvRepairOrderHead) ------
IF OBJECT_ID('dbo.Legacy_JobCards', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Legacy_JobCards (
        LegacyID              BIGINT         NOT NULL PRIMARY KEY,        -- ss.ID
        WorkOrderNo           NVARCHAR(100)  NULL,                        -- human-facing RO#
        JobCardDate           DATETIME       NULL,                        -- DateIn
        CompletedDate         DATETIME       NULL,                        -- DateOut
        PromisedDate          DATETIME       NULL,                        -- PromiseDate
        WorkOrderStatus       NVARCHAR(30)   NULL,
        IsFinal               BIT            NULL,
        FinalAt               DATETIME       NULL,

        -- Service type — derived from the two legacy category columns
        ServiceType           NVARCHAR(30)   NULL,                        -- 'B&P' / 'PPM' / 'GR'
        BusinessUnitID        INT            NULL,
        PeriodicMaintainceID  INT            NULL,

        -- Advisor / staff
        AdvisorID             INT            NULL,
        AdvisorName           NVARCHAR(200)  NULL,
        ForemanName           NVARCHAR(200)  NULL,

        -- Vehicle snapshot
        RegistrationNumber    NVARCHAR(20)   NULL,
        ChassisNumber         NVARCHAR(20)   NULL,
        EngineNumber          NVARCHAR(20)   NULL,
        VehicleType           NVARCHAR(200)  NULL,
        VType                 NVARCHAR(20)   NULL,
        Model                 NVARCHAR(20)   NULL,
        ColorName             NVARCHAR(40)   NULL,
        OdMeter               INT            NULL,

        -- Customer snapshot (denormalised on the legacy row, we keep it as-is)
        CustomerName          NVARCHAR(150)  NULL,
        Mobile1               NVARCHAR(20)   NULL,
        Mobile2               NVARCHAR(20)   NULL,
        Phone                 NVARCHAR(20)   NULL,
        CNIC                  NVARCHAR(22)   NULL,
        CAddress              NVARCHAR(250)  NULL,
        DeliveredTo           NVARCHAR(150)  NULL,
        PartyID               INT            NULL,
        PartyName             VARCHAR(100)   NULL,

        -- Insurance / dep
        InsuranceCompanyname  VARCHAR(200)   NULL,
        ClaimNo               VARCHAR(200)   NULL,
        DepAmount             DECIMAL(18,2)  NULL,
        DepPartyName          VARCHAR(500)   NULL,

        -- Financials
        LabourAmount          DECIMAL(18,2)  NULL,
        SubletRepairAmount    DECIMAL(18,2)  NULL,
        SparesAmount          DECIMAL(18,2)  NULL,
        LubricantsAmount      DECIMAL(18,2)  NULL,
        NetAmount             DECIMAL(18,2)  NULL,
        NetPayable            DECIMAL(18,2)  NULL,
        Paid                  DECIMAL(18,2)  NULL,
        Balance               DECIMAL(18,2)  NULL,
        DiscountedAmount      DECIMAL(18,2)  NULL,

        -- Notes
        VoiceOfCustomer       NVARCHAR(200)  NULL,
        TA_Diagnosis          NVARCHAR(1000) NULL,
        JobCardOtherFinding   NVARCHAR(1000) NULL,

        ImportedAt            DATETIME       NOT NULL DEFAULT GETDATE()
    );

    -- Vehicle History search hits these three columns hardest.
    CREATE INDEX IX_LegacyJC_RegNo   ON dbo.Legacy_JobCards(RegistrationNumber);
    CREATE INDEX IX_LegacyJC_Chassis ON dbo.Legacy_JobCards(ChassisNumber);
    CREATE INDEX IX_LegacyJC_Engine  ON dbo.Legacy_JobCards(EngineNumber);
    CREATE INDEX IX_LegacyJC_Date    ON dbo.Legacy_JobCards(JobCardDate DESC);
END;

-- ---------- Legacy_JobCardLabour ---------------------------------------------
IF OBJECT_ID('dbo.Legacy_JobCardLabour', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Legacy_JobCardLabour (
        LegacyDetailID    BIGINT        NOT NULL PRIMARY KEY,  -- srvRepairOrderJobs.ID
        LegacyJobCardID   BIGINT        NOT NULL,              -- FK -> Legacy_JobCards.LegacyID
        JobDescription    NVARCHAR(150) NULL,
        Qty               DECIMAL(18,2) NULL,
        Rate              DECIMAL(18,2) NULL,
        DiscountedAmount  DECIMAL(18,2) NULL,
        NetRate           DECIMAL(18,2) NULL,
        TotalAmount       DECIMAL(18,2) NULL,
        PST               DECIMAL(18,2) NULL,
        JobPerformerName  VARCHAR(250)  NULL,
        BayNo             VARCHAR(50)   NULL,
        StartAt           DATETIME      NULL,
        EndedAt           DATETIME      NULL
    );
    CREATE INDEX IX_LegacyLab_JC ON dbo.Legacy_JobCardLabour(LegacyJobCardID);
END;

-- ---------- Legacy_JobCardParts ----------------------------------------------
IF OBJECT_ID('dbo.Legacy_JobCardParts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Legacy_JobCardParts (
        SIRDetailId        BIGINT        NOT NULL PRIMARY KEY,  -- prtSIRDetail.SIRDetailId
        LegacyJobCardID    BIGINT        NOT NULL,              -- FK -> Legacy_JobCards.LegacyID
        SIRId              BIGINT        NULL,
        ItemNumber         NVARCHAR(20)  NULL,
        ItemDescription    NVARCHAR(100) NULL,
        Qty                DECIMAL(18,2) NULL,
        SalesRate          DECIMAL(18,2) NULL,
        NetUnitRate        DECIMAL(18,2) NULL,
        TotalAmount        DECIMAL(18,2) NULL,
        TotalNetAmount     DECIMAL(18,2) NULL,
        SaleTaxAmount      DECIMAL(18,2) NULL
    );
    CREATE INDEX IX_LegacyParts_JC ON dbo.Legacy_JobCardParts(LegacyJobCardID);
END;

-- ---------- Legacy_JobCardSublets --------------------------------------------
IF OBJECT_ID('dbo.Legacy_JobCardSublets', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Legacy_JobCardSublets (
        SubletRepairDetailId BIGINT        NOT NULL PRIMARY KEY, -- srvRepairOrderSubLetRepairDetail
        LegacyJobCardID      BIGINT        NOT NULL,             -- FK -> Legacy_JobCards.LegacyID
        SubletRepairId       BIGINT        NULL,
        SupplierName         NVARCHAR(150) NULL,
        SupplierBillNo       NVARCHAR(50)  NULL,
        BillDate             DATETIME      NULL,
        RepairDescription    VARCHAR(100)  NULL,
        Quantity             DECIMAL(18,2) NULL,
        Rate                 MONEY         NULL,
        BillAmount           MONEY         NULL,
        BillCost             MONEY         NULL,
        Pst                  DECIMAL(18,2) NULL
    );
    CREATE INDEX IX_LegacySublet_JC ON dbo.Legacy_JobCardSublets(LegacyJobCardID);
END;

PRINT '091 done — legacy shadow tables ready.';
