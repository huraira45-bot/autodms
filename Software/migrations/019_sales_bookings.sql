/*
 * Migration 019 — Sales Module Phase 0: Bookings + state transitions
 *
 * Source spec: .claude/planning/sales-module-design.md §6 (entity diagram),
 *              §11 (multi-vehicle bookings), §18 (state machine).
 *
 * Locked decisions enforced in schema:
 *   #1  catalog hierarchy        — FK to VariantID
 *   #2  NegotiatedPrice snapshot — column persists, immutable once approved
 *   #5  payment paths (Direct/PayOrder) — captured at payment-row level (mig 020)
 *   #6  AllocationType driven by Vehicle row — booking just stores the AllocatedVehicleID
 *   #13 AllowPartialDelivery flag + co-sign references
 *   #14 zero-threshold negotiation — state machine starts at PendingApproval if NegotiatedPrice < StandardPrice
 *   #15 one booking = one VIN. CorporatePONumber = free text in v1
 *
 * Also: ALTER on dms_CRO_Inquiries to add the sales-assignment columns from §5
 * + back-FK on dms_Vehicle.CurrentBookingID → dms_SalesBookings.BookingID.
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- dms_SalesBookings  — one booking = one VIN (decision #15)
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesBookings')
BEGIN
    CREATE TABLE dbo.dms_SalesBookings (
        BookingID                       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingNo                       NVARCHAR(20)   NOT NULL,            -- generated 'BK-YYYY-NNNN'
        PartyID                         INT            NOT NULL,            -- FK to gen_PartiesInfo
        VehicleModelID                  INT            NOT NULL,
        VehicleVariantID                INT            NOT NULL,
        AllocatedVehicleID              INT            NULL,                -- null until Sales Manager allocates a VIN
        StandardPrice                   DECIMAL(18,2)  NOT NULL,            -- snapshot at booking save
        NegotiatedPrice                 DECIMAL(18,2)  NOT NULL,            -- equals StandardPrice if no discount
        DiscountAmount                  AS (StandardPrice - NegotiatedPrice) PERSISTED,
        DiscountPct                     AS (CASE WHEN StandardPrice > 0
                                                 THEN ((StandardPrice - NegotiatedPrice) / StandardPrice) * 100
                                                 ELSE 0 END) PERSISTED,
        PriceApprovalID                 INT            NULL,                -- FK to dms_NegotiationRequests (mig 022)
        Status                          NVARCHAR(30)   NOT NULL DEFAULT N'Draft',
        AmountPaidToDate                DECIMAL(18,2)  NOT NULL DEFAULT 0,  -- denormalized for fast UI; rebuilt by trigger
        PremiumAmount                   DECIMAL(18,2)  NOT NULL DEFAULT 0,  -- per decision #18, recognized at delivery
        CorporatePONumber               NVARCHAR(100)  NULL,                -- free text per decision #15/#25
        AllowPartialDelivery            BIT            NOT NULL DEFAULT 0,
        PartialDeliveryReason           NVARCHAR(MAX)  NULL,
        PartialDeliveryApprovedByGM     INT            NULL,                -- EmployeeID
        PartialDeliveryApprovedByFinance INT           NULL,
        PartialDeliveryApprovedAt       DATETIME       NULL,
        DeliveredAt                     DATETIME       NULL,
        GatePassIssuedAt                DATETIME       NULL,
        ClosedAt                        DATETIME       NULL,
        CancelledAt                     DATETIME       NULL,
        CancellationReason              NVARCHAR(MAX)  NULL,
        CreatedBy_SalesExecutiveID      INT            NOT NULL,            -- EmployeeID — the assignee
        CreatedAt                       DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByName                   NVARCHAR(100)  NULL,
        UpdatedAt                       DATETIME       NULL,
        UpdatedByEmployeeID             INT            NULL,
        UpdatedByName                   NVARCHAR(100)  NULL,
        SourceInquiryID                 INT            NULL,                -- FK to dms_CRO_Inquiries when converted from CRO
        CONSTRAINT UQ_SalesBookings_No      UNIQUE (BookingNo),
        CONSTRAINT FK_SalesBookings_Party   FOREIGN KEY (PartyID)         REFERENCES dbo.gen_PartiesInfo(PartyID),
        CONSTRAINT FK_SalesBookings_Model   FOREIGN KEY (VehicleModelID)  REFERENCES dbo.dms_VehicleModel(ModelID),
        CONSTRAINT FK_SalesBookings_Variant FOREIGN KEY (VehicleVariantID)REFERENCES dbo.dms_VehicleVariant(VariantID),
        CONSTRAINT FK_SalesBookings_Vehicle FOREIGN KEY (AllocatedVehicleID) REFERENCES dbo.dms_Vehicle(VehicleID),
        CONSTRAINT CK_SalesBookings_Status  CHECK (Status IN (
            N'Draft', N'PendingApproval', N'PendingPayment', N'Allocated',
            N'MasterInvoicePending', N'MasterInvoicePosted', N'ReadyForDelivery',
            N'DeliveryApproved', N'GatePassIssued', N'Closed', N'Cancelled'
        )),
        CONSTRAINT CK_SalesBookings_Prices  CHECK (
            StandardPrice >= 0 AND NegotiatedPrice >= 0 AND NegotiatedPrice <= StandardPrice
        )
    );

    CREATE INDEX IX_SalesBookings_Party    ON dbo.dms_SalesBookings(PartyID);
    CREATE INDEX IX_SalesBookings_Status   ON dbo.dms_SalesBookings(Status, CreatedAt DESC);
    CREATE INDEX IX_SalesBookings_Executive ON dbo.dms_SalesBookings(CreatedBy_SalesExecutiveID);
    CREATE INDEX IX_SalesBookings_Variant  ON dbo.dms_SalesBookings(VehicleVariantID);
    CREATE INDEX IX_SalesBookings_Vehicle  ON dbo.dms_SalesBookings(AllocatedVehicleID) WHERE AllocatedVehicleID IS NOT NULL;
    CREATE INDEX IX_SalesBookings_CorpPO   ON dbo.dms_SalesBookings(CorporatePONumber) WHERE CorporatePONumber IS NOT NULL;
    CREATE INDEX IX_SalesBookings_Inquiry  ON dbo.dms_SalesBookings(SourceInquiryID) WHERE SourceInquiryID IS NOT NULL;
END
GO

-- =========================================================================
-- dms_BookingStateTransitions  — audit log for every state change
-- §18 of planning doc + §23 audit logging.
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_BookingStateTransitions')
BEGIN
    CREATE TABLE dbo.dms_BookingStateTransitions (
        TransitionID            INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID               INT            NOT NULL,
        FromState               NVARCHAR(30)   NOT NULL,
        ToState                 NVARCHAR(30)   NOT NULL,
        ActorEmployeeID         INT            NULL,
        ActorName               NVARCHAR(100)  NULL,
        ActorRole               NVARCHAR(50)   NULL,                -- e.g. 'SalesExecutive', 'sales_admin_pricing', 'GMSales'
        Reason                  NVARCHAR(MAX)  NULL,                -- mandatory for partial delivery + write-off transitions
        At                      DATETIME       NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_BookingStateTransitions_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID)
    );

    CREATE INDEX IX_BookingStateTransitions_Booking ON dbo.dms_BookingStateTransitions(BookingID, At);
END
GO

-- =========================================================================
-- Back-FK: dms_Vehicle.CurrentBookingID → dms_SalesBookings.BookingID
-- (Couldn't do this in 018 because the bookings table didn't exist yet.)
-- =========================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Vehicle_CurrentBooking'
)
BEGIN
    ALTER TABLE dbo.dms_Vehicle
        ADD CONSTRAINT FK_Vehicle_CurrentBooking FOREIGN KEY (CurrentBookingID)
            REFERENCES dbo.dms_SalesBookings(BookingID);
END
GO

-- =========================================================================
-- CRO Inquiry assignment columns (§5 CRO Integration Contract)
-- =========================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.dms_CRO_Inquiries') AND name = 'AssignedSalesExecutiveID'
)
BEGIN
    ALTER TABLE dbo.dms_CRO_Inquiries
        ADD AssignedSalesExecutiveID INT NULL,
            AssignmentNotes          NVARCHAR(500) NULL,
            AssignedAt               DATETIME NULL,
            AssignedByEmployeeID     INT NULL,
            SalesQueuedAt            DATETIME NULL;
END
GO

-- Back-FK from dms_SalesBookings.SourceInquiryID to dms_CRO_Inquiries (after column ensured)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SalesBookings_Inquiry')
BEGIN
    ALTER TABLE dbo.dms_SalesBookings
        ADD CONSTRAINT FK_SalesBookings_Inquiry FOREIGN KEY (SourceInquiryID)
            REFERENCES dbo.dms_CRO_Inquiries(InquiryID);
END
GO
