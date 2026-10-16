-- Permanent before/after trail for edits made through the voucher APIs.
-- No FK: retain evidence when an edited draft voucher is later deleted.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.dms_VoucherEditHistory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_VoucherEditHistory (
        EditID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        VoucherID INT NOT NULL,
        VoucherNo NVARCHAR(50) NULL,
        Action NVARCHAR(40) NOT NULL,
        Reason NVARCHAR(500) NULL,
        ChangedBy INT NOT NULL,
        ChangedByName NVARCHAR(100) NOT NULL,
        ChangedAt DATETIME2(3) NOT NULL CONSTRAINT DF_VoucherEditHistory_At DEFAULT SYSUTCDATETIME(),
        BeforeJSON NVARCHAR(MAX) NOT NULL,
        AfterJSON NVARCHAR(MAX) NOT NULL,
        CONSTRAINT CK_VoucherEditHistory_JSON CHECK (ISJSON(BeforeJSON)=1 AND ISJSON(AfterJSON)=1)
    );
    CREATE INDEX IX_VoucherEditHistory_Voucher ON dbo.dms_VoucherEditHistory(VoucherID, EditID DESC);
    CREATE INDEX IX_VoucherEditHistory_At ON dbo.dms_VoucherEditHistory(ChangedAt DESC, EditID DESC);

    -- Preserve existing date-only evidence. No historical amounts/lines can
    -- be reconstructed from this older table, so label these records clearly.
    IF OBJECT_ID('dbo.dms_VoucherDateChanges', 'U') IS NOT NULL
        INSERT INTO dbo.dms_VoucherEditHistory
            (VoucherID, VoucherNo, Action, Reason, ChangedBy, ChangedByName, ChangedAt, BeforeJSON, AfterJSON)
        SELECT VoucherID, VoucherNo, 'LEGACY_DATE_CHANGE', Reason,
               ISNULL(ChangedBy,0), ISNULL(ChangedByName,'Unknown (legacy date log)'), ChangedAt,
               (SELECT OldDate AS [Header.VoucherDate], VoucherNo AS [Header.VoucherNo],
                       VoucherStatus AS [Header.Status] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
               (SELECT NewDate AS [Header.VoucherDate], VoucherNo AS [Header.VoucherNo],
                       VoucherStatus AS [Header.Status] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM dbo.dms_VoucherDateChanges;
END;

IF OBJECT_ID('dbo.trg_VoucherEditHistory_AppendOnly', 'TR') IS NULL
    EXEC('CREATE TRIGGER dbo.trg_VoucherEditHistory_AppendOnly
          ON dbo.dms_VoucherEditHistory INSTEAD OF UPDATE, DELETE
          AS BEGIN
              SET NOCOUNT ON;
              THROW 51000, ''Voucher edit history cannot be changed or deleted.'', 1;
          END');

COMMIT TRANSACTION;
