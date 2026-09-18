-- =============================================================================
-- 138: Sales payment void — approval loop
--
-- Owner ask 2026-09-18: a payment recorded by mistake must not be undone on
-- the spot. It follows the same three stages as a booking cancellation and a
-- job card unfinalize:
--
--   Pending (whoever spotted it) -> AMApproved (Accounts Manager) -> Executed (Admin)
--   Side-states: AMRejected, Withdrawn
--
-- Nothing happens to the payment, the booking's paid total or the GL until the
-- admin executes the final step. Amount / VoucherID / VoucherNo are snapshotted
-- on the request so the queue still reads correctly after the voucher is gone.
--
-- No new permission keys: this reuses am_approve (AM) and admin_unfinalize /
-- sales_admin_settings (execute), exactly like the cancellation queue.
-- =============================================================================
SET NOCOUNT ON;

IF OBJECT_ID('dbo.dms_SalesPaymentVoidRequests', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_SalesPaymentVoidRequests (
        VoidID              INT IDENTITY(1,1) PRIMARY KEY,
        PaymentID           INT           NOT NULL,
        BookingID           INT           NOT NULL,
        Amount              DECIMAL(18,2) NOT NULL,
        VoucherID           INT           NULL,
        VoucherNo           NVARCHAR(50)  NULL,
        Status              NVARCHAR(20)  NOT NULL CONSTRAINT DF_PaymentVoid_Status DEFAULT 'Pending',
        ProposerEmployeeID  INT           NULL,
        ProposerName        NVARCHAR(100) NULL,
        ProposalReason      NVARCHAR(MAX) NOT NULL,
        ProposedAt          DATETIME      NOT NULL CONSTRAINT DF_PaymentVoid_ProposedAt DEFAULT GETDATE(),
        AMEmployeeID        INT           NULL,
        AMName              NVARCHAR(100) NULL,
        AMDecision          NVARCHAR(20)  NULL,
        AMComments          NVARCHAR(MAX) NULL,
        AMDecidedAt         DATETIME      NULL,
        AdminEmployeeID     INT           NULL,
        AdminName           NVARCHAR(100) NULL,
        AdminNotes          NVARCHAR(MAX) NULL,
        ExecutedAt          DATETIME      NULL,
        VoucherAction       NVARCHAR(30)  NULL,
        CONSTRAINT CK_PaymentVoid_Status     CHECK (Status IN ('Pending','AMApproved','AMRejected','Executed','Withdrawn')),
        CONSTRAINT CK_PaymentVoid_AMDecision CHECK (AMDecision IS NULL OR AMDecision IN ('Approved','Rejected')),
        CONSTRAINT FK_PaymentVoid_Payment    FOREIGN KEY (PaymentID) REFERENCES dbo.dms_SalesPayments(PaymentID),
        CONSTRAINT FK_PaymentVoid_Booking    FOREIGN KEY (BookingID) REFERENCES dbo.dms_SalesBookings(BookingID)
    );

    -- One open request per payment — two people cannot queue the same void.
    CREATE UNIQUE INDEX UX_PaymentVoid_OpenPerPayment
        ON dbo.dms_SalesPaymentVoidRequests(PaymentID)
        WHERE Status IN ('Pending','AMApproved');
    CREATE INDEX IX_PaymentVoid_Status   ON dbo.dms_SalesPaymentVoidRequests(Status);
    CREATE INDEX IX_PaymentVoid_Booking  ON dbo.dms_SalesPaymentVoidRequests(BookingID);

    PRINT 'dms_SalesPaymentVoidRequests created.';
END
ELSE
    PRINT 'dms_SalesPaymentVoidRequests already exists — skipped.';
GO

PRINT '138 done — sales payment void approval loop ready.';
