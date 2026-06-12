/*
 * Migration 018 — Sales Module Phase 0: Vehicle Catalog
 *
 * Source spec: .claude/planning/sales-module-design.md §8 + locked decisions #1, #9, #26.
 * Creates the three-level catalog: Model → Variant → Vehicle (per-VIN).
 *
 * Safe to re-run: every CREATE is IF NOT EXISTS guarded.
 *
 * Forward references:
 *   - dms_Vehicle.CurrentBookingID points at dms_SalesBookings.BookingID — that FK is added
 *     in migration 019 once the bookings table exists.
 *   - dms_Vehicle.MasterInvoiceVoucherID points at data_FinanceVoucherInfo — kept as plain INT
 *     in v1 since the voucher table is owned by §14 Accounting.
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- dms_VehicleModel  — top-level model (e.g. Changan Alsvin, Changan Karvaan)
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_VehicleModel')
BEGIN
    CREATE TABLE dbo.dms_VehicleModel (
        ModelID                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ModelCode              NVARCHAR(20)   NOT NULL,
        ModelName              NVARCHAR(200)  NOT NULL,
        BrandName              NVARCHAR(100)  NOT NULL DEFAULT N'Changan',
        IsActive               BIT            NOT NULL DEFAULT 1,
        CreatedAt              DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID    INT            NULL,
        CreatedByName          NVARCHAR(100)  NULL,
        UpdatedAt              DATETIME       NULL,
        UpdatedByEmployeeID    INT            NULL,
        UpdatedByName          NVARCHAR(100)  NULL,
        CONSTRAINT UQ_VehicleModel_Code UNIQUE (ModelCode)
    );

    CREATE INDEX IX_VehicleModel_Active ON dbo.dms_VehicleModel(IsActive) WHERE IsActive = 1;
END
GO

-- =========================================================================
-- dms_VehicleVariant  — trim / spec / pricing per Model
-- StandardIncentiveTaxTreatment is from decision #26.
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_VehicleVariant')
BEGIN
    CREATE TABLE dbo.dms_VehicleVariant (
        VariantID                       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ModelID                         INT            NOT NULL,
        VariantCode                     NVARCHAR(50)   NOT NULL,
        VariantName                     NVARCHAR(300)  NOT NULL,
        StandardPrice                   DECIMAL(18,2)  NOT NULL,
        WholesalePrice                  DECIMAL(18,2)  NOT NULL,
        StandardIncentiveAmount         DECIMAL(18,2)  NOT NULL DEFAULT 0,
        StandardIncentiveTaxTreatment   NVARCHAR(30)   NOT NULL DEFAULT N'NoTax',
        SpecsJSON                       NVARCHAR(MAX)  NULL,
        IsActive                        BIT            NOT NULL DEFAULT 1,
        EffectivePriceFrom              DATE           NULL,
        CreatedAt                       DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID             INT            NULL,
        CreatedByName                   NVARCHAR(100)  NULL,
        UpdatedAt                       DATETIME       NULL,
        UpdatedByEmployeeID             INT            NULL,
        UpdatedByName                   NVARCHAR(100)  NULL,
        CONSTRAINT FK_VehicleVariant_Model FOREIGN KEY (ModelID) REFERENCES dbo.dms_VehicleModel(ModelID),
        CONSTRAINT UQ_VehicleVariant_Code UNIQUE (VariantCode),
        CONSTRAINT CK_VehicleVariant_TaxTreatment CHECK (
            StandardIncentiveTaxTreatment IN (N'NoTax', N'WHTWithheld', N'PlusGST_PrepayRequired', N'PlusGST_DeferredPay')
        ),
        CONSTRAINT CK_VehicleVariant_Prices CHECK (
            StandardPrice >= 0 AND WholesalePrice >= 0 AND StandardIncentiveAmount >= 0
        )
    );

    CREATE INDEX IX_VehicleVariant_Model ON dbo.dms_VehicleVariant(ModelID, IsActive);
END
GO

-- =========================================================================
-- dms_Vehicle  — one row per physical chassis
-- Locked Decision #6: AllocationType  ∈ {Booked, OpenAllocation}
-- Locked Decision #9: Status drives the GL hook — only Booked vehicles get
-- Vehicle Inventory recognition; OpenAllocation are memo-only.
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_Vehicle')
BEGIN
    CREATE TABLE dbo.dms_Vehicle (
        VehicleID               INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        VariantID               INT            NOT NULL,
        ChasisNo                NVARCHAR(50)   NOT NULL,
        EngineNo                NVARCHAR(50)   NOT NULL,
        Color                   NVARCHAR(50)   NULL,
        ManufactureYear         INT            NULL,
        AllocationType          NVARCHAR(20)   NOT NULL DEFAULT N'Booked',
        Status                  NVARCHAR(20)   NOT NULL DEFAULT N'AtMaster',
        Location                NVARCHAR(100)  NULL,
        CurrentBookingID        INT            NULL,  -- FK added in migration 019
        MasterInvoiceVoucherID  INT            NULL,  -- soft-link to data_FinanceVoucherInfo
        ReceivedAt              DATETIME       NULL,
        ReceivedByEmployeeID    INT            NULL,
        SoldDeliveredAt         DATETIME       NULL,
        CreatedAt               DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID     INT            NULL,
        CreatedByName           NVARCHAR(100)  NULL,
        UpdatedAt               DATETIME       NULL,
        UpdatedByEmployeeID     INT            NULL,
        UpdatedByName           NVARCHAR(100)  NULL,
        CONSTRAINT FK_Vehicle_Variant   FOREIGN KEY (VariantID) REFERENCES dbo.dms_VehicleVariant(VariantID),
        CONSTRAINT UQ_Vehicle_Chasis    UNIQUE (ChasisNo),
        CONSTRAINT UQ_Vehicle_Engine    UNIQUE (EngineNo),
        CONSTRAINT CK_Vehicle_AllocType CHECK (AllocationType IN (N'Booked', N'OpenAllocation')),
        CONSTRAINT CK_Vehicle_Status    CHECK (Status IN (
            N'AtMaster', N'InTransit', N'AtDealer', N'Allocated',
            N'Delivered', N'Returned', N'Sold'
        ))
    );

    CREATE INDEX IX_Vehicle_Variant   ON dbo.dms_Vehicle(VariantID);
    CREATE INDEX IX_Vehicle_Status    ON dbo.dms_Vehicle(Status, AllocationType);
    CREATE INDEX IX_Vehicle_CurrentBooking ON dbo.dms_Vehicle(CurrentBookingID) WHERE CurrentBookingID IS NOT NULL;
END
GO
