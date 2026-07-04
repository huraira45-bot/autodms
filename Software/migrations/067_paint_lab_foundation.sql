-- ============================================================
-- 067_paint_lab_foundation.sql
-- Paint Lab — full foundation: master data + GRN/GRTN/Issue
-- headers/details + stock ledger + sequences + system accounts +
-- module permissions + party business mapping option.
--
-- Owner ask 2026-07-04: separate internal paint inventory and
-- costing module. Paint stays out of InventItems / Store Sale /
-- customer invoices. Paint Issue is internal costing only.
--
-- Idempotent: every CREATE TABLE / SEQUENCE / INSERT guarded so
-- re-running is safe.
-- ============================================================
SET QUOTED_IDENTIFIER ON;
GO

-- ------------------------------------------------------------
-- 1. MASTER DATA — separate from spare parts InventItems
-- ------------------------------------------------------------

-- Paint UOM
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_UOM')
BEGIN
    CREATE TABLE paint_UOM (
        PaintUOMID    INT IDENTITY(1,1) PRIMARY KEY,
        UOMName       NVARCHAR(50)  NOT NULL,
        Scale         DECIMAL(18,4) NOT NULL DEFAULT 1,
        IsActive      BIT           NOT NULL DEFAULT 1,
        CreatedAt     DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UX_paint_UOM_Name UNIQUE (UOMName)
    );
    -- Seed the ones the paint team uses in practice.
    INSERT INTO paint_UOM (UOMName, Scale) VALUES
        ('Litre', 1), ('ML', 0.001), ('Gallon', 3.785), ('Piece', 1), ('Kg', 1);
    PRINT 'paint_UOM created + seeded.';
END
GO

-- Paint Categories
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_Category')
BEGIN
    CREATE TABLE paint_Category (
        PaintCategoryID INT IDENTITY(1,1) PRIMARY KEY,
        CategoryName    NVARCHAR(100) NOT NULL,
        Description     NVARCHAR(500) NULL,
        IsActive        BIT           NOT NULL DEFAULT 1,
        CreatedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UX_paint_Category_Name UNIQUE (CategoryName)
    );
    INSERT INTO paint_Category (CategoryName) VALUES
        ('Base Coat'), ('Clear Coat'), ('Primer'), ('Hardener'), ('Thinner'), ('Additive');
    PRINT 'paint_Category created + seeded.';
END
GO

-- Paint Brands
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_Brand')
BEGIN
    CREATE TABLE paint_Brand (
        PaintBrandID INT IDENTITY(1,1) PRIMARY KEY,
        BrandName    NVARCHAR(100) NOT NULL,
        IsActive     BIT           NOT NULL DEFAULT 1,
        CreatedAt    DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UX_paint_Brand_Name UNIQUE (BrandName)
    );
    PRINT 'paint_Brand created.';
END
GO

-- Paint Warehouses
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_Warehouse')
BEGIN
    CREATE TABLE paint_Warehouse (
        PaintWHID       INT IDENTITY(1,1) PRIMARY KEY,
        WHCode          NVARCHAR(50)  NULL,
        WHDesc          NVARCHAR(200) NOT NULL,
        LocationAddress NVARCHAR(500) NULL,
        InActive        BIT           NOT NULL DEFAULT 0,
        CreatedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UX_paint_Warehouse_Code UNIQUE (WHCode)
    );
    INSERT INTO paint_Warehouse (WHCode, WHDesc) VALUES ('PAINT-01', 'Paint Store');
    PRINT 'paint_Warehouse created + default row seeded.';
END
GO

