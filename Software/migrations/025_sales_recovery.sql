/*
 * Migration 025 — Sales Module Phase 0: Recovery system
 *
 * Source spec: .claude/planning/sales-module-design.md §20.
 *
 * Created only for bookings with AllowPartialDelivery=1. At GatePass issuance
 * for those bookings, the recovery plan must exist or the gate-pass posting
 * service refuses (enforced in controller).
 *
 * Installments stored as JSON for v1 simplicity. Per-installment status
 * (Scheduled/Paid/Overdue/Waived) is updated by the daily recovery cron and
 * by manual recovery-officer actions.
 */

SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesRecoveryPlans')
BEGIN
    CREATE TABLE dbo.dms_SalesRecoveryPlans (
        RecoveryPlanID              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID                   INT            NOT NULL,
        TotalRemainingAtDelivery    DECIMAL(18,2)  NOT NULL,
        InstallmentsJSON            NVARCHAR(MAX)  NOT NULL,  -- [{dueDate, amountDue, status, paidVoucherID, paidAt}, ...]
        OwnerEmployeeID             INT            NULL,      -- recovery officer
        OwnerName                   NVARCHAR(100)  NULL,
        Status                      NVARCHAR(20)   NOT NULL DEFAULT N'Active',
        CreatedAt                   DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID         INT            NULL,
        CreatedByName               NVARCHAR(100)  NULL,
        FullyRecoveredAt            DATETIME       NULL,
        WrittenOffAt                DATETIME       NULL,
        WriteOffApprovedByEmployeeID INT           NULL,
        WriteOffReason              NVARCHAR(MAX)  NULL,
        WriteOffVoucherID           INT            NULL,      -- soft link to data_FinanceVoucherInfo
        CONSTRAINT FK_SalesRecovery_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT CK_SalesRecovery_Status  CHECK (Status IN (N'Active', N'FullyRecovered', N'WrittenOff')),
        CONSTRAINT CK_SalesRecovery_Amount  CHECK (TotalRemainingAtDelivery > 0)
    );

    CREATE INDEX IX_SalesRecovery_Owner   ON dbo.dms_SalesRecoveryPlans(OwnerEmployeeID, Status) WHERE Status = N'Active';
    CREATE INDEX IX_SalesRecovery_Booking ON dbo.dms_SalesRecoveryPlans(BookingID);
END
GO

-- One active recovery plan per booking
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_SalesRecovery_OneActivePerBooking')
BEGIN
    CREATE UNIQUE INDEX UX_SalesRecovery_OneActivePerBooking
        ON dbo.dms_SalesRecoveryPlans(BookingID)
        WHERE Status = N'Active';
END
GO
