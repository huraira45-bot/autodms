-- 090_charity_foundation.sql
-- Owner ask 2026-07-18: track 1% of every receive-payment + 1% of any
-- manual voucher flagged as "charitable" — as a side ledger that never
-- touches the GL. This migration:
--   1. Creates dms_CharityTracking (idempotent)
--   2. Grants the new workflow permission `charity_view` to admin (group 1)
-- No FK from data_FinanceVoucherInfo back to this table and no trigger —
-- controllers are the sole writers so accounting screens are unaffected
-- even if this table is dropped.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CharityTracking')
BEGIN
    CREATE TABLE dms_CharityTracking (
        CharityID       INT IDENTITY(1,1) PRIMARY KEY,
        VoucherID       INT NOT NULL,
        SourceType      NVARCHAR(40) NOT NULL
            CHECK (SourceType IN ('RECEIVE_PAYMENT_1PCT', 'MANUAL_VOUCHER_1PCT')),
        VoucherAmount   DECIMAL(18,2) NOT NULL,
        CharityAmount   DECIMAL(18,2) NOT NULL,
        Note            NVARCHAR(500) NULL,
        CreatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
        CreatedBy       INT NULL,
        CreatedByName   NVARCHAR(100) NULL
    );
    CREATE INDEX IX_CharityTracking_VoucherID ON dms_CharityTracking (VoucherID);
    CREATE INDEX IX_CharityTracking_CreatedAt ON dms_CharityTracking (CreatedAt DESC);
    PRINT '090: created dms_CharityTracking.';
END
ELSE
    PRINT '090: dms_CharityTracking already present.';

IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions
               WHERE GroupID = 1 AND PermissionKey = 'charity_view')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'charity_view');
    PRINT '090: granted charity_view to admin.';
END
ELSE
    PRINT '090: charity_view already granted.';

PRINT '090_charity_foundation complete.';
