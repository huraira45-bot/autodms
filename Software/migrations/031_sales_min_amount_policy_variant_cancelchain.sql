/*
 * Migration 031 — Sales Phase 5 part 2: three workflow rule changes
 *
 * User-requested changes (2026-05-16):
 *   1. Booking minimum amount: each Variant has a MinimumBookingAmount that
 *      must be received before the booking is "confirmed" — until then no
 *      negotiation/allocation/etc. is possible.
 *   2. Cancellation discipline: after minimum payment received, cancelling a
 *      booking goes through the same §14 finalization loop (Executive proposes
 *      → AM approves → Admin executes). Adds two new booking states.
 *   3. Per-variant incentive policies: a policy can be scoped to a specific
 *      VariantID so the same employee can earn different incentives on
 *      different variants.
 *
 * Note on proof-of-payment file upload: no schema change needed — the existing
 * dms_SalesDocuments table already has DocType='ProofOfPayment' and
 * LinkedPaymentID columns. Controller-layer enforcement only.
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- 1. Variant.MinimumBookingAmount
-- =========================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.dms_VehicleVariant') AND name = 'MinimumBookingAmount'
)
BEGIN
    ALTER TABLE dbo.dms_VehicleVariant
        ADD MinimumBookingAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_VehicleVariant_MinBook DEFAULT 0;
END
GO

-- =========================================================================
-- 2. Policy.VariantID (NULL = applies to all variants; per-variant rate overrides)
-- =========================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.dms_SalesIncentivePolicies') AND name = 'VariantID'
)
BEGIN
    ALTER TABLE dbo.dms_SalesIncentivePolicies
        ADD VariantID INT NULL
        CONSTRAINT FK_SalesPolicy_Variant FOREIGN KEY (VariantID) REFERENCES dbo.dms_VehicleVariant(VariantID);
END
GO

-- Filtered index — speeds up the "policy where (variant=X or null)" lookup
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalesPolicy_Variant')
BEGIN
    CREATE INDEX IX_SalesPolicy_Variant
        ON dbo.dms_SalesIncentivePolicies(VariantID)
        WHERE VariantID IS NOT NULL;
END
GO

-- =========================================================================
-- 3. Booking new states + cancellation approval audit
-- =========================================================================

-- The existing CHECK constraint on Status enumerates allowed values; drop it,
-- add the two new states (PendingBookingPayment, PendingCancelApproval, CancellationApproved),
-- then re-create.
DECLARE @ckName NVARCHAR(200);
SELECT @ckName = name FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('dbo.dms_SalesBookings') AND name = 'CK_SalesBookings_Status';
IF @ckName IS NOT NULL
BEGIN
    EXEC ('ALTER TABLE dbo.dms_SalesBookings DROP CONSTRAINT ' + @ckName);
END
GO

ALTER TABLE dbo.dms_SalesBookings
    ADD CONSTRAINT CK_SalesBookings_Status CHECK (Status IN (
        N'Draft', N'PendingBookingPayment', N'BookingConfirmed',
        N'PendingApproval', N'PendingPayment',
        N'Allocated', N'MasterInvoicePending', N'MasterInvoicePosted',
        N'ReadyForDelivery', N'DeliveryApproved', N'GatePassIssued',
        N'PendingCancelApproval', N'CancellationApproved',
        N'Closed', N'Cancelled'
    ));
GO

-- Cancellation audit table (analogous to the §14 unfinalize-request pattern)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesBookingCancellations')
BEGIN
    CREATE TABLE dbo.dms_SalesBookingCancellations (
        CancellationID         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID              INT            NOT NULL,
        Status                 NVARCHAR(20)   NOT NULL DEFAULT N'Pending',
        -- Stage 1: Executive proposes
        ProposerEmployeeID     INT            NOT NULL,
        ProposerName           NVARCHAR(100)  NULL,
        ProposalReason         NVARCHAR(MAX)  NOT NULL,
        ProposedAt             DATETIME       NOT NULL DEFAULT GETDATE(),
        -- Stage 2: AM (Account Manager) approves or rejects
        AMEmployeeID           INT            NULL,
        AMName                 NVARCHAR(100)  NULL,
        AMDecision             NVARCHAR(20)   NULL,            -- 'Approved' | 'Rejected'
        AMComments             NVARCHAR(MAX)  NULL,
        AMDecidedAt            DATETIME       NULL,
        -- Stage 3: Admin executes (refund logic, accrual reversal, etc.)
        AdminEmployeeID        INT            NULL,
        AdminName              NVARCHAR(100)  NULL,
        AdminNotes             NVARCHAR(MAX)  NULL,
        ExecutedAt             DATETIME       NULL,
        RefundAmount           DECIMAL(18,2)  NULL,
        RefundVoucherID        INT            NULL,            -- soft-link to data_FinanceVoucherInfo
        CONSTRAINT FK_SalesBookingCancellations_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT CK_SalesBookingCancellations_Status CHECK (Status IN (
            N'Pending', N'AMApproved', N'AMRejected', N'Executed', N'Withdrawn'
        )),
        CONSTRAINT CK_SalesBookingCancellations_AMDecision CHECK (
            AMDecision IS NULL OR AMDecision IN (N'Approved', N'Rejected')
        )
    );

    CREATE INDEX IX_SalesBookingCancellations_Booking ON dbo.dms_SalesBookingCancellations(BookingID, ProposedAt DESC);
    CREATE INDEX IX_SalesBookingCancellations_Status  ON dbo.dms_SalesBookingCancellations(Status) WHERE Status = N'Pending';

    -- Only ONE Pending cancellation request per booking at a time
    CREATE UNIQUE INDEX UX_SalesBookingCancellations_OnePendingPerBooking
        ON dbo.dms_SalesBookingCancellations(BookingID)
        WHERE Status IN (N'Pending', N'AMApproved');
END
GO
