-- 044_audit_recovery_hierarchy.sql
-- Sales module phase 2 — adds:
--   1. dms_SalesAuditLog        — generic state-transition + approval audit (§23)
--   2. dms_SalesRecoveryInstallments — indexed side-table for aging queries
--                                      (parent dms_SalesRecoveryPlans already exists)

-- =========================================================================
-- 1. Sales Audit Log
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='dms_SalesAuditLog')
BEGIN
    CREATE TABLE dms_SalesAuditLog (
        AuditID         BIGINT IDENTITY(1,1) PRIMARY KEY,
        BookingID       INT          NULL,
        EntityType      NVARCHAR(40) NOT NULL,
        EntityID        INT          NOT NULL,
        Action          NVARCHAR(60) NOT NULL,
        OldValue        NVARCHAR(MAX) NULL,
        NewValue        NVARCHAR(MAX) NULL,
        ActorEmployeeID INT          NULL,
        ActorName       NVARCHAR(100) NULL,
        ActorUserID     INT          NULL,
        At              DATETIME     NOT NULL CONSTRAINT DF_SalesAudit_At DEFAULT GETDATE(),
        Notes           NVARCHAR(500) NULL
    );
    CREATE INDEX IX_SalesAudit_Booking ON dms_SalesAuditLog (BookingID, At DESC);
    CREATE INDEX IX_SalesAudit_Entity  ON dms_SalesAuditLog (EntityType, EntityID, At DESC);
    PRINT 'dms_SalesAuditLog created.';
END
ELSE PRINT 'dms_SalesAuditLog already exists.';
GO

-- =========================================================================
-- 2. Recovery installments side-table (parent dms_SalesRecoveryPlans exists)
-- Each row is one installment; cron + aging reports query this directly.
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='dms_SalesRecoveryInstallments')
BEGIN
    CREATE TABLE dms_SalesRecoveryInstallments (
        InstallmentID    INT IDENTITY(1,1) PRIMARY KEY,
        RecoveryPlanID   INT NOT NULL,
        BookingID        INT NOT NULL,
        SeqNo            INT NOT NULL,
        DueDate          DATE NOT NULL,
        AmountDue        DECIMAL(18,2) NOT NULL,
        AmountPaid       DECIMAL(18,2) NOT NULL CONSTRAINT DF_RecInst_AmountPaid DEFAULT 0,
        Status           NVARCHAR(20) NOT NULL CONSTRAINT DF_RecInst_Status DEFAULT 'Pending',
        PaidVoucherID    INT NULL,
        PaidVoucherNo    NVARCHAR(50) NULL,
        LastReminderAt   DATETIME NULL,
        Notes            NVARCHAR(500) NULL,
        CreatedAt        DATETIME NOT NULL CONSTRAINT DF_RecInst_CreatedAt DEFAULT GETDATE(),

        CONSTRAINT FK_RecInst_Plan    FOREIGN KEY (RecoveryPlanID) REFERENCES dms_SalesRecoveryPlans(RecoveryPlanID),
        CONSTRAINT FK_RecInst_Booking FOREIGN KEY (BookingID)      REFERENCES dms_SalesBookings(BookingID),
        CONSTRAINT CHK_RecInst_Status CHECK (Status IN ('Pending','PartiallyPaid','Paid','Overdue','WrittenOff')),
        CONSTRAINT CHK_RecInst_Amounts CHECK (AmountDue > 0 AND AmountPaid >= 0 AND AmountPaid <= AmountDue + 0.01)
    );
    CREATE INDEX IX_RecInst_Plan    ON dms_SalesRecoveryInstallments (RecoveryPlanID, SeqNo);
    CREATE INDEX IX_RecInst_Due     ON dms_SalesRecoveryInstallments (DueDate)
        WHERE Status IN ('Pending','PartiallyPaid','Overdue');
    CREATE INDEX IX_RecInst_Booking ON dms_SalesRecoveryInstallments (BookingID);
    PRINT 'dms_SalesRecoveryInstallments created.';
END
ELSE PRINT 'dms_SalesRecoveryInstallments already exists.';
GO

PRINT '044_audit_recovery_hierarchy applied.';