-- Paint Item Master
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_Item')
BEGIN
    CREATE TABLE paint_Item (
        PaintItemID     INT IDENTITY(1,1) PRIMARY KEY,
        PaintCode       NVARCHAR(50)  NOT NULL,
        PaintName       NVARCHAR(200) NOT NULL,
        PaintCategoryID INT           NULL,
        PaintBrandID    INT           NULL,
        PaintUOMID      INT           NULL,
        ReorderLevel    DECIMAL(18,3) NULL,
        -- Default GST toggle used when adding a line on GRN/Issue. Individual
        -- lines may override; this is only the starting value.
        GSTDefaultOn    BIT           NOT NULL DEFAULT 1,
        IsActive        BIT           NOT NULL DEFAULT 1,
        -- Running totals maintained by controllers (in transactions). Never
        -- update these directly outside the paint services.
        StockQty        DECIMAL(18,4) NOT NULL DEFAULT 0,
        AvgCost         DECIMAL(18,4) NOT NULL DEFAULT 0,
        StockValue      AS (CAST(StockQty * AvgCost AS DECIMAL(18,2))) PERSISTED,
        CreatedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
        UpdatedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UX_paint_Item_Code UNIQUE (PaintCode),
        CONSTRAINT FK_paint_Item_Category FOREIGN KEY (PaintCategoryID) REFERENCES paint_Category(PaintCategoryID),
        CONSTRAINT FK_paint_Item_Brand    FOREIGN KEY (PaintBrandID)    REFERENCES paint_Brand(PaintBrandID),
        CONSTRAINT FK_paint_Item_UOM      FOREIGN KEY (PaintUOMID)      REFERENCES paint_UOM(PaintUOMID)
    );
    CREATE INDEX IX_paint_Item_Name ON paint_Item(PaintName);
    PRINT 'paint_Item created.';
END
GO

-- ------------------------------------------------------------
-- 2. GRN — receiving from supplier
-- ------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_PaintGRNNo')
BEGIN
    CREATE SEQUENCE dbo.seq_PaintGRNNo AS INT START WITH 1 INCREMENT BY 1;
    PRINT 'seq_PaintGRNNo created.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_GRN')
BEGIN
    CREATE TABLE paint_GRN (
        PaintGRNID       INT IDENTITY(1,1) PRIMARY KEY,
        GRNNo            NVARCHAR(30)  NOT NULL,
        GRNDate          DATE          NOT NULL,
        PartyID          INT           NOT NULL,          -- gen_PartiesInfo
        SupplierBillNo   NVARCHAR(100) NULL,
        PaintWHID        INT           NOT NULL,
        Remarks          NVARCHAR(500) NULL,
        Status           NVARCHAR(20)  NOT NULL DEFAULT 'Draft',   -- Draft | Posted | Reversed
        SubTotal         DECIMAL(18,2) NOT NULL DEFAULT 0,
        DiscountTotal    DECIMAL(18,2) NOT NULL DEFAULT 0,
        GSTTotal         DECIMAL(18,2) NOT NULL DEFAULT 0,
        GrandTotal       DECIMAL(18,2) NOT NULL DEFAULT 0,
        VoucherID        INT           NULL,              -- GL voucher created on finalize
        CreatedBy        INT           NULL,
        CreatedByName    NVARCHAR(100) NULL,
        CreatedAt        DATETIME      NOT NULL DEFAULT GETDATE(),
        FinalizedBy      INT           NULL,
        FinalizedByName  NVARCHAR(100) NULL,
        FinalizedAt      DATETIME      NULL,
        CONSTRAINT UX_paint_GRN_No UNIQUE (GRNNo),
        CONSTRAINT FK_paint_GRN_Party FOREIGN KEY (PartyID) REFERENCES gen_PartiesInfo(PartyID),
        CONSTRAINT FK_paint_GRN_WH    FOREIGN KEY (PaintWHID) REFERENCES paint_Warehouse(PaintWHID),
        CONSTRAINT CK_paint_GRN_Status CHECK (Status IN ('Draft','Posted','Reversed'))
    );
    CREATE INDEX IX_paint_GRN_Party ON paint_GRN(PartyID, GRNDate DESC);
    PRINT 'paint_GRN created.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_GRNDetail')
