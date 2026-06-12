/*
 * Migration 024 — Sales Module Phase 0: Sales-staff incentive policies + targets
 *
 * Source spec: .claude/planning/sales-module-design.md §3.2, §3.3, §3.1, §15.
 *
 * Decision #8: booking-time accrual + admin-discretionary disbursement.
 * Decision #10: base = NegotiatedPrice.
 * Decision #11: v1=no overrides (architecture supports v2 toggle without refactor).
 * Decision #19: targets stored at monthly + annual granularity.
 *
 * Policies are versioned via EffectiveFrom/EffectiveTo. Assignments link
 * employees to policies; sentinel EmployeeID = -1 means "all executives at this
 * hierarchy level" (used for default policies).
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- dms_SalesIncentivePolicies — flat or tiered payout per car/event
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesIncentivePolicies')
BEGIN
    CREATE TABLE dbo.dms_SalesIncentivePolicies (
        PolicyID                       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name                           NVARCHAR(200)  NOT NULL,
        RecognitionTrigger             NVARCHAR(40)   NOT NULL DEFAULT N'AT_BOOKING_SAVE',
        BaseType                       NVARCHAR(40)   NOT NULL,            -- 'FlatPerCar' | 'PercentOfNegotiatedPrice' | 'TieredOnNegotiatedPrice'
        BaseAmount                     DECIMAL(18,4)  NULL,                -- interpretation depends on BaseType (rupees or percent)
        TiersJSON                      NVARCHAR(MAX)  NULL,                -- [{floorAmount, rateOrFlat}, ...] when BaseType='Tiered'
        AppliesToHierarchyLevel        NVARCHAR(30)   NOT NULL,            -- 'SalesExecutive' | 'AGMSales' | 'GMSales' | 'CustomChainOverride'
        OverrideForReportingChain      BIT            NOT NULL DEFAULT 0,  -- v1 always 0; v2 toggle for chain overrides
        EffectiveFrom                  DATE           NOT NULL,
        EffectiveTo                    DATE           NULL,
        IsActive                       BIT            NOT NULL DEFAULT 1,
        CreatedAt                      DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID            INT            NULL,
        CreatedByName                  NVARCHAR(100)  NULL,
        CONSTRAINT CK_SalesPolicies_Trigger       CHECK (RecognitionTrigger IN (
            N'AT_BOOKING_SAVE', N'AT_FULL_PAYMENT', N'AT_MASTER_INVOICE_POSTED', N'AT_DELIVERY'
        )),
        CONSTRAINT CK_SalesPolicies_BaseType      CHECK (BaseType IN (
            N'FlatPerCar', N'PercentOfNegotiatedPrice', N'TieredOnNegotiatedPrice'
        )),
        CONSTRAINT CK_SalesPolicies_HierarchyLvl  CHECK (AppliesToHierarchyLevel IN (
            N'SalesExecutive', N'AGMSales', N'GMSales', N'CustomChainOverride'
        )),
        CONSTRAINT CK_SalesPolicies_DateRange     CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
    );

    CREATE INDEX IX_SalesPolicies_Lookup ON dbo.dms_SalesIncentivePolicies(AppliesToHierarchyLevel, IsActive, EffectiveFrom, EffectiveTo);
END
GO

-- Back-FK from dms_SalesIncentiveAccruals.SalesPolicyID → dms_SalesIncentivePolicies.PolicyID
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Accruals_SalesPolicy')
BEGIN
    ALTER TABLE dbo.dms_SalesIncentiveAccruals
        ADD CONSTRAINT FK_Accruals_SalesPolicy FOREIGN KEY (SalesPolicyID)
            REFERENCES dbo.dms_SalesIncentivePolicies(PolicyID);
END
GO

-- =========================================================================
-- dms_SalesIncentiveAssignments — which employees get which policies
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesIncentiveAssignments')
BEGIN
    CREATE TABLE dbo.dms_SalesIncentiveAssignments (
        AssignmentID            INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PolicyID                INT            NOT NULL,
        EmployeeID              INT            NOT NULL,        -- use -1 sentinel for "all employees at this hierarchy level"
        EffectiveFrom           DATE           NOT NULL,
        EffectiveTo             DATE           NULL,
        IsActive                BIT            NOT NULL DEFAULT 1,
        CreatedAt               DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID     INT            NULL,
        CreatedByName           NVARCHAR(100)  NULL,
        CONSTRAINT FK_Assignments_Policy FOREIGN KEY (PolicyID) REFERENCES dbo.dms_SalesIncentivePolicies(PolicyID),
        CONSTRAINT CK_Assignments_DateRange CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
    );

    CREATE INDEX IX_Assignments_Employee ON dbo.dms_SalesIncentiveAssignments(EmployeeID, IsActive, EffectiveFrom, EffectiveTo);
    CREATE INDEX IX_Assignments_Policy   ON dbo.dms_SalesIncentiveAssignments(PolicyID);
END
GO

-- =========================================================================
-- dms_SalesTargets — per-employee, per-period
-- Same employee can have multiple overlapping periods (monthly + annual stretch)
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesTargets')
BEGIN
    CREATE TABLE dbo.dms_SalesTargets (
        TargetID                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EmployeeID              INT            NOT NULL,
        PeriodType              NVARCHAR(20)   NOT NULL,        -- 'Monthly' | 'Quarterly' | 'Annual'
        PeriodStart             DATE           NOT NULL,
        PeriodEnd               DATE           NOT NULL,
        UnitsTarget             INT            NULL,
        RevenueTarget           DECIMAL(18,2)  NULL,
        AssignedByEmployeeID    INT            NULL,
        AssignedByName          NVARCHAR(100)  NULL,
        AssignedAt              DATETIME       NOT NULL DEFAULT GETDATE(),
        IsActive                BIT            NOT NULL DEFAULT 1,
        Notes                   NVARCHAR(MAX)  NULL,
        CONSTRAINT CK_SalesTargets_PeriodType CHECK (PeriodType IN (N'Monthly', N'Quarterly', N'Annual')),
        CONSTRAINT CK_SalesTargets_DateRange  CHECK (PeriodEnd > PeriodStart),
        CONSTRAINT CK_SalesTargets_HasAGoal   CHECK (UnitsTarget IS NOT NULL OR RevenueTarget IS NOT NULL)
    );

    CREATE INDEX IX_SalesTargets_Employee ON dbo.dms_SalesTargets(EmployeeID, PeriodStart);
    CREATE INDEX IX_SalesTargets_Period   ON dbo.dms_SalesTargets(PeriodType, PeriodStart);
END
GO

-- =========================================================================
-- dms_SalesHierarchyAssignments — marks who is at what level in the sales org
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesHierarchyAssignments')
BEGIN
    CREATE TABLE dbo.dms_SalesHierarchyAssignments (
        AssignmentID            INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EmployeeID              INT            NOT NULL,
        HierarchyRole           NVARCHAR(30)   NOT NULL,        -- 'GMSales' | 'AGMSales' | 'SalesExecutive'
        AssignedAt              DATETIME       NOT NULL DEFAULT GETDATE(),
        AssignedByEmployeeID    INT            NULL,
        UnassignedAt            DATETIME       NULL,            -- when role removed; null = current
        Notes                   NVARCHAR(MAX)  NULL,
        CONSTRAINT CK_SalesHierarchy_Role CHECK (HierarchyRole IN (N'GMSales', N'AGMSales', N'SalesExecutive'))
    );

    CREATE INDEX IX_SalesHierarchy_Employee ON dbo.dms_SalesHierarchyAssignments(EmployeeID) WHERE UnassignedAt IS NULL;
    CREATE INDEX IX_SalesHierarchy_Role     ON dbo.dms_SalesHierarchyAssignments(HierarchyRole) WHERE UnassignedAt IS NULL;
END
GO
