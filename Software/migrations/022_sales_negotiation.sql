/*
 * Migration 022 — Sales Module Phase 0: Negotiation approval workflow
 *
 * Source spec: .claude/planning/sales-module-design.md §10 + decisions #2, #14.
 *
 * Decision #14: ZERO threshold — every discount (>0) requires sales_admin_pricing
 * approval. Zero-discount bookings skip the approval gate entirely (no NegotiationRequest row).
 *
 * Decision #2: Once approved, the snapshot is immutable. Later policy/price
 * changes do not affect already-approved bookings — matches §14 tax-rate snapshot.
 *
 * One booking can have multiple NegotiationRequest rows over its life (each
 * resubmission after rejection creates a new row — full version history).
 * The booking's PriceApprovalID always points at the CURRENTLY active one.
 */

SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_NegotiationRequests')
BEGIN
    CREATE TABLE dbo.dms_NegotiationRequests (
        RequestID               INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID               INT            NOT NULL,
        StandardPrice           DECIMAL(18,2)  NOT NULL,            -- snapshot at request time
        ProposedPrice           DECIMAL(18,2)  NOT NULL,
        DiscountAmount          AS (StandardPrice - ProposedPrice) PERSISTED,
        DiscountPct             AS (CASE WHEN StandardPrice > 0
                                          THEN ((StandardPrice - ProposedPrice) / StandardPrice) * 100
                                          ELSE 0 END) PERSISTED,
        Reason                  NVARCHAR(MAX)  NOT NULL,            -- mandatory text from proposer
        Status                  NVARCHAR(20)   NOT NULL DEFAULT N'Pending',
        ProposerEmpID           INT            NOT NULL,
        ProposerName            NVARCHAR(100)  NULL,
        ProposedAt              DATETIME       NOT NULL DEFAULT GETDATE(),
        ApproverEmpID           INT            NULL,
        ApproverName            NVARCHAR(100)  NULL,
        ApproverComments        NVARCHAR(MAX)  NULL,
        DecidedAt               DATETIME       NULL,                -- set when approved or rejected
        EmailedAt               DATETIME       NULL,                -- notification fired to admin queue
        CONSTRAINT FK_NegotiationRequests_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT CK_NegotiationRequests_Status  CHECK (Status IN (N'Pending', N'Approved', N'Rejected', N'Withdrawn')),
        CONSTRAINT CK_NegotiationRequests_Prices  CHECK (
            StandardPrice > 0 AND ProposedPrice >= 0 AND ProposedPrice < StandardPrice
        ),
        CONSTRAINT CK_NegotiationRequests_Reason  CHECK (LEN(LTRIM(RTRIM(Reason))) >= 5)
    );

    CREATE INDEX IX_NegotiationRequests_Booking  ON dbo.dms_NegotiationRequests(BookingID, ProposedAt DESC);
    CREATE INDEX IX_NegotiationRequests_Status   ON dbo.dms_NegotiationRequests(Status, ProposedAt DESC) WHERE Status = N'Pending';
    CREATE INDEX IX_NegotiationRequests_Approver ON dbo.dms_NegotiationRequests(ApproverEmpID) WHERE ApproverEmpID IS NOT NULL;
END
GO

-- Back-FK: dms_SalesBookings.PriceApprovalID → dms_NegotiationRequests.RequestID
-- (Couldn't declare in mig 019 because this table didn't exist.)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SalesBookings_PriceApproval')
BEGIN
    ALTER TABLE dbo.dms_SalesBookings
        ADD CONSTRAINT FK_SalesBookings_PriceApproval FOREIGN KEY (PriceApprovalID)
            REFERENCES dbo.dms_NegotiationRequests(RequestID);
END
GO

-- =========================================================================
-- Guard: only one Pending row per booking at a time. (Filtered unique index.)
-- A booking can have many history rows but only one currently active request.
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_NegotiationRequests_OnePendingPerBooking')
BEGIN
    CREATE UNIQUE INDEX UX_NegotiationRequests_OnePendingPerBooking
        ON dbo.dms_NegotiationRequests(BookingID)
        WHERE Status = N'Pending';
END
GO