BEGIN
    CREATE TABLE paint_GRNDetail (
        PaintGRNDetailID INT IDENTITY(1,1) PRIMARY KEY,
        PaintGRNID       INT           NOT NULL,
        PaintItemID      INT           NOT NULL,
        PaintUOMID       INT           NULL,
        Quantity         DECIMAL(18,4) NOT NULL,
        UnitRate         DECIMAL(18,4) NOT NULL,
        DiscountPct      DECIMAL(9,4)  NOT NULL DEFAULT 0,
        DiscountAmt      DECIMAL(18,2) NOT NULL DEFAULT 0,
        GSTOn            BIT           NOT NULL DEFAULT 1,
        GSTRate          DECIMAL(9,4)  NOT NULL DEFAULT 0,
        GSTAmount        DECIMAL(18,2) NOT NULL DEFAULT 0,
        LineTotal        DECIMAL(18,2) NOT NULL,           -- qty*rate - disc + gst
        LandedUnitCost   DECIMAL(18,4) NOT NULL DEFAULT 0, -- LineTotal / Quantity
        -- How much of this line's Quantity has already been returned via
        -- paint_GRTNDetail (source-doc restriction, decision below).
        ReturnedQty      DECIMAL(18,4) NOT NULL DEFAULT 0,
        CONSTRAINT FK_paint_GRND_Header FOREIGN KEY (PaintGRNID)  REFERENCES paint_GRN(PaintGRNID) ON DELETE CASCADE,
        CONSTRAINT FK_paint_GRND_Item   FOREIGN KEY (PaintItemID) REFERENCES paint_Item(PaintItemID),
        CONSTRAINT FK_paint_GRND_UOM    FOREIGN KEY (PaintUOMID)  REFERENCES paint_UOM(PaintUOMID)
    );
    CREATE INDEX IX_paint_GRND_Item ON paint_GRNDetail(PaintItemID);
    PRINT 'paint_GRNDetail created.';
END
GO

-- ------------------------------------------------------------
-- 3. GRTN — supplier return (must reference an original GRN)
-- ------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_PaintGRTNNo')
BEGIN
    CREATE SEQUENCE dbo.seq_PaintGRTNNo AS INT START WITH 1 INCREMENT BY 1;
    PRINT 'seq_PaintGRTNNo created.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_GRTN')
BEGIN
    CREATE TABLE paint_GRTN (
        PaintGRTNID      INT IDENTITY(1,1) PRIMARY KEY,
        GRTNNo           NVARCHAR(30)  NOT NULL,
        GRTNDate         DATE          NOT NULL,
        PartyID          INT           NOT NULL,
        SourcePaintGRNID INT           NOT NULL,
        PaintWHID        INT           NOT NULL,
        Remarks          NVARCHAR(500) NULL,
        Status           NVARCHAR(20)  NOT NULL DEFAULT 'Draft',
        SubTotal         DECIMAL(18,2) NOT NULL DEFAULT 0,
        GSTTotal         DECIMAL(18,2) NOT NULL DEFAULT 0,
        GrandTotal       DECIMAL(18,2) NOT NULL DEFAULT 0,
        VoucherID        INT           NULL,
        CreatedBy        INT           NULL,
        CreatedByName    NVARCHAR(100) NULL,
        CreatedAt        DATETIME      NOT NULL DEFAULT GETDATE(),
        FinalizedBy      INT           NULL,
        FinalizedByName  NVARCHAR(100) NULL,
        FinalizedAt      DATETIME      NULL,
        CONSTRAINT UX_paint_GRTN_No UNIQUE (GRTNNo),
        CONSTRAINT FK_paint_GRTN_Party FOREIGN KEY (PartyID) REFERENCES gen_PartiesInfo(PartyID),
        CONSTRAINT FK_paint_GRTN_Src   FOREIGN KEY (SourcePaintGRNID) REFERENCES paint_GRN(PaintGRNID),
        CONSTRAINT FK_paint_GRTN_WH    FOREIGN KEY (PaintWHID) REFERENCES paint_Warehouse(PaintWHID),
        CONSTRAINT CK_paint_GRTN_Status CHECK (Status IN ('Draft','Posted','Reversed'))
    );
    PRINT 'paint_GRTN created.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_GRTNDetail')
