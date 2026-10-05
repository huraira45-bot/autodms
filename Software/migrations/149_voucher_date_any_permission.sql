-- 149_voucher_date_any_permission.sql
-- Owner ask 2026-10-05: an admin must be able to change the date on ANY
-- voucher at any time. Until now only JVs could be re-dated freely;
-- CPV/CRV/BPV/BRV needed `finance_voucher_backdate` AND had to sit inside a
-- 30-day window, and reversing/reversed vouchers were refused outright.
--
-- The new `finance_voucher_date_any` permission lifts all of that. Because it
-- moves money documents between accounting periods with nothing else to stop
-- it, every date change — admin override or not — is now recorded.
-- Idempotent.
SET NOCOUNT ON;

IF OBJECT_ID('dms_VoucherDateChanges') IS NULL
BEGIN
    CREATE TABLE dms_VoucherDateChanges (
        ChangeID          INT IDENTITY(1,1) PRIMARY KEY,
        VoucherID         INT NOT NULL,
        VoucherNo         NVARCHAR(50)  NULL,
        VoucherType       NVARCHAR(30)  NULL,
        VoucherStatus     NVARCHAR(20)  NULL,
        OldDate           DATETIME      NOT NULL,
        NewDate           DATETIME      NOT NULL,
        Reason            NVARCHAR(500) NULL,
        -- 1 when the change was only possible because of
        -- finance_voucher_date_any: outside the window, wrong type, a
        -- reversing voucher, or a voucher that is not Posted/Draft.
        UsedAdminOverride BIT           NOT NULL CONSTRAINT DF_VoucherDateChanges_Override DEFAULT 0,
        ChangedBy         INT           NULL,
        ChangedByName     NVARCHAR(100) NULL,
        ChangedAt         DATETIME      NOT NULL CONSTRAINT DF_VoucherDateChanges_At DEFAULT GETDATE()
    );
    CREATE INDEX IX_VoucherDateChanges_Voucher ON dms_VoucherDateChanges (VoucherID);
    CREATE INDEX IX_VoucherDateChanges_When    ON dms_VoucherDateChanges (ChangedAt DESC);
    PRINT 'Created dms_VoucherDateChanges.';
END
ELSE
    PRINT 'dms_VoucherDateChanges already exists.';

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'finance_voucher_date_any'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'finance_voucher_date_any');
    PRINT 'Granted finance_voucher_date_any to admin.';
END
ELSE
    PRINT 'finance_voucher_date_any already granted.';

PRINT '149_voucher_date_any_permission complete.';
