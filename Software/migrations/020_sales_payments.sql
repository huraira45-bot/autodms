/*
 * Migration 020 — Sales Module Phase 0: Per-booking payment ledger
 *
 * Source spec: .claude/planning/sales-module-design.md §11 (Payment Intake Flows).
 *
 * Two payment paths (decision #5):
 *   - PaymentPath='Direct'   — money hits our cash/bank/POS/cheques-on-hand
 *   - PaymentPath='PayOrder' — customer pays Master directly; we never touch cash
 *
 * Each payment row will eventually link to a VBV voucher (data_FinanceVoucherInfo)
 * once the posting service exists. The voucher ID is captured here as a soft link
 * for the audit trail.
 *
 * Premium portion is tagged on each payment line — it gets segregated in the
 * booking row (PremiumAmount column) for the §18 delivery posting.
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- dms_SalesPayments — every payment touching a booking
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesPayments')
BEGIN
    CREATE TABLE dbo.dms_SalesPayments (
        PaymentID                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID                INT            NOT NULL,
        PaymentPath              NVARCHAR(20)   NOT NULL,
        PaymentMode              NVARCHAR(30)   NOT NULL,            -- 'Cash', 'BankTransfer', 'Cheque', 'POS', 'PayOrder'
        Amount                   DECIMAL(18,2)  NOT NULL,
        PremiumPortion           DECIMAL(18,2)  NOT NULL DEFAULT 0,  -- portion of Amount that's a premium (recognized at delivery)
        ReceivedAt               DATETIME       NOT NULL DEFAULT GETDATE(),
        -- Direct-path-only fields
        BankAccountID            INT            NULL,                -- FK to dms_BankAccounts when BankTransfer/Cheque
        ChequeNumber             NVARCHAR(50)   NULL,
        ChequeDate               DATE           NULL,
        POSTransactionRef        NVARCHAR(100)  NULL,
        -- PayOrder-path-only fields
        PayOrderNumber           NVARCHAR(50)   NULL,
        PayOrderBankName         NVARCHAR(100)  NULL,
        -- Voucher link (soft) — populated when the VBV posting service fires
        VoucherID                INT            NULL,                -- FK to data_FinanceVoucherInfo (soft link)
        VoucherNo                NVARCHAR(20)   NULL,                -- denormalized for audit/UI
        Status                   NVARCHAR(20)   NOT NULL DEFAULT N'Posted',  -- 'Posted' | 'Reversed'
        ReversedAt               DATETIME       NULL,
        ReversedByEmployeeID     INT            NULL,
        ReversalReason           NVARCHAR(MAX)  NULL,
        -- Audit
        ReceivedByEmployeeID     INT            NULL,
        ReceivedByName           NVARCHAR(100)  NULL,
        CreatedAt                DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID      INT            NULL,
        Notes                    NVARCHAR(MAX)  NULL,
        CONSTRAINT FK_SalesPayments_Booking FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT CK_SalesPayments_Path    CHECK (PaymentPath IN (N'Direct', N'PayOrder')),
        CONSTRAINT CK_SalesPayments_Mode    CHECK (PaymentMode IN (N'Cash', N'BankTransfer', N'Cheque', N'POS', N'PayOrder')),
        CONSTRAINT CK_SalesPayments_Status  CHECK (Status IN (N'Posted', N'Reversed')),
        CONSTRAINT CK_SalesPayments_Amount  CHECK (Amount > 0 AND PremiumPortion >= 0 AND PremiumPortion <= Amount),
        -- Path/mode coherence: PayOrder path → PayOrder mode; Direct path → not PayOrder
        CONSTRAINT CK_SalesPayments_PathMode CHECK (
            (PaymentPath = N'PayOrder' AND PaymentMode = N'PayOrder')
            OR
            (PaymentPath = N'Direct'   AND PaymentMode IN (N'Cash', N'BankTransfer', N'Cheque', N'POS'))
        )
    );

    CREATE INDEX IX_SalesPayments_Booking      ON dbo.dms_SalesPayments(BookingID, ReceivedAt DESC);
    CREATE INDEX IX_SalesPayments_Voucher      ON dbo.dms_SalesPayments(VoucherID) WHERE VoucherID IS NOT NULL;
    CREATE INDEX IX_SalesPayments_Status       ON dbo.dms_SalesPayments(Status) WHERE Status <> N'Posted';
END
GO

-- =========================================================================
-- Trigger to keep dms_SalesBookings.AmountPaidToDate in sync after every
-- INSERT/UPDATE/DELETE on dms_SalesPayments. Recomputes from scratch — small
-- N (a booking rarely has > 20 payments), so cost is negligible.
-- =========================================================================
IF OBJECT_ID('dbo.tr_SalesPayments_UpdateBookingPaid', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_SalesPayments_UpdateBookingPaid;
GO

CREATE TRIGGER dbo.tr_SalesPayments_UpdateBookingPaid
ON dbo.dms_SalesPayments
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Affected bookings = union of inserted + deleted (covers all DML)
    DECLARE @affected TABLE (BookingID INT PRIMARY KEY);
    INSERT INTO @affected SELECT BookingID FROM inserted UNION SELECT BookingID FROM deleted;

    UPDATE b
       SET AmountPaidToDate = ISNULL((
                SELECT SUM(Amount) FROM dbo.dms_SalesPayments
                WHERE BookingID = b.BookingID AND Status = N'Posted'
           ), 0),
           PremiumAmount = ISNULL((
                SELECT SUM(PremiumPortion) FROM dbo.dms_SalesPayments
                WHERE BookingID = b.BookingID AND Status = N'Posted'
           ), 0)
      FROM dbo.dms_SalesBookings b
      WHERE b.BookingID IN (SELECT BookingID FROM @affected);
END
GO