BEGIN
    CREATE TABLE paint_GRTNDetail (
        PaintGRTNDetailID   INT IDENTITY(1,1) PRIMARY KEY,
        PaintGRTNID         INT           NOT NULL,
        SourceGRNDetailID   INT           NOT NULL,
        PaintItemID         INT           NOT NULL,
        Quantity            DECIMAL(18,4) NOT NULL,
        -- Original per-unit cost from the source GRN line — used for the
        -- reversal so the average cost math nets out.
        OriginalUnitCost    DECIMAL(18,4) NOT NULL,
        LineTotal           DECIMAL(18,2) NOT NULL,
        CONSTRAINT FK_paint_GRTND_Hdr  FOREIGN KEY (PaintGRTNID)       REFERENCES paint_GRTN(PaintGRTNID) ON DELETE CASCADE,
        CONSTRAINT FK_paint_GRTND_Src  FOREIGN KEY (SourceGRNDetailID) REFERENCES paint_GRNDetail(PaintGRNDetailID),
        CONSTRAINT FK_paint_GRTND_Item FOREIGN KEY (PaintItemID)       REFERENCES paint_Item(PaintItemID)
    );
    CREATE INDEX IX_paint_GRTND_Item ON paint_GRTNDetail(PaintItemID);
    PRINT 'paint_GRTNDetail created.';
END
GO

-- ------------------------------------------------------------
-- 4. Paint Issue — internal costing against a Job Card
-- ------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_PaintIssueNo')
BEGIN
    CREATE SEQUENCE dbo.seq_PaintIssueNo AS INT START WITH 1 INCREMENT BY 1;
    PRINT 'seq_PaintIssueNo created.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_Issue')
BEGIN
    CREATE TABLE paint_Issue (
        PaintIssueID    INT IDENTITY(1,1) PRIMARY KEY,
        IssueNo         NVARCHAR(30)  NOT NULL,
        IssueDate       DATE          NOT NULL,
        JobCardID       INT           NOT NULL,           -- Addata_JobCardInfo
        PaintWHID       INT           NOT NULL,
        Remarks         NVARCHAR(500) NULL,
        -- Total cost of the paint on this slip. Stock reduced immediately;
        -- GL voucher is deferred until the linked Job Card finalizes.
        TotalCost       DECIMAL(18,2) NOT NULL DEFAULT 0,
        Locked          BIT           NOT NULL DEFAULT 0,  -- Snapshot of JC.IsFinalized when refreshed
        CreatedBy       INT           NULL,
        CreatedByName   NVARCHAR(100) NULL,
        CreatedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
        UpdatedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UX_paint_Issue_No UNIQUE (IssueNo),
        CONSTRAINT FK_paint_Issue_JC FOREIGN KEY (JobCardID) REFERENCES Addata_JobCardInfo(JobCardId),
        CONSTRAINT FK_paint_Issue_WH FOREIGN KEY (PaintWHID) REFERENCES paint_Warehouse(PaintWHID)
    );
    CREATE INDEX IX_paint_Issue_JC ON paint_Issue(JobCardID);
    PRINT 'paint_Issue created.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_IssueDetail')
BEGIN
    CREATE TABLE paint_IssueDetail (
        PaintIssueDetailID INT IDENTITY(1,1) PRIMARY KEY,
        PaintIssueID       INT           NOT NULL,
        PaintItemID        INT           NOT NULL,
        PaintUOMID         INT           NULL,
        Quantity           DECIMAL(18,4) NOT NULL,
        -- Locked at issue time from paint_Item.AvgCost so edits/reverses use
        -- the exact same cost regardless of subsequent GRN activity.
        IssueUnitCost      DECIMAL(18,4) NOT NULL,
        LineTotal          DECIMAL(18,2) NOT NULL,
        CONSTRAINT FK_paint_IssueD_Hdr  FOREIGN KEY (PaintIssueID) REFERENCES paint_Issue(PaintIssueID) ON DELETE CASCADE,
        CONSTRAINT FK_paint_IssueD_Item FOREIGN KEY (PaintItemID)  REFERENCES paint_Item(PaintItemID),
        CONSTRAINT FK_paint_IssueD_UOM  FOREIGN KEY (PaintUOMID)   REFERENCES paint_UOM(PaintUOMID)
    );
    CREATE INDEX IX_paint_IssueD_Item ON paint_IssueDetail(PaintItemID);
    PRINT 'paint_IssueDetail created.';
