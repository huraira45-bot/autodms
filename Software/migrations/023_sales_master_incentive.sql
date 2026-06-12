/*
 * Migration 023 — Sales Module Phase 0: Master incentive campaigns + accruals
 *
 * Source spec: .claude/planning/sales-module-design.md §15.2 + §15.3.
 *
 * Decision #12: Variant-baseline (already on dms_VehicleVariant) + campaign overlay.
 * Decision #24: Mandatory policy-letter upload before Status='Active'.
 * Decision #26: Three tax treatments live in TaxTreatment enum.
 * Decision #28: TaxTreatment set per-campaign (not per-invoice).
 *
 * Accrual rows live in dms_SalesIncentiveAccruals — one row per car per type
 * (standard, special, additional). Each row tagged with the booking + vehicle +
 * voucher line + contributing campaign IDs for full per-campaign drill-down.
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- dms_MasterIncentiveCampaigns — Special / Additional overlay over variant baseline
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_MasterIncentiveCampaigns')
BEGIN
    CREATE TABLE dbo.dms_MasterIncentiveCampaigns (
        CampaignID              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name                    NVARCHAR(200)  NOT NULL,
        IncentiveType           NVARCHAR(20)   NOT NULL,            -- 'Special' | 'Additional'
        AppliesToVariantID      INT            NULL,                -- NULL = applies model-wide or brand-wide
        AppliesToModelID        INT            NULL,                -- NULL with above-null = brand-wide
        AmountPerCar            DECIMAL(18,2)  NOT NULL,
        TaxTreatment            NVARCHAR(30)   NOT NULL DEFAULT N'NoTax',
        EffectiveFrom           DATE           NOT NULL,
        EffectiveTo             DATE           NULL,                -- NULL = open-ended
        PolicyDocumentID        INT            NULL,                -- FK to dms_SalesDocuments (DocType='MasterIncentivePolicyLetter')
        PolicyDocumentDescription NVARCHAR(500) NULL,
        Status                  NVARCHAR(20)   NOT NULL DEFAULT N'Draft',
        PostedByEmployeeID      INT            NULL,
        PostedByName            NVARCHAR(100)  NULL,
        PostedAt                DATETIME       NULL,
        CreatedAt               DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID     INT            NULL,
        CreatedByName           NVARCHAR(100)  NULL,
        ClosedAt                DATETIME       NULL,
        ClosedByEmployeeID      INT            NULL,
        ClosureNotes            NVARCHAR(MAX)  NULL,
        CONSTRAINT FK_MasterCampaigns_Variant FOREIGN KEY (AppliesToVariantID) REFERENCES dbo.dms_VehicleVariant(VariantID),
        CONSTRAINT FK_MasterCampaigns_Model   FOREIGN KEY (AppliesToModelID)   REFERENCES dbo.dms_VehicleModel(ModelID),
        CONSTRAINT FK_MasterCampaigns_Doc     FOREIGN KEY (PolicyDocumentID)   REFERENCES dbo.dms_SalesDocuments(DocumentID),
        CONSTRAINT CK_MasterCampaigns_Type    CHECK (IncentiveType IN (N'Special', N'Additional')),
        CONSTRAINT CK_MasterCampaigns_Status  CHECK (Status IN (N'Draft', N'Active', N'Closed')),
        CONSTRAINT CK_MasterCampaigns_TaxTreatment CHECK (
            TaxTreatment IN (N'NoTax', N'WHTWithheld', N'PlusGST_PrepayRequired', N'PlusGST_DeferredPay')
        ),
        CONSTRAINT CK_MasterCampaigns_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom),
        CONSTRAINT CK_MasterCampaigns_Amount   CHECK (AmountPerCar >= 0),
        -- Enforce decision #24: Active status requires PolicyDocumentID
        CONSTRAINT CK_MasterCampaigns_ActiveNeedsDoc CHECK (
            Status <> N'Active' OR PolicyDocumentID IS NOT NULL
        )
    );

    CREATE INDEX IX_MasterCampaigns_Lookup ON dbo.dms_MasterIncentiveCampaigns(Status, EffectiveFrom, EffectiveTo);
    CREATE INDEX IX_MasterCampaigns_Variant ON dbo.dms_MasterIncentiveCampaigns(AppliesToVariantID) WHERE AppliesToVariantID IS NOT NULL;
    CREATE INDEX IX_MasterCampaigns_Model ON dbo.dms_MasterIncentiveCampaigns(AppliesToModelID) WHERE AppliesToModelID IS NOT NULL;
END
GO

-- =========================================================================
-- dms_SalesIncentiveAccruals — one row per (booking, incentive-type, earner)
-- For Master incentives, EarnerType='Master', EarnerEmployeeID=NULL.
-- For sales-staff incentives, EarnerType='Employee', EarnerEmployeeID set.
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesIncentiveAccruals')
BEGIN
    CREATE TABLE dbo.dms_SalesIncentiveAccruals (
        AccrualID                   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID                   INT            NOT NULL,
        VehicleID                   INT            NULL,            -- set when allocated (Master accruals need VIN)
        EarnerType                  NVARCHAR(20)   NOT NULL,        -- 'Master' | 'Employee'
        EarnerEmployeeID            INT            NULL,            -- set when EarnerType='Employee'
        IncentiveCategory           NVARCHAR(20)   NOT NULL,        -- 'Standard' | 'Special' | 'Additional' | 'SalesStaff'
        AmountAccrued               DECIMAL(18,2)  NOT NULL,
        IncentiveBaseAmount         DECIMAL(18,2)  NULL,            -- the negotiated price for SalesStaff; standardincentive for Master
        TaxTreatment                NVARCHAR(30)   NULL,            -- Master-side only; null for sales-staff
        -- Source links
        AccrualVoucherID            INT            NULL,            -- soft link to data_FinanceVoucherInfo (VBV for staff, VIV for Master)
        AccrualVoucherNo            NVARCHAR(20)   NULL,
        PolicySnapshotJSON          NVARCHAR(MAX)  NULL,            -- snapshot of the policy/campaign at accrual time
        MasterCampaignIDsJSON       NVARCHAR(MAX)  NULL,            -- which campaigns contributed (Master accruals)
        SalesPolicyID               INT            NULL,            -- FK to dms_SalesIncentivePolicies (mig 024); soft for now
        -- Lifecycle
        Status                      NVARCHAR(20)   NOT NULL DEFAULT N'Accrued',
        AccruedAt                   DATETIME       NOT NULL DEFAULT GETDATE(),
        DisbursedAmount             DECIMAL(18,2)  NOT NULL DEFAULT 0,
        LastDisbursedAt             DATETIME       NULL,
        ReversedAt                  DATETIME       NULL,
        ReversalReason              NVARCHAR(MAX)  NULL,
        CONSTRAINT FK_Accruals_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT FK_Accruals_Vehicle FOREIGN KEY (VehicleID) REFERENCES dbo.dms_Vehicle(VehicleID),
        CONSTRAINT CK_Accruals_EarnerType CHECK (EarnerType IN (N'Master', N'Employee')),
        CONSTRAINT CK_Accruals_Category   CHECK (IncentiveCategory IN (N'Standard', N'Special', N'Additional', N'SalesStaff')),
        CONSTRAINT CK_Accruals_Status     CHECK (Status IN (N'Accrued', N'Reversed', N'Disbursed', N'PartiallyDisbursed')),
        CONSTRAINT CK_Accruals_Amount     CHECK (AmountAccrued >= 0 AND DisbursedAmount >= 0 AND DisbursedAmount <= AmountAccrued),
        -- Coherence: Employee earner requires EmployeeID; Master earner requires Category in (Standard/Special/Additional)
        CONSTRAINT CK_Accruals_Coherence CHECK (
            (EarnerType = N'Employee' AND EarnerEmployeeID IS NOT NULL AND IncentiveCategory = N'SalesStaff')
            OR
            (EarnerType = N'Master' AND IncentiveCategory IN (N'Standard', N'Special', N'Additional'))
        )
    );

    CREATE INDEX IX_Accruals_Booking   ON dbo.dms_SalesIncentiveAccruals(BookingID);
    CREATE INDEX IX_Accruals_Vehicle   ON dbo.dms_SalesIncentiveAccruals(VehicleID) WHERE VehicleID IS NOT NULL;
    CREATE INDEX IX_Accruals_Earner    ON dbo.dms_SalesIncentiveAccruals(EarnerType, EarnerEmployeeID);
    CREATE INDEX IX_Accruals_Status    ON dbo.dms_SalesIncentiveAccruals(Status) WHERE Status <> N'Disbursed';
    CREATE INDEX IX_Accruals_Voucher   ON dbo.dms_SalesIncentiveAccruals(AccrualVoucherID) WHERE AccrualVoucherID IS NOT NULL;
END
GO

-- =========================================================================
-- dms_MasterIncentiveReceipts — captures actual Master payment with tax detail
-- (§15.3 — receipt-time WHT capture, GST verification, certificate tracking)
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_MasterIncentiveReceipts')
BEGIN
    CREATE TABLE dbo.dms_MasterIncentiveReceipts (
        ReceiptID                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AccrualID                INT            NOT NULL,
        ReceiptVoucherID         INT            NULL,                -- soft link to data_FinanceVoucherInfo (BRV)
        ReceiptVoucherNo         NVARCHAR(20)   NULL,
        GrossAmount              DECIMAL(18,2)  NOT NULL,
        WHTAmount                DECIMAL(18,2)  NOT NULL DEFAULT 0,
        GSTOnIncentive           DECIMAL(18,2)  NOT NULL DEFAULT 0,
        NetCashReceived          DECIMAL(18,2)  NOT NULL,
        CertificateRef           NVARCHAR(100)  NULL,                -- WHT cert# if applicable
        CertificateDocumentID    INT            NULL,                -- FK to dms_SalesDocuments
        Status                   NVARCHAR(20)   NOT NULL DEFAULT N'Settled',
        CertificateReceivedAt    DATETIME       NULL,
        ReceivedAt               DATETIME       NOT NULL DEFAULT GETDATE(),
        ReceivedByEmployeeID     INT            NULL,
        ReceivedByName           NVARCHAR(100)  NULL,
        Notes                    NVARCHAR(MAX)  NULL,
        CONSTRAINT FK_MasterReceipts_Accrual  FOREIGN KEY (AccrualID)             REFERENCES dbo.dms_SalesIncentiveAccruals(AccrualID),
        CONSTRAINT FK_MasterReceipts_Cert     FOREIGN KEY (CertificateDocumentID) REFERENCES dbo.dms_SalesDocuments(DocumentID),
        CONSTRAINT CK_MasterReceipts_Status   CHECK (Status IN (N'PendingCert', N'CertReceived', N'Settled')),
        CONSTRAINT CK_MasterReceipts_Amounts  CHECK (
            GrossAmount > 0 AND WHTAmount >= 0 AND GSTOnIncentive >= 0
            AND NetCashReceived = GrossAmount - WHTAmount + GSTOnIncentive
        )
    );

    CREATE INDEX IX_MasterReceipts_Accrual ON dbo.dms_MasterIncentiveReceipts(AccrualID);
    CREATE INDEX IX_MasterReceipts_Pending ON dbo.dms_MasterIncentiveReceipts(Status) WHERE Status = N'PendingCert';
END
GO