END
GO

-- ------------------------------------------------------------
-- 5. Stock ledger — every movement, forever
-- ------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_StockLedger')
BEGIN
    CREATE TABLE paint_StockLedger (
        LedgerID        BIGINT IDENTITY(1,1) PRIMARY KEY,
        MovementAt      DATETIME      NOT NULL DEFAULT GETDATE(),
        PaintItemID     INT           NOT NULL,
        PaintWHID       INT           NOT NULL,
        SourceType      NVARCHAR(20)  NOT NULL,       -- GRN | GRTN | ISSUE | ISSUE_ADJ | ISSUE_DEL | JC_UNFIN
        SourceDocID     INT           NULL,           -- paint_GRN.PaintGRNID / paint_GRTN.PaintGRTNID / paint_Issue.PaintIssueID
        SourceDetailID  INT           NULL,           -- detail row PK for line-level tracing
        -- Signed: positive for stock in, negative for stock out. Callers must
        -- write already-signed values.
        QuantityDelta   DECIMAL(18,4) NOT NULL,
        UnitCost        DECIMAL(18,4) NOT NULL DEFAULT 0,
        ValueDelta      DECIMAL(18,2) NOT NULL DEFAULT 0,
        RunningQty      DECIMAL(18,4) NOT NULL,       -- snapshot immediately after this row
        RunningAvgCost  DECIMAL(18,4) NOT NULL,
        RunningValue    AS (CAST(RunningQty * RunningAvgCost AS DECIMAL(18,2))) PERSISTED,
        Note            NVARCHAR(200) NULL,
        CreatedBy       INT           NULL,
        CreatedByName   NVARCHAR(100) NULL,
        CONSTRAINT FK_paint_Ledger_Item FOREIGN KEY (PaintItemID) REFERENCES paint_Item(PaintItemID),
        CONSTRAINT FK_paint_Ledger_WH   FOREIGN KEY (PaintWHID)   REFERENCES paint_Warehouse(PaintWHID),
        CONSTRAINT CK_paint_Ledger_Source CHECK (SourceType IN ('GRN','GRTN','ISSUE','ISSUE_ADJ','ISSUE_DEL','JC_UNFIN'))
    );
    CREATE INDEX IX_paint_Ledger_Item   ON paint_StockLedger(PaintItemID, MovementAt DESC);
    CREATE INDEX IX_paint_Ledger_Source ON paint_StockLedger(SourceType, SourceDocID);
    PRINT 'paint_StockLedger created.';
END
GO

-- ------------------------------------------------------------
-- 6. Settings — allowed JC business types for Paint Issue
-- ------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='paint_AllowedBusinessType')
BEGIN
    CREATE TABLE paint_AllowedBusinessType (
        PaintABTID     INT IDENTITY(1,1) PRIMARY KEY,
        JobCardTypeId  INT           NOT NULL,        -- gen_JobCardType
        CreatedAt      DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UX_paint_ABT_Type UNIQUE (JobCardTypeId),
        CONSTRAINT FK_paint_ABT_Type FOREIGN KEY (JobCardTypeId) REFERENCES gen_JobCardType(JobCardTypeId)
    );
    -- Seed the two business types the owner named (B&P + CT). Best-effort
    -- resolve by CardCode; if the codes don't exist yet the admin can
    -- configure them later via Paint Settings.
    INSERT INTO paint_AllowedBusinessType (JobCardTypeId)
    SELECT JobCardTypeId FROM gen_JobCardType WHERE CardCode IN ('B&P', 'BP', 'BNP', 'CT')
      AND NOT EXISTS (SELECT 1 FROM paint_AllowedBusinessType z WHERE z.JobCardTypeId = gen_JobCardType.JobCardTypeId);
    PRINT 'paint_AllowedBusinessType created + seeded (B&P + CT best-effort).';
END
GO

-- ------------------------------------------------------------
-- 7. System accounts — Paint Inventory + Paint Consumption
-- ------------------------------------------------------------

-- Extend the RoleKey whitelist without dropping the existing values.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SystemAccounts_RoleKey')
    ALTER TABLE dms_SystemAccounts DROP CONSTRAINT CK_SystemAccounts_RoleKey;
GO

ALTER TABLE dms_SystemAccounts ADD CONSTRAINT CK_SystemAccounts_RoleKey CHECK (
    RoleKey IN (
        'CASH_BOOK','GENERAL_CUSTOMER','GST_PAYABLE','INPUT_GST','PST_PAYABLE',
        'POS_CLEARING','DEFAULT_DISCOUNT_GIVEN','ROUNDING_ADJUSTMENT',
        'PURCHASE_RETURN_VARIANCE','CUSTOMER_ADVANCE_RECEIVED','SUPPLIER_ADVANCE_PAID',
        'CHEQUES_ON_HAND','CHEQUES_ISSUED_UNCLEARED',
        'VEHICLE_INVENTORY','BOOKING_RECEIVABLE','BOOKING_ADVANCE',
        'BOOKING_VARIANT_RECEIVABLE','PREMIUM_DEFERRED',
        'MASTER_VEHICLE_PAYABLE','MASTER_INCENTIVE_RECEIVABLE','STAFF_INCENTIVE_PAYABLE',
        'VEHICLE_SALES_REVENUE','PREMIUM_INCOME','MASTER_INCENTIVE_INCOME',
        'COGS_VEHICLES','STAFF_INCENTIVE_EXPENSE','SALES_DISCOUNT_GIVEN',
        'INVENTORY_PARTS','PARTS_REVENUE','SERVICE_REVENUE','SUBLET_REVENUE',
        'COGS_PARTS','SUBLET_COST','TRADE_DEBTORS','TRADE_CREDITORS',
        -- Paint Lab (owner ask 2026-07-04):
        'PAINT_INVENTORY','PAINT_CONSUMPTION'
    )
);
GO

-- Paint Lab system-account rows are NOT auto-assigned to a specific GLCAID
-- here — the accountant picks the correct COA leaf in Accounting Setup after
-- deploy. The controllers throw a clear error if the mapping is missing.

-- ------------------------------------------------------------
-- 8. RBAC — module permissions
-- ------------------------------------------------------------

DECLARE @admin INT = 1;    -- admin group by convention (same seed used elsewhere)
DECLARE @perms TABLE (K NVARCHAR(50));
INSERT INTO @perms VALUES
    ('paint_lab_dashboard'), ('paint_lab_items'),
    ('paint_lab_grn'),       ('paint_lab_grtn'),
    ('paint_lab_issue'),     ('paint_lab_reports'),
    ('paint_lab_settings');

-- For each key, seed view/insert/edit/delete flavors to the admin group.
INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
SELECT @admin, k FROM (
    SELECT K + ':view'   AS k FROM @perms UNION ALL
    SELECT K + ':insert' AS k FROM @perms UNION ALL
    SELECT K + ':edit'   AS k FROM @perms UNION ALL
    SELECT K + ':delete' AS k FROM @perms
) x
WHERE NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions p
    WHERE p.GroupID = @admin AND p.PermissionKey = x.k
);
-- Also the bare workflow key (view-only fallback used by the ERP shell).
INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
SELECT @admin, pp.K FROM @perms pp
WHERE NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions dp
    WHERE dp.GroupID = @admin AND dp.PermissionKey = pp.K
);
GO

-- ------------------------------------------------------------
-- 9. Party business mapping — expose PAINT_LAB as a business
-- ------------------------------------------------------------
-- Nothing to CREATE — dms_PartyBusinessAccess already exists. The
-- partyController's `valid` whitelist is extended in code (see
-- partyController.js). Supplier mapping is a runtime data concern; no seed
-- required beyond expanding the whitelist.

PRINT '067_paint_lab_foundation complete.';
GO
